import { filterNew } from './dedupe.js';
import { selectPending } from './discovery.js';
import { qualify } from './qualify.js';
import { score, priorityLabel } from './score.js';
import { evaluate } from './compliance.js';
import { draftForLead } from './draft.js';
import { PLACES_PAGE_SIZE } from './places.js';
import { humanizeReasons } from './evidence.js';

const nowIso = () => new Date().toISOString();

const RESUMABLE = new Set(['Discovered', 'Enriched', 'Needs PageSpeed', 'Qualified']);
const MANUAL_COMPLIANCE_FIELDS = [
  'contact_channel', 'contact_source', 'consent_basis', 'consent_evidence',
  'contact_form_allowed_basis', 'contact_form_manual_only', 'dncr_checked_at',
  'dncr_result', 'phone_consent_basis', 'telemarketing_compliance_status',
  'caller_identity', 'sender_contact', 'unsubscribe', 'phone_script_notes',
  'do_not_call_note',
];

function hasManualComplianceSignal(lead) {
  return MANUAL_COMPLIANCE_FIELDS.some((k) => (lead[k] || '').toString().trim());
}

function reasonsFromEvidence(lead) {
  return (lead.evidence_summary || '').split(',').map((s) => s.trim()).filter(Boolean);
}

function hasReusableQualification(lead) {
  const statusAllowsReuse = lead.status === 'Qualified'
    || (lead.status === 'Research only' && hasManualComplianceSignal(lead));
  return statusAllowsReuse && ['hot', 'warm'].includes(lead.qualification);
}

