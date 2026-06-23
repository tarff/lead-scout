import { readFileSync } from 'node:fs';
import { runPagespeed } from '../src/pagespeed.js';

const key = process.env.GOOGLE_API_KEY;
if (!key) {
  throw new Error('GOOGLE_API_KEY is required');
}

// Accept either a list of URLs, or a single .json file holding a URL array.
const args = process.argv.slice(2);
if (!args.length) {
  throw new Error('Provide URLs, or a .json file of URLs, e.g. npm run calibrate -- calibration-urls.json');
}
const urls = args.length === 1 && args[0].endsWith('.json')
  ? JSON.parse(readFileSync(args[0], 'utf8'))
  : args;

const scores = [];
for (const url of urls) {
  try {
    const result = await runPagespeed(url, key);
    scores.push(result.performanceScore);
    console.log(JSON.stringify({ url, ...result }));
  } catch (e) {
    console.error('skip', url, e.message.slice(0, 120));
  }
}

const numeric = scores.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
const q = (p) => numeric[Math.floor((numeric.length - 1) * p)];
if (numeric.length) {
  console.log(JSON.stringify({ sampled: numeric.length, min: numeric[0],
    q25: q(0.25), median: q(0.5), q75: q(0.75), max: numeric.at(-1) }));
}
