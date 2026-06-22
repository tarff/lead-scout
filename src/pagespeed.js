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

export async function runPagespeed(url, apiKey, opts = {}) {
  const u = new URL(ENDPOINT);
  u.searchParams.set('url', url);
  u.searchParams.set('strategy', 'mobile');
  for (const c of ['performance', 'seo']) u.searchParams.append('category', c);
  u.searchParams.set('key', apiKey);
  const data = await requestJson(u.toString(), {}, { timeoutMs: 60000, ...opts });
  return normalizePagespeed(data);
}
