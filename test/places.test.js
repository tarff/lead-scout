import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapDiscovery, mapDetails, searchNearby, searchText, placeDetails } from '../src/places.js';

const okJson = (body) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => body });

test('mapDiscovery extracts id, name, type, address from a New API place', () => {
  const place = { id: 'p1', displayName: { text: 'Acme Plumbing' }, primaryType: 'plumber',
    formattedAddress: '1 St, Hampton VIC', location: { latitude: -37.9, longitude: 145.0 } };
  assert.deepEqual(mapDiscovery(place), {
    place_id: 'p1', place_resource_name: 'places/p1', business_name: 'Acme Plumbing',
    primary_type: 'plumber', address: '1 St, Hampton VIC',
  });
});

test('mapDetails extracts website + phone (enterprise fields)', () => {
  const place = { id: 'p1', websiteUri: 'https://acme.test', nationalPhoneNumber: '03 9000 0000' };
  assert.deepEqual(mapDetails(place), { website_url: 'https://acme.test', phone: '03 9000 0000' });
});

test('mapDetails leaves blanks when fields absent (no website => hot later)', () => {
  assert.deepEqual(mapDetails({ id: 'p1' }), { website_url: '', phone: '' });
});

test('searchNearby posts field mask + body and returns mapped places', async () => {
  let seen;
  const fetchImpl = async (url, init) => { seen = { url, init }; return {
    ok: true, status: 200, headers: { get: () => null },
    json: async () => ({ places: [{ id: 'p1', displayName: { text: 'A' } }] }) }; };
  const out = await searchNearby({ apiKey: 'k', includedTypes: ['plumber'],
    center: { lat: -37.9, lng: 145 }, radius: 1000 }, { fetchImpl });
  assert.equal(out[0].place_id, 'p1');
  assert.match(seen.init.headers['X-Goog-FieldMask'], /places\.id/);
  assert.equal(seen.init.headers['X-Goog-Api-Key'], 'k');
});

test('searchText posts a textQuery + locationBias (not locationRestriction) and maps results', async () => {
  let seen;
  const fetchImpl = async (url, init) => { seen = { url, init }; return okJson({ places: [{ id: 'p2', displayName: { text: 'B' } }] }); };
  const out = await searchText({ apiKey: 'k', textQuery: 'cleaners in Hampton',
    center: { lat: -37.9, lng: 145 }, radius: 1000 }, { fetchImpl });
  assert.equal(out[0].place_id, 'p2');
  assert.match(seen.url, /places:searchText/);
  const body = JSON.parse(seen.init.body);
  assert.equal(body.textQuery, 'cleaners in Hampton');
  assert.ok(body.locationBias?.circle, 'searchText uses locationBias.circle');
  assert.equal(body.locationRestriction, undefined);
});

test('placeDetails GETs the details mask (website+phone) and returns mapped fields', async () => {
  let seen;
  const fetchImpl = async (url, init) => { seen = { url, init }; return okJson({ id: 'p1', websiteUri: 'https://acme.test', nationalPhoneNumber: '03 9000 0000' }); };
  const out = await placeDetails('p1', 'k', { fetchImpl });
  assert.deepEqual(out, { website_url: 'https://acme.test', phone: '03 9000 0000' });
  assert.match(seen.url, /\/v1\/places\/p1$/);
  assert.match(seen.init.headers['X-Goog-FieldMask'], /websiteUri/);
  assert.equal(seen.init.headers['X-Goog-Api-Key'], 'k');
});
