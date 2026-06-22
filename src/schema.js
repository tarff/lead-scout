// Column order + status enums - transcribed from the v1 design doc. The sheet
// header rows are written from these arrays so code and sheet never drift.
// Order: the 9 columns a human works leads by come first; everything else is
// internal/compliance plumbing (load-bearing for resume) kept after and hidden
// in the sheet. Code keys by these snake_case names; the sheet shows the
// friendly HEADER_LABELS below.
export const LEADS_COLUMNS = [
  // --- working view (shown) ---
  'business_name', 'address', 'phone', 'website_url', 'primary_type',
  'evidence_summary', 'score', 'status', 'draft_opener',
  // --- internal (hidden) ---
  'place_id', 'place_resource_name', 'contact_channel', 'contact_source',
  'consent_basis', 'consent_evidence', 'compliance_status', 'suppressed',
  'dncr_checked_at', 'dncr_result', 'phone_consent_basis',
  'telemarketing_compliance_status', 'caller_identity', 'sender_contact',
  'unsubscribe', 'phone_script_notes', 'do_not_call_note',
  'contact_form_allowed_basis', 'contact_form_manual_only',
  'qualification', 'pagespeed_score', 'lcp_ms', 'failed_audits',
  'draft_type', 'contacted', 'contacted_at',
  'last_error', 'first_seen_at', 'updated_at',
];

// Number of leading LEADS_COLUMNS kept visible; the rest are hidden in the sheet.
export const LEADS_VISIBLE_COUNT = 9;

// Friendly sheet header labels (key -> label). The sheet header row is written
// from these; reads are translated back to keys via labelRowToKeys.
export const HEADER_LABELS = {
  business_name: 'Business Name', address: 'Address', phone: 'Phone',
  website_url: 'Website', primary_type: 'Business Type',
  evidence_summary: 'Why It Qualified', score: 'Score', status: 'Status',
  draft_opener: 'Draft Opener',
  place_id: 'Place ID', place_resource_name: 'Place Resource Name',
  contact_channel: 'Contact Channel', contact_source: 'Contact Source',
  consent_basis: 'Consent Basis', consent_evidence: 'Consent Evidence',
  compliance_status: 'Compliance Status', suppressed: 'Suppressed',
  dncr_checked_at: 'DNCR Checked At', dncr_result: 'DNCR Result',
  phone_consent_basis: 'Phone Consent Basis',
  telemarketing_compliance_status: 'Telemarketing Compliance Status',
  caller_identity: 'Caller Identity', sender_contact: 'Sender Contact',
  unsubscribe: 'Unsubscribe', phone_script_notes: 'Phone Script Notes',
  do_not_call_note: 'Do Not Call Note',
  contact_form_allowed_basis: 'Contact Form Allowed Basis',
  contact_form_manual_only: 'Contact Form Manual Only',
  qualification: 'Qualification', pagespeed_score: 'PageSpeed Score',
  lcp_ms: 'Largest Contentful Paint (ms)', failed_audits: 'Failed Audits',
  draft_type: 'Draft Type', contacted: 'Contacted', contacted_at: 'Contacted At',
  last_error: 'Last Error', first_seen_at: 'First Seen At', updated_at: 'Updated At',
};

// The friendly header row to write, in LEADS_COLUMNS order.
export const LEADS_HEADER_ROW = LEADS_COLUMNS.map((k) => HEADER_LABELS[k] ?? k);

// Translate a row object keyed by friendly labels back to snake_case keys, so
// the pipeline reads leads in the same shape it writes them.
const LABEL_TO_KEY = Object.fromEntries(Object.entries(HEADER_LABELS).map(([k, v]) => [v, k]));
export function labelRowToKeys(obj) {
  const out = {};
  for (const [label, value] of Object.entries(obj)) out[LABEL_TO_KEY[label] ?? label] = value;
  return out;
}

export const DISCOVERY_COLUMNS = [
  'query_key', 'category', 'place_type', 'tile_id', 'rank_preference',
  'center_lat', 'center_lng', 'radius_m',
  'status', 'result_count', 'cap_hit', 'started_at', 'completed_at',
  'last_error', 'updated_at', 'query_mode', 'text_query',
];

export const LEAD_STATUS = ['Discovered', 'Enriched', 'Needs PageSpeed',
  'Qualified', 'Drafted', 'Review ready', 'Dropped', 'Research only',
  'Contacted', 'Suppressed', 'Error'];

export const QUERY_STATUS = ['Pending', 'Running', 'Completed', 'Capped', 'Error'];
