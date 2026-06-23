// Approved candidate local-SMB targeting list.
// Each entry maps a business category to Places (New) `includedTypes`. Trim or
// extend before the stage plan wires discovery. rank_preference is per-query.
export const CANDIDATE_CATEGORIES = [
  { category: 'trades', place_types: ['plumber', 'electrician', 'roofing_contractor', 'painter'] },
  { category: 'home_services', place_types: ['locksmith', 'moving_company'],
    text_queries: ['deck builder Hampton VIC', 'kitchen renovator Hampton VIC'] },
  { category: 'food', place_types: ['cafe', 'restaurant', 'bakery'] },
  { category: 'personal_care', place_types: ['hair_salon', 'beauty_salon', 'barber_shop'] },
  { category: 'auto', place_types: ['car_repair', 'car_wash'] },
  { category: 'health', place_types: ['physiotherapist', 'dentist', 'veterinary_care'] },
  { category: 'retail', place_types: ['florist', 'pet_store', 'hardware_store'] },
];
