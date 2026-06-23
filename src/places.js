import { requestJson } from './http.js';

const NEARBY = 'https://places.googleapis.com/v1/places:searchNearby';
const TEXT = 'https://places.googleapis.com/v1/places:searchText';
const DETAILS = (id) => `https://places.googleapis.com/v1/places/${id}`;

const DISCOVERY_MASK = 'places.id,places.displayName,places.primaryType,places.location,places.formattedAddress';
const DETAILS_MASK = 'id,websiteUri,nationalPhoneNumber,internationalPhoneNumber';

// Max results searchNearby/searchText return per request. Hitting this means a
// tile is saturated and should be re-searched at finer granularity (Capped).
export const PLACES_PAGE_SIZE = 20;

export function mapDiscovery(p) {
  return {
    place_id: p.id,
    place_resource_name: `places/${p.id}`,
    business_name: p.displayName?.text || '',
    primary_type: p.primaryType || '',
    address: p.formattedAddress || '',
  };
}

export function mapDetails(p) {
  return {
    website_url: p.websiteUri || '',
    phone: p.nationalPhoneNumber || p.internationalPhoneNumber || '',
  };
}

export async function searchNearby({ apiKey, includedTypes, center, radius, maxResultCount = PLACES_PAGE_SIZE }, opts = {}) {
  const body = {
    includedTypes, maxResultCount,
    locationRestriction: { circle: { center: { latitude: center.lat, longitude: center.lng }, radius } },
  };
  const data = await requestJson(NEARBY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': DISCOVERY_MASK },
    body: JSON.stringify(body),
  }, opts);
  return (data.places || []).map(mapDiscovery);
}

export async function searchText({ apiKey, textQuery, center, radius, maxResultCount = PLACES_PAGE_SIZE }, opts = {}) {
  const body = {
    textQuery, maxResultCount,
    locationBias: { circle: { center: { latitude: center.lat, longitude: center.lng }, radius } },
  };
  const data = await requestJson(TEXT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': DISCOVERY_MASK },
    body: JSON.stringify(body),
  }, opts);
  return (data.places || []).map(mapDiscovery);
}

export async function placeDetails(placeId, apiKey, opts = {}) {
  const data = await requestJson(DETAILS(placeId), {
    headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': DETAILS_MASK },
  }, opts);
  return mapDetails(data);
}