export async function runPipeline(deps) {
  const { caps, dryRun, log = () => {} } = deps;
  const summary = { discovered: 0, new: 0, hot: 0, warm: 0, drafted: 0, appended: 0,
    updated: 0, searches: 0, textSearches: 0, errors: 0 };

  const existingLeads = await deps.readLeads();
  const existingIds = new Set(existingLeads.map((l) => l.place_id));
  const pending = selectPending(await deps.readQueries());
  const toProcess = existingLeads.filter((l) =>
    RESUMABLE.has(l.status) || (l.status === 'Research only' && hasManualComplianceSignal(l)));

  for (const q of pending) {
    const isText = q.query_mode === 'text';
    if (!isText && summary.searches >= caps.searchNearby) {
      log('searchNearby cap reached, remaining nearby queries skipped');
      continue;
    }
    if (isText && summary.textSearches >= caps.searchText) {
      log('searchText cap reached, remaining text queries skipped');
      continue;
    }

    if (isText) summary.textSearches++;
    else summary.searches++;

    if (!dryRun) await deps.updateQuery({ ...q, status: 'Running', started_at: nowIso() });
    try {
      const center = { lat: Number(q.center_lat), lng: Number(q.center_lng) };
      const radius = Number(q.radius_m);
      const found = isText
        ? await deps.searchText({ apiKey: deps.apiKey, textQuery: q.text_query, center, radius })
        : await deps.searchNearby({ apiKey: deps.apiKey, includedTypes: [q.place_type], center, radius });
      summary.discovered += found.length;

      const fresh = filterNew(existingIds, found);
      fresh.forEach((f) => existingIds.add(f.place_id));
      summary.new += fresh.length;

      const staged = fresh.map((f) => ({ ...f, status: 'Discovered', first_seen_at: nowIso(), updated_at: nowIso() }));
      if (dryRun) {
        toProcess.push(...staged);
      } else if (staged.length) {
        const { startRow } = await deps.appendLeads(staged);
        summary.appended += staged.length;
        if (startRow == null) {
          log(`WARNING: appendLeads returned no startRow for ${staged.length} lead(s) - enrichment deferred to next run`);
        } else {
          staged.forEach((s, i) => { s._row = startRow + i; });
          toProcess.push(...staged);
        }
      }

      const capped = found.length >= PLACES_PAGE_SIZE;
      if (!dryRun) await deps.updateQuery({ ...q, status: capped ? 'Capped' : 'Completed',
        result_count: found.length, cap_hit: capped, completed_at: nowIso() });
    } catch (e) {
      summary.errors++;
      if (!dryRun) await deps.updateQuery({ ...q, status: 'Error', last_error: e.message });
    }
  }

  let enriched = 0, pageSpeeds = 0, drafts = 0;
  let detailsCapLogged = false, pagespeedCapLogged = false, draftsCapLogged = false;

  for (const lead of toProcess) {
    try {
      if (lead.status === 'Discovered') {
        if (enriched >= caps.placeDetails) {
          if (!detailsCapLogged) {
            log('placeDetails cap reached, remaining Discovered leads deferred');
            detailsCapLogged = true;
          }
          continue;
        }
        enriched++;
        Object.assign(lead, await deps.placeDetails(lead.place_id, deps.apiKey));
        lead.status = 'Enriched';
        lead.updated_at = nowIso();
        if (!dryRun && lead._row) { await deps.updateLead(lead); summary.updated++; }
      }

      let q = hasReusableQualification(lead)
        ? { qualification: lead.qualification, reasons: reasonsFromEvidence(lead) }
        : null;

      if (!q) {
        let pagespeed = null;
        if (lead.website_url) {
          if (pageSpeeds < caps.pagespeed) {
            pageSpeeds++;
            pagespeed = await deps.runPagespeed(lead.website_url, deps.apiKey);
          } else if (!pagespeedCapLogged) {
            log('pagespeed cap reached, remaining sites deferred (Needs PageSpeed)');
            pagespeedCapLogged = true;
          }
        }

        q = qualify(lead, pagespeed, deps.pagespeedCfg);
        lead.qualification = q.qualification;
        if (pagespeed) {
          lead.pagespeed_score = pagespeed.performanceScore ?? '';
          lead.lcp_ms = pagespeed.lcpMs ?? '';
          lead.failed_audits = (pagespeed.failedAudits || []).join(',');
        }
        lead.evidence_summary = humanizeReasons(q.reasons, lead).join(', ');
      }

      lead.priority = priorityLabel(q.qualification, q.qualification === 'warm' ? q.reasons.length : 0);
      lead.score = score(q, lead); // sort key for every lead, so the sheet ranks cleanly top-to-bottom

      if (q.qualification === 'hot' || q.qualification === 'broken') summary.hot++;
      else if (q.qualification === 'warm') summary.warm++;

      if (q.qualification === 'needs_pagespeed') {
        lead.status = 'Needs PageSpeed';
      } else if (q.qualification === 'dropped') {
        lead.status = 'Dropped';
      } else {
        const gate = evaluate(lead);
        lead.compliance_status = gate.status;
        if (gate.status === 'Review ready' && drafts < caps.drafts && !dryRun) {
          Object.assign(lead, await draftForLead(lead, { callLLM: deps.callLLM }));
          if (lead.draft_type === 'outreach') { summary.drafted++; drafts++; }
          lead.status = 'Review ready';
        } else if (gate.status === 'Review ready') {
          if (!dryRun && drafts >= caps.drafts && !draftsCapLogged) {
            log('draft cap reached, Review-ready leads left Qualified for the next run');
            draftsCapLogged = true;
          }
          lead.status = 'Qualified';
        } else {
          lead.status = 'Research only';
        }
      }

      lead.updated_at = nowIso();
      if (!dryRun && lead._row) { await deps.updateLead(lead); summary.updated++; }
    } catch (e) {
      summary.errors++;
      lead.status = 'Error';
      lead.last_error = e.message;
      lead.updated_at = nowIso();
      if (!dryRun && lead._row) await deps.updateLead(lead).catch(() => {});
    }
  }

  log(`run summary: ${JSON.stringify(summary)}`);
  return summary;
}
