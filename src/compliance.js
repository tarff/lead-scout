// Compliance keystone. Default Research only; Review ready only when the
// selected channel satisfies every rule in the design's decision table.
// Mirrors docs/plans/2026-06-22-prospecting-agent-design.md.
const has = (v) => typeof v === 'string' ? v.trim().length > 0 : !!v;
const isTrue = (v) => v === true || (typeof v === 'string' && v.trim().toLowerCase() === 'true');
const isFalse = (v) => v === false || (typeof v === 'string' && v.trim().toLowerCase() === 'false');
const VALID_CONSENT = new Set(['express', 'inferred']);

export function evaluate(lead) {
  const reasons = [];
  const research = () => ({ status: 'Research only', channel: lead.contact_channel || null, reasons });

  if (isTrue(lead.suppressed)) {
    reasons.push('suppressed');
    return research();
  }
  if (!isFalse(lead.suppressed)) reasons.push('missing_suppression_status');

  switch (lead.contact_channel) {
    case 'email':
    case 'sms':
    case 'dm': {
      if (!VALID_CONSENT.has(lead.consent_basis)) reasons.push('missing_consent');
      if (!has(lead.consent_evidence)) reasons.push('missing_consent_evidence');
      if (!has(lead.caller_identity) || !has(lead.sender_contact)) reasons.push('missing_sender_identity');
      if (!has(lead.unsubscribe)) reasons.push('missing_unsubscribe');
      break;
    }
    case 'contact_form': {
      if (!has(lead.contact_source)) reasons.push('missing_form_source');
      if (!has(lead.contact_form_allowed_basis)) reasons.push('missing_form_allowed_basis');
      if (!isTrue(lead.contact_form_manual_only)) reasons.push('automated_form_submission');
      if (!has(lead.caller_identity) || !has(lead.sender_contact)) reasons.push('missing_sender_identity');
      break;
    }
    case 'phone': {
      if (!has(lead.dncr_checked_at) || !has(lead.dncr_result)) reasons.push('missing_dncr');
      if (!has(lead.phone_consent_basis)) reasons.push('missing_phone_consent');
      if (!has(lead.telemarketing_compliance_status)) reasons.push('missing_telemarketing_status');
      if (!has(lead.caller_identity) || !has(lead.phone_script_notes)) reasons.push('missing_caller_identity');
      if (!has(lead.do_not_call_note)) reasons.push('missing_do_not_call_note');
      break;
    }
    case 'in_person': {
      // Face-to-face visits / flyer dropoffs are physical, non-electronic contact:
      // the Spam Act (email/SMS/DM) and the Do Not Call Register (telemarketing)
      // don't apply, so no consent record / unsubscribe / DNCR is required. The
      // keystone here is simply identifying yourself and giving a contact for
      // follow-up. (Don't close a paid deal on the spot — see ACL unsolicited
      // consumer agreement rules; the opener is written to invite a next step.)
      if (!has(lead.caller_identity) || !has(lead.sender_contact)) reasons.push('missing_sender_identity');
      break;
    }
    default:
      reasons.push('no_lawful_channel');
  }

  return reasons.length ? research()
    : { status: 'Review ready', channel: lead.contact_channel, reasons: [] };
}
