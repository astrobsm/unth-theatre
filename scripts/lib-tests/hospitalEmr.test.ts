/**
 * The hospital EMR link.
 *
 * WHAT THESE TESTS ARE PROTECTING. The button sends staff to a page where
 * they type a hospital password. Two properties make that safe and both are
 * easy to lose in a later edit: the address must be https even when a
 * deployment variable says otherwise, and ORM must never present itself as
 * the thing collecting those credentials.
 */
import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_HOSPITAL_EMR_URL, EMR_STEPS, emrHost, resolveEmrUrl,
} from '../../src/lib/hospitalEmr';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('the address', () => {
  it('is the one Hospital Management gave', () => {
    expect(DEFAULT_HOSPITAL_EMR_URL).toBe('https://unth.fastcare.ng/HmisWeb');
  });

  it('can be changed by deployment', () => {
    expect(resolveEmrUrl('https://emr.unth.edu.ng/HmisWeb')).toBe('https://emr.unth.edu.ng/HmisWeb');
  });

  it('REFUSES a plain-http address', () => {
    // A hospital password over http is a hospital password on the wire.
    expect(resolveEmrUrl('http://unth.fastcare.ng/HmisWeb')).toBe(DEFAULT_HOSPITAL_EMR_URL);
  });

  it('refuses anything that is not a URL', () => {
    expect(resolveEmrUrl('unth.fastcare.ng')).toBe(DEFAULT_HOSPITAL_EMR_URL);
    expect(resolveEmrUrl('javascript:alert(1)')).toBe(DEFAULT_HOSPITAL_EMR_URL);
    expect(resolveEmrUrl('   ')).toBe(DEFAULT_HOSPITAL_EMR_URL);
    expect(resolveEmrUrl(undefined)).toBe(DEFAULT_HOSPITAL_EMR_URL);
    expect(resolveEmrUrl(null)).toBe(DEFAULT_HOSPITAL_EMR_URL);
  });

  it('names the host, for showing before the click', () => {
    expect(emrHost(DEFAULT_HOSPITAL_EMR_URL)).toBe('unth.fastcare.ng');
    expect(emrHost('not a url')).toBe('');
  });

  it('tells the user to set their location, which is the step people miss', () => {
    const detail = EMR_STEPS.map((s) => `${s.title} ${s.detail}`).join(' ').toLowerCase();
    expect(detail).toContain('location');
    expect(detail).toContain('clinic');
  });
});

describe('the bar on the dashboard', () => {
  const bar = read('src/components/HospitalEmrBar.tsx');
  const layout = read('src/app/dashboard/layout.tsx');

  it('sits directly beneath the careline strip, on every dashboard', () => {
    expect(layout).toContain('<HospitalEmrBar />');
    const careline = layout.indexOf('<CarelineBar />');
    const emr = layout.indexOf('<HospitalEmrBar />');
    expect(careline).toBeGreaterThan(-1);
    expect(emr).toBeGreaterThan(careline);
  });

  it('opens in a new tab, and the EMR tab cannot reach back into ORM', () => {
    expect(bar).toContain("'_blank'");
    expect(bar).toContain('noopener,noreferrer');
  });

  it('NEVER asks for an EMR password', () => {
    // The whole point: ORM links to the EMR, it does not sign anybody in.
    expect(bar).not.toMatch(/type="password"|password:|credentials\s*[:=]/i);
    expect(bar).toContain('ORM never asks for, sees or stores your EMR password');
  });

  it('shows the destination host before the click', () => {
    expect(bar).toContain('emrHost');
    expect(bar).toContain('{host}');
  });

  it('says plainly what offline means for it', () => {
    // ORM runs offline; the EMR does not, and a blank tab explains nothing.
    expect(bar).toContain('useOnlineStatus');
    expect(bar).toContain('will not load until the');
  });

  it('formats the last-opened time in WAT, not the device timezone', () => {
    // This machine and several phones are set to other zones; toLocale*
    // would print a different hour on each.
    expect(bar).toContain('formatBookedAtShort');
    expect(bar).not.toMatch(/toLocale(Date|Time)?String/);
  });
});
