import { requestJson } from './http.js';

const ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

export function normalizePagespeed(resp) {
  const lr = resp?.lighthouseResult;
  if (!lr) return { performanceScore: null, lcpMs: null, failedAudits: [] };
  const score = lr.categories?.performance?.score;
  const lcp = lr.audits?.['largest-contentful-paint']?.numericValue;
  const failedAudits = Object.entries(lr.audits || {})
    .filter(([, a]) => a && a.score === 0)
    .map(([id]) => id);
  return {
    performanceScore: score == null ? null : Math.round(score * 100),
    lcpMs: lcp == null ? null : Math.round(lcp),
    failedAudits,
  };
}

// Lighthouse runtime error codes that mean "the page itself would not load"
// (dead domain, server down, DNS failure) — a property of the target site, not a
// bug in our run. These come back as an HTTP 400 from the PageSpeed API. We treat
// them as a qualifying signal ("unreachable"), not a crash. Other failures
// (timeouts, 429, 5xx, quota) still throw so the run surfaces them as before.
const LOAD_FAILURE = /FAILED_DOCUMENT_REQUEST|ERRORED_DOCUMENT_REQUEST|NO_DOCUMENT_REQUEST|DNS_FAILURE/;
const UNREACHABLE = { performanceScore: null, lcpMs: null, failedAudits: [], unreachable: true };

export async function runPagespeed(url, apiKey, opts = {}) {
  const u = new URL(ENDPOINT);
  u.searchParams.set('url', url);
  u.searchParams.set('strategy', 'mobile');
  for (const c of ['performance', 'seo']) u.searchParams.append('category', c);
  u.searchParams.set('key', apiKey);
  try {
    const data = await requestJson(u.toString(), {}, { timeoutMs: 60000, ...opts });
    return normalizePagespeed(data);
  } catch (e) {
    if (LOAD_FAILURE.test(e.message || '')) return { ...UNREACHABLE };
    throw e;
  }
}
