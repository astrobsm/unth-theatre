// Anaesthesia consumables catalog.
//
// These items are selectable by anaesthetists during the pre-operative
// anaesthetic review prescription. Selected consumables are appended to the
// prescription's medication list and are therefore wired to the pharmacy for
// packing through the existing prescription pipeline.
//
// "Standard" items are routinely required. "Special-case" items (e.g. for
// tumour surgery) are only added when clinically indicated.

export interface AnaesthesiaConsumable {
  name: string;
  unit: string;
  sizes?: string[]; // optional size options the anaesthetist can pick
  specialCase?: string; // when set, item is only needed for special cases
}

export interface AnaesthesiaConsumableGroup {
  group: string;
  items: AnaesthesiaConsumable[];
}

// Category labels used when a consumable is added to the prescription list.
// These appear as a badge in the pharmacist packing view.
export const CONSUMABLE_CATEGORY_STANDARD = 'Anaesthesia Consumable';
export const CONSUMABLE_CATEGORY_SPECIAL = 'Anaesthesia Consumable (Special Case)';

export const ANAESTHESIA_CONSUMABLES: AnaesthesiaConsumableGroup[] = [
  {
    group: 'Standard Anaesthesia Consumables',
    items: [
      {
        name: 'Endotracheal Tube',
        unit: 'piece',
        sizes: ['5.0', '5.5', '6.0', '6.5', '7.0', '7.5', '8.0', '8.5'],
      },
      { name: 'ECG Leads', unit: 'set' },
      { name: 'HME Filter (Heat & Moisture Exchanger)', unit: 'piece' },
      {
        name: 'NG Tube (Nasogastric)',
        unit: 'piece',
        sizes: ['10 Fr', '12 Fr', '14 Fr', '16 Fr', '18 Fr'],
      },
      { name: 'Epidural Kit', unit: 'kit' },
      {
        name: 'Spinal Needle',
        unit: 'piece',
        sizes: ['24 G', '25 G', '26 G'],
      },
    ],
  },
  {
    group: 'Special-Case Consumables (e.g. Tumour Surgery)',
    items: [
      { name: 'Central Line Kit', unit: 'kit', specialCase: 'Tumour surgery' },
      { name: 'Arterial Line Needle', unit: 'piece', specialCase: 'Tumour surgery' },
      { name: 'Pressure Transducer', unit: 'piece', specialCase: 'Tumour surgery' },
    ],
  },
];
