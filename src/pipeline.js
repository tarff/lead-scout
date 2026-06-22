import { filterNew } from './dedupe.js';
import { selectPending } from './discovery.js';
import { qualify } from './qualify.js';
import { score } from './score.js';
import { evaluate } from './compliance.js';
import { draftForLead } from './draft.js';
import { PLACES_PAGE_SIZE } from './places.js';

const nowIso = () => new Date().toISOString();
// Leads not yet finished — picked up on resume.
const RESUMABLE = new Set(['Discovered', 'Enriched', 'Needs PageSpeed']);

export async function runPipeline(deps) {
  const { caps, dryRun, log = () => {} } = deps;
  const summary = { discovered: 0, new: 0, hot: 0, warm: 0, drafted: 0, appended: 0,
    updated: 0, searches: 0, errors: 0 };

  // --- 1. load state ---
  const existingLeads = await deps.readLeads();
  const existingIds = new Set(existingLeads.map((l) => l.place_id));
  const pending = selectPending(await deps.readQueries());
  const toProcess = existingLeads.filter((l) => RESUMABLE.has(l.status)); // resume unfinished

  // --- 2. discover → stage Discovered (before enrich) → checkpoint query ---
  for (const q of pending) {
    if (summary.searches >= caps.searchNearby) {
      log(`searchNearby cap reached, ${pending.length - summary.searches} queries skipped`); break;
    }
    summary.searches++;
    if (!dryRun) await deps.updateQuery({ ...q, status: 'Running', started_at: nowIso() });
    try {
      const found = await deps.searchNearby({ apiKey: deps.apiKey, includedTypes: [q.place_type],
        center: { lat: Number(q.center_lat), lng: Number(q.center_lng) }, radius: Number(q.radius_m) });
      summary.discovered += found.length;
      const fresh = filterNew(existingIds, found);
      fresh.forEach((f) => existingIds.add(f.place_id));
      summary.new += fresh.length;
      const staged = fresh.map((f) => ({ ...f, status: 'Discovered', first_seen_at: nowIso(), updated_at: nowIso() }));
      if (dryRun) {
        toProcess.push(...staged); // in-memory only, for the dry-run summary
      } else if (staged.length) {
        const { startRow } = await deps.appendLeads(staged); // STAGE before paid enrichment
        summary.appended += staged.length;
        if (startRow == null) {
          // No row numbers → we can't checkpoint/update these leads. Do NOT
          // enrich them now (that paid work couldn't be persisted and would be
          // re-billed); they're already in the sheet as Discovered and the next
          // run resumes them with correct row numbers via readLeads().
          log(`WARNING: appendLeads returned no startRow for ${staged.length} lead(s) — enrichment deferred to next run`);
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

  // --- 3. enrich → qualify → score → compliance → draft → update row (per-item isolated) ---
  let enriched = 0, pageSpeeds = 0, drafts = 0;
  let detailsCapLogged = false, pagespeedCapLogged = false, draftsCapLogged = false;
  for (const lead of toProcess) {
    try {
      if (lead.status === 'Discovered') {
        if (enriched >= caps.placeDetails) { // cap hit — leave Discovered, resume next run
          if (!detailsCapLogged) { log('placeDetails cap reached, remaining Discovered leads deferred'); detailsCapLogged = true; }
          continue;
        }
        enriched++;
        Object.assign(lead, await deps.placeDetails(lead.place_id, deps.apiKey));
        lead.status = 'Enriched';
      }
      let pagespeed = null;
      if (lead.website_url) {
        if (pageSpeeds < caps.pagespeed) { pageSpeeds++; pagespeed = await deps.runPagespeed(lead.website_url, deps.apiKey); }
        else if (!pagespeedCapLogged) { log('pagespeed cap reached, remaining sites deferred (Needs PageSpeed)'); pagespeedCapLogged = true; }
      }
      const q = qualify(lead, pagespeed, deps.pagespeedCfg);
      lead.qualification = q.qualification;
      lead.evidence_summary = q.reasons.join(', ');
      if (pagespeed) {
        lead.pagespeed_score = pagespeed.performanceScore ?? '';
        lead.lcp_ms = pagespeed.lcpMs ?? '';
        lead.failed_audits = (pagespeed.failedAudits || []).join(',');
      }
      if (q.qualification === 'hot') summary.hot++;
      else if (q.qualification === 'warm') summary.warm++;

      if (q.qualification === 'needs_pagespeed') {
        lead.status = 'Needs PageSpeed'; // pagespeed cap hit / no data yet — retried next run
      } else if (q.qualification === 'dropped') {
        lead.status = 'Dropped';
      } else {
        lead.score = score(q, lead);
        const gate = evaluate(lead);
        lead.compliance_status = gate.status;
        if (gate.status === 'Review ready' && drafts < caps.drafts && !dryRun) {
          Object.assign(lead, await draftForLead(lead, { callLLM: deps.callLLM }));
          if (lead.draft_type === 'outreach') { summary.drafted++; drafts++; }
          lead.status = 'Review ready';
        } else {
          if (gate.status === 'Review ready' && !dryRun && drafts >= caps.drafts && !draftsCapLogged) {
            log('drafts cap reached, remaining Review-ready leads deferred (status Drafted, no opener)'); draftsCapLogged = true;
          }
          lead.status = gate.status === 'Review ready' ? 'Drafted' : 'Research only';
        }
      }
      lead.updated_at = nowIso();
      if (!dryRun && lead._row) { await deps.updateLead(lead); summary.updated++; }
    } catch (e) {
      summary.errors++;
      lead.status = 'Error'; lead.last_error = e.message; lead.updated_at = nowIso();
      if (!dryRun && lead._row) await deps.updateLead(lead).catch(() => {});
    }
  }

  log(`run summary: ${JSON.stringify(summary)}`);
  return summary;
}
