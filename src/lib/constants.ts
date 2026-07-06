// Standard lists for wards and theatres across the application

export const WARDS = [
  'WARD 1',
  'WARD 2',
  'WARD 3',
  'WARD 4',
  'WARD 6A',
  'WARD 6B',
  'WARD 8',
  'WARD 9',
  'WARD 10',
  'FEMALE MEDICAL WARD',
  'MALE MEDICAL WARD',
  'MALE MEDICAL WARD EXTENSION',
  'ONCOLOGY WARD',
  'EYE WARD',
  'NEUROSURGICAL WARD',
  'MEDICAL EMERGENCY WARD',
  'SURGICAL EMERGENCY WARD',
  'PSYCHIATRIC WARD',
  'POSTNATAL WARD',
  'CHILDREN EMERGENCY WARD (CHER)',
  'SPECIAL CARE WARD',
  'ICU',
  'OTHERS (SPECIFY)',
] as const;

export const THEATRES = [
  'NEUROSURGERY THEATRE',
  'EMERGENCY THEATRE',
  'CTU THEATRE',
  'EYE THEATRE',
] as const;

export type Ward = typeof WARDS[number];
export type Theatre = typeof THEATRES[number];

// ============================================================================
// Operating-theatre LOCATIONS (canonical labels — used for booking + seeding).
// ============================================================================
export const LOCATIONS = [
  'Professor Ojukwu Theatre Complex', // Location 4 — main complex (Theatres 1-5, Suites 1-3)
  'Eye Theatre',                       // Location 2 — Ophthalmology
  'A&E',                               // Location 1 — 24/7 Accident & Emergency theatre
  'Cardiothoracic Centre',             // Location 3 — CTU TH1
] as const;

export type Location = typeof LOCATIONS[number];

// Canonical theatres seeded by scripts/seed-theatres-and-units.ts
// Each row: { name (unique), location, capacity, status }
export const CANONICAL_THEATRES: Array<{ name: string; location: Location; capacity?: number }> = [
  // Location 4 – Professor Ojukwu Theatre Complex
  { name: 'Theatre 1', location: 'Professor Ojukwu Theatre Complex' },
  { name: 'Theatre 2', location: 'Professor Ojukwu Theatre Complex' },
  { name: 'Theatre 3', location: 'Professor Ojukwu Theatre Complex' },
  { name: 'Theatre 4', location: 'Professor Ojukwu Theatre Complex' },
  { name: 'Theatre 5', location: 'Professor Ojukwu Theatre Complex' },
  { name: 'Suite 1', location: 'Professor Ojukwu Theatre Complex' },
  { name: 'Suite 2', location: 'Professor Ojukwu Theatre Complex' },
  { name: 'Suite 3', location: 'Professor Ojukwu Theatre Complex' },
  // Location 2 – Eye Theatre
  { name: 'Eye Theatre', location: 'Eye Theatre' },
  // Location 1 – A&E (24/7 emergency) — two suites: North Wing & South Wing
  { name: 'A&E North Wing Suite', location: 'A&E' },
  { name: 'A&E South Wing Suite', location: 'A&E' },
  // Location 3 – Cardiothoracic Centre
  { name: 'CTU TH1', location: 'Cardiothoracic Centre' },
];

// University of Nigeria Teaching Hospital (UNTH), Ituku-Ozalla
// Nkanu West Local Government Area, Enugu State, Nigeria
export const FACILITY_COORDS = {
  latitude: 6.4041,
  longitude: 7.5199,
  name: 'UNTH Ituku-Ozalla, Nkanu West LGA, Enugu',
} as const;

// Canonical, human-readable address of the hospital. Shown whenever a captured
// position falls within FACILITY_PROXIMITY_KM of the facility so users see a
// real address instead of bare coordinates.
export const FACILITY_ADDRESS =
  'University of Nigeria Teaching Hospital (UNTH), Enugu - Port Harcourt Expressway, Umuoye, Awgu, Enugu State, Nigeria';

// How close (km) a captured position must be to the facility to be labelled
// with FACILITY_ADDRESS rather than a reverse-geocoded street address.
export const FACILITY_PROXIMITY_KM = 3;

/**
 * Convert raw GPS coordinates into a human-readable street address.
 * - If the position is within FACILITY_PROXIMITY_KM of UNTH, returns the
 *   canonical hospital address (no network call needed).
 * - Otherwise reverse-geocodes via OpenStreetMap Nominatim.
 * - On any failure, falls back to formatted coordinates so the caller always
 *   gets a usable string.
 */
export async function reverseGeocode(latitude: number, longitude: number): Promise<string> {
  const coordsLabel = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;

  // Near the hospital → use the known, friendly address.
  const distanceFromFacility = haversineDistanceKm(
    latitude,
    longitude,
    FACILITY_COORDS.latitude,
    FACILITY_COORDS.longitude,
  );
  if (distanceFromFacility <= FACILITY_PROXIMITY_KM) {
    return FACILITY_ADDRESS;
  }

  // Elsewhere → reverse geocode to a real address.
  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1` +
      `&lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data = (await res.json()) as { display_name?: string };
      if (data && typeof data.display_name === 'string' && data.display_name.trim()) {
        return `${data.display_name} (${coordsLabel})`;
      }
    }
  } catch {
    // ignore and fall back to coordinates
  }
  return coordsLabel;
}

// Haversine distance calculation (returns km)
export function haversineDistanceKm(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 100) / 100;
}
