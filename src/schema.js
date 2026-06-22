// Column order + status enums - transcribed from the v1 design doc. The sheet
// header rows are written from these arrays so code and sheet never drift.
export const LEADS_COLUMNS = [
  'place_id', 'place_resource_name', 'business_name', 'primary_type', 'address',
  'website_url', 'phone', 'contact_channel', 'contact_source',
  'consent_basis', 'consent_evidence', 'compliance_status', 'suppressed',
  'dncr_checked_at', 'dncr_result', 'phone_consent_basis',
  'telemarketing_compliance_status', 'caller_identity', 'sender_contact',
  'unsubscribe', 'phone_script_notes', 'do_not_call_note',
  'contact_form_allowed_basis', 'contact_form_manual_only',
  'qualification', 'score', 'evidence_summary', 'pagespeed_score', 'lcp_ms',
  'failed_audits',
  'draft_type', 'draft_opener', 'status', 'contacted', 'contacted_at',
  'last_error', 'first_seen_at', 'updated_at',
];

export const DISCOVERY_COLUMNS = [
  'query_key', 'category', 'place_type', 'tile_id', 'rank_preference',
  'center_lat', 'center_lng', 'radius_m',
  'status', 'result_count', 'cap_hit', 'started_at', 'completed_at',
  'last_error', 'updated_at',
];

export const LEAD_STATUS = ['Discovered', 'Enriched', 'Needs PageSpeed',
  'Qualified', 'Drafted', 'Review ready', 'Dropped', 'Research only',
  'Contacted', 'Suppressed', 'Error'];

export const QUERY_STATUS = ['Pending', 'Running', 'Completed', 'Capped', 'Error'];
