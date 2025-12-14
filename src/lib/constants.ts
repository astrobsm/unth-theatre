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
