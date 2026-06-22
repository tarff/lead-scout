const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// fetch wrapper: JSON in/out, retry on 429 + 5xx with exponential backoff.
export async function requestJson(url, init = {}, opts = {}) {
  const { fetchImpl = fetch, maxRetries = 4, baseDelayMs = 500, timeoutMs = 30000 } = opts;
  let attempt = 0;
  for (;;) {
    attempt++;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    let res;
    try {
      res = await fetchImpl(url, { ...init, signal: ac.signal });
    } catch (e) {
      clearTimeout(timer);
      if (attempt > maxRetries) throw e;
      await sleep(baseDelayMs * 2 ** (attempt - 1));
      continue;
    }
    clearTimeout(timer);
    if (res.ok) return res.json();

    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt > maxRetries) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
    }
    const retryAfter = Number(res.headers.get('retry-after'));
    const delay = Number.isFinite(retryAfter) ? retryAfter * 1000 : baseDelayMs * 2 ** (attempt - 1);
    await sleep(delay);
  }
}
