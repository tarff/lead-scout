import { requestJson } from './http.js';
import { evaluate } from './compliance.js';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

function buildPrompt(lead) {
  const reason = lead.evidence_summary || lead.qualification;
  if (lead.contact_channel === 'in_person') {
    // Spoken icebreaker for a walk-in. Invites a low-pressure next step rather
    // than closing on the spot, keeping it clear of ACL unsolicited-agreement rules.
    return `Write a short, friendly SPOKEN opener (max 45 words) for ${lead.caller_identity || 'a local web designer'}`
      + ` walking in to introduce a local web-design service to "${lead.business_name}".`
      + ` Reference this issue with their website: ${reason}.`
      + ` End by inviting a low-pressure next step (offer to show a quick before/after, or book a time later) —`
      + ` do NOT try to close a sale on the spot. Just the spoken words: no greeting label, no sign-off.`;
  }
  return `Write ONE friendly, specific opening line (max 30 words) for a local web-design`
    + ` outreach to "${lead.business_name}". Reason they qualified: ${lead.qualification}`
    + ` (${reason}). No greeting, no sign-off, just the line.`;
}

export async function defaultCallLLM(prompt, { apiKey, model }, opts = {}) {
  const data = await requestJson(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: 80 }),
  }, opts);
  return data.choices?.[0]?.message?.content?.trim() || '';
}

// Gate: outreach copy ONLY for Review-ready leads. Everyone else gets an
// internal note and the LLM is never called.
export async function draftForLead(lead, deps) {
  const gate = evaluate(lead);
  if (gate.status !== 'Review ready') {
    // Internal note only — never outreach copy, LLM never called. (In the
    // pipeline, non-ready leads are handled by its own else-branch, so this
    // path is exercised mainly by unit tests / direct callers.)
    return { draft_type: 'internal_note', draft_opener: '', compliance_status: gate.status };
  }
  const opener = await deps.callLLM(buildPrompt(lead));
  return { draft_type: 'outreach', draft_opener: opener, compliance_status: 'Review ready' };
}
