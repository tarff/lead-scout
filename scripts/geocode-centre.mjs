const key = process.env.GOOGLE_API_KEY;
if (!key) {
  throw new Error('GOOGLE_API_KEY is required');
}

const address = process.argv.slice(2).join(' ') || 'Hampton VIC Australia';
const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
url.searchParams.set('address', address);
url.searchParams.set('key', key);

const res = await fetch(url);
if (!res.ok) throw new Error(`Geocoding HTTP ${res.status}: ${await res.text()}`);

const data = await res.json();
// Google returns HTTP 200 even for REQUEST_DENIED/ZERO_RESULTS — the real
// reason is in data.status / data.error_message, so surface it explicitly.
if (data.status !== 'OK') {
  throw new Error(`Geocoding ${data.status}: ${data.error_message || `no result for ${address}`}`);
}
const first = data.results?.[0];
if (!first) throw new Error(`No geocoding result for ${address}`);

console.log(JSON.stringify({
  address,
  formatted_address: first.formatted_address,
  location: first.geometry?.location,
}, null, 2));
