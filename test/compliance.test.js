import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../src/compliance.js';

const ready = (lead) => assert.equal(evaluate(lead).status, 'Review ready');
const only = (lead, reason) => {
  const r = evaluate(lead);
  assert.equal(r.status, 'Research only');
  if (reason) assert.ok(r.reasons.includes(reason), `expected reason ${reason}, got ${r.reasons}`);
};

const emailOK = {
  contact_channel: 'email', consent_basis: 'inferred', consent_evidence: 'web form 2026-06-01',
  caller_identity: 'Ctrl Alt Develop', sender_contact: 'hello@ctrlaltdevelop.io',
  unsubscribe: 'reply STOP', suppressed: false,
};

test('no channel => Research only', () => only({}, 'no_lawful_channel'));
test('suppressed always blocks even if otherwise valid', () =>
  only({ ...emailOK, suppressed: true }, 'suppressed'));
test('sheet-style suppressed string false does not block', () =>
  ready({ ...emailOK, suppressed: 'false' }));
test('sheet-style suppressed string true blocks', () =>
  only({ ...emailOK, suppressed: 'TRUE' }, 'suppressed'));

test('email with full consent + identity + unsubscribe => Review ready', () => ready(emailOK));
test('email missing consent_basis => Research only', () =>
  only({ ...emailOK, consent_basis: '' }, 'missing_consent'));
test('email with invalid consent_basis => Research only', () =>
  only({ ...emailOK, consent_basis: 'assumed' }, 'missing_consent'));
test('email missing unsubscribe => Research only', () =>
  only({ ...emailOK, unsubscribe: '' }, 'missing_unsubscribe'));
test('email missing sender contact => Research only', () =>
  only({ ...emailOK, sender_contact: '' }, 'missing_sender_identity'));
test('sms uses the same electronic-message rules', () =>
  ready({ ...emailOK, contact_channel: 'sms' }));

const formOK = {
  contact_channel: 'contact_form', contact_source: 'https://x.com/contact',
  contact_form_allowed_basis: 'public enquiry form, no marketing prohibition',
  contact_form_manual_only: true,
  caller_identity: 'Ctrl Alt Develop', sender_contact: 'hello@ctrlaltdevelop.io', suppressed: false,
};
test('contact form with source + allowed basis + identity => Review ready', () => ready(formOK));
test('contact form missing source URL => Research only', () =>
  only({ ...formOK, contact_source: '' }, 'missing_form_source'));
test('contact form missing allowed-use evidence => Research only', () =>
  only({ ...formOK, contact_form_allowed_basis: '' }, 'missing_form_allowed_basis'));
test('contact form must be manual-only, not automated submission => Research only', () =>
  only({ ...formOK, contact_form_manual_only: false }, 'automated_form_submission'));
test('contact form accepts sheet-style TRUE for manual-only flag', () =>
  ready({ ...formOK, contact_form_manual_only: 'TRUE' }));
test('contact form missing sender contact => Research only', () =>
  only({ ...formOK, sender_contact: '' }, 'missing_sender_identity'));

const phoneOK = {
  contact_channel: 'phone', dncr_checked_at: '2026-06-20', dncr_result: 'not listed',
  phone_consent_basis: 'existing-business inferred', telemarketing_compliance_status: 'compliant',
  caller_identity: 'Ctrl Alt Develop', phone_script_notes: 'intro + opt-out offer',
  do_not_call_note: 'offer opt-out and mark suppressed if requested', suppressed: false,
};
test('phone with full DNCR/telemarketing record => Review ready', () => ready(phoneOK));
test('phone missing DNCR check => Research only', () =>
  only({ ...phoneOK, dncr_checked_at: '' }, 'missing_dncr'));
test('phone missing consent basis => Research only', () =>
  only({ ...phoneOK, phone_consent_basis: '' }, 'missing_phone_consent'));
test('phone missing telemarketing status => Research only', () =>
  only({ ...phoneOK, telemarketing_compliance_status: '' }, 'missing_telemarketing_status'));
test('phone missing do-not-call note => Research only', () =>
  only({ ...phoneOK, do_not_call_note: '' }, 'missing_do_not_call_note'));
