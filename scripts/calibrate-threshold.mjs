import { runPagespeed } from '../src/pagespeed.js';

const key = process.env.GOOGLE_API_KEY;
if (!key) {
  throw new Error('GOOGLE_API_KEY is required');
}

const urls = process.argv.slice(2);
if (!urls.length) {
  throw new Error('Provide one or more URLs to sample, e.g. npm run calibrate -- https://example.com');
}

const scores = [];
for (const url of urls) {
  const result = await runPagespeed(url, key);
  scores.push(result.performanceScore);
  console.log(JSON.stringify({ url, ...result }));
}

const numeric = scores.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
if (numeric.length) {
  const median = numeric[Math.floor(numeric.length / 2)];
  console.log(JSON.stringify({ sampled: numeric.length, min: numeric[0], median, max: numeric.at(-1) }));
}
