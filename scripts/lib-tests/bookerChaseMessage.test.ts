import { describe, it, expect } from 'vitest';

import {
  buildBookerChaseMessage,
  bookerChaseWhatsAppUrl,
  outstandingItems,
} from '../../src/lib/bookerChaseMessage';

const aCase = {
  patientName: 'Nwadiogbu Ukamaka',
  folderNumber: '913354',
  procedureName: 'Z-plasty',
  scheduledDate: '2026-08-26',
  scheduledTime: '11:30',
  theatreName: 'Theatre 3',
  fromName: 'Sister Okoro',
};

describe('naming what is outstanding', () => {
  it('turns stored codes into words a person can act on', () => {
    expect(outstandingItems('CONSENT,HAEMOGLOBIN')).toEqual([
      'informed consent',
      'a recent haemoglobin, with the date the sample was drawn',
    ]);
  });

  it('shows an unrecognised code rather than dropping it', () => {
    // A message listing two of three items reads as complete, which is worse
    // than one showing something unfamiliar.
    expect(outstandingItems('CONSENT,SOMETHING_NEW')).toEqual([
      'informed consent',
      'something new',
    ]);
  });

  it('treats an empty list as nothing outstanding', () => {
    expect(outstandingItems(null)).toEqual([]);
    expect(outstandingItems('')).toEqual([]);
  });
});

describe('the message', () => {
  it('identifies the case, not just the patient', () => {
    // A surgeon may have three patients on one list; "your case is not ready"
    // fits all of them.
    const m = buildBookerChaseMessage({ ...aCase, outstanding: 'CONSENT' });
    expect(m).toContain('Nwadiogbu Ukamaka');
    expect(m).toContain('913354');
    expect(m).toContain('Z-plasty');
    expect(m).toContain('2026-08-26 at 11:30');
    expect(m).toContain('Theatre 3');
  });

  it('names a single outstanding item in a sentence', () => {
    const m = buildBookerChaseMessage({ ...aCase, outstanding: 'CONSENT' });
    expect(m).toContain('still missing informed consent');
  });

  it('lists several as bullets', () => {
    const m = buildBookerChaseMessage({ ...aCase, outstanding: 'CONSENT,BLOOD_PRESSURE' });
    expect(m).toContain('• informed consent');
    expect(m).toContain('• blood pressure');
  });

  it('signs off with the sender, so the reminder comes from somebody', () => {
    expect(buildBookerChaseMessage({ ...aCase, outstanding: 'CONSENT' }))
      .toContain('Sister Okoro');
  });
});

describe('the link', () => {
  it('normalises a Nigerian number for wa.me', () => {
    const url = bookerChaseWhatsAppUrl('08035523965', { ...aCase, outstanding: 'CONSENT' });
    expect(url).toContain('https://wa.me/2348035523965');
  });

  it('returns null when there is no usable number', () => {
    // wa.me opens a chat with nobody on a malformed number, which looks exactly
    // like a message that was sent.
    expect(bookerChaseWhatsAppUrl(null, { ...aCase, outstanding: 'CONSENT' })).toBeNull();
    expect(bookerChaseWhatsAppUrl('', { ...aCase, outstanding: 'CONSENT' })).toBeNull();
  });
});
