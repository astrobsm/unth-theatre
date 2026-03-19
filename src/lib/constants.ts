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
  'ICU',
  'OTHERS (SPECIFY)',
] as const;

export const THEATRES = [
  'THEATRE 1 (VAMED)',
  'THEATRE 2 (VAMED)',
  'THEATRE 3 (VAMED)',
  'THEATRE 4 (VAMED)',
  'THEATRE 5 (VAMED)',
  'SUITE 1 (NIGERIAN SIDE)',
  'SUITE 2 (NIGERIAN SIDE)',
  'SUITE 3 (NIGERIAN SIDE)',
  'SUITE 4 (NIGERIAN SIDE)',
  'NEUROSURGERY THEATRE',
  'EMERGENCY THEATRE',
  'CTU THEATRE',
  'EYE THEATRE',
] as const;

export type Ward = typeof WARDS[number];
export type Theatre = typeof THEATRES[number];

// UNTH Ituku Ozalla, Enugu - precise facility coordinates
export const FACILITY_COORDS = {
  latitude: 6.3942,
  longitude: 7.5064,
  name: 'UNTH Ituku Ozalla, Enugu',
} as const;

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
