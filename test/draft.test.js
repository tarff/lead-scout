import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draftForLead } from '../src/draft.js';

const reviewReady = {
  business_name: 'Acme Plumbing', qualification: 'hot', contact_channel: 'email',
  consent_basis: 'inferred', consent_evidence: 'web form', caller_identity: 'Ctrl Alt Develop',
  sender_contact: 'hello@ctrlaltdevelop.io', unsubscribe: 'reply STOP', suppressed: false,
};

const callLLM = async () => 'Noticed Acme Plumbing has no site — keen to help?';

test('drafts outreach copy for a Review-ready lead', async () => {
  const r = await draftForLead(reviewReady, { callLLM });
  assert.equal(r.draft_type, 'outreach');
  assert.match(r.draft_opener, /Acme Plumbing/);
});

test('NEVER drafts outreach for a Research-only lead — internal note only', async () => {
  let llmCalled = false;
  const r = await draftForLead({ ...reviewReady, suppressed: true },
    { callLLM: async () => { llmCalled = true; return 'x'; } });
  assert.equal(r.draft_type, 'internal_note');
  assert.equal(r.draft_opener, '');
  assert.equal(llmCalled, false, 'must not call the LLM for non-review-ready leads');
});

test('missing channel => internal note, no LLM call', async () => {
  let llmCalled = false;
  const r = await draftForLead({ business_name: 'X', qualification: 'hot' },
    { callLLM: async () => { llmCalled = true; return 'x'; } });
  assert.equal(r.draft_type, 'internal_note');
  assert.equal(llmCalled, false);
});
