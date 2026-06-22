import { requestJson } from './http.js';
import { evaluate } from './compliance.js';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

function buildPrompt(lead) {
  return `Write ONE friendly, specific opening line (max 30 words) for a local web-design`
    + ` outreach to "${lead.business_name}". Reason they qualified: ${lead.qualification}`
    + ` (${(lead.evidence_summary || lead.qualification)}). No greeting, no sign-off, just the line.`;
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
    return { draft_type: 'internal_note', draft_opener: '',
      compliance_status: gate.status, last_error: '' , _reasons: gate.reasons };
  }
  const opener = await deps.callLLM(buildPrompt(lead));
  return { draft_type: 'outreach', draft_opener: opener, compliance_status: 'Review ready' };
}
