// The places where "anonymous" could quietly stop being true.
//
// None of these would show up on a screen. The feedback would keep arriving,
// the board would keep filling, and the only sign that the promise had been
// broken would be a surgeon working out who had complained about them.
//
//   1. The submission keeps the patientId. One join and every opinion has a
//      name on it.
//   2. The identity fields are posted anyway, because the form hid them but
//      the endpoint still accepts them.
//   3. The feedback is written and the link is severed in two steps, and the
//      second one fails.
//   4. The token reaches a third party — a hosted QR service is the obvious
//      way — who can then submit in the patient's name.
//   5. The form shows the patient their own name, so they believe the
//      hospital knows what they wrote, whether or not it does.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const REPO = path.join(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(REPO, p), 'utf8');

const invite = read('src/app/api/surgeries/[id]/feedback-invite/route.ts');
const publicInvite = read('src/app/api/feedback/invite/route.ts');
const submit = read('src/app/api/feedback/patient/route.ts');
const form = read('src/app/feedback/page.tsx');
const button = read('src/components/FeedbackInviteButton.tsx');
const lib = read('src/lib/patients/feedbackInvite.ts');
const completed = read('src/app/dashboard/surgeries/completed/page.tsx');

describe('the link back to the patient is severed', () => {
  it('clears patientId and surgeryId when the feedback arrives', () => {
    // THE ONE THAT MATTERS MOST. Without this the request row holds the
    // patient, the submission timestamp and the feedback's own timestamp —
    // which is a join, however much the schema avoids drawing it.
    expect(submit).toContain('patientId: null, surgeryId: null');
    expect(submit).toContain('submittedAt: new Date()');
  });

  it('writes the feedback and severs the link in one transaction', () => {
    // If the write succeeds and the clearing does not, the database is left
    // holding exactly the join this feature promises does not exist.
    expect(submit).toContain('prisma.$transaction');
    const tx = submit.indexOf('prisma.$transaction');
    const clear = submit.indexOf('patientId: null, surgeryId: null');
    expect(tx).toBeLessThan(clear);
    // Inside the transaction, so it is tx and not prisma.
    expect(submit).toContain('tx.feedbackRequest.update');
    expect(submit).toContain('tx.patientFeedback.create');
  });

  it('never stores the patient\'s words on the request row', () => {
    // responseData exists on the model. Filling it would put what they wrote
    // next to where their patientId used to be, with a matching timestamp.
    //
    // Matched as an ASSIGNMENT rather than as the bare word, so the column can
    // still be named in a comment explaining why it is left alone.
    expect(submit).not.toMatch(/responseData\s*:/);
  });

  it('drops identity on an invited submission, at the endpoint', () => {
    // The form hides those fields. That is not enough: a crafted request must
    // not be able to sign a submission the patient believed was anonymous.
    expect(submit).toContain('identified ? (d.patientName || null) : null');
    expect(submit).toContain('identified ? (d.folderNumber || null) : null');
    expect(submit).toContain('identified ? (d.phoneNumber || null) : null');
    expect(submit).toContain('const identified = inviteId === null');
  });

  it('keeps the unit, so the feedback reaches somebody', () => {
    expect(submit).toContain('careUnit');
    expect(submit).toContain('careComplex');
    expect(submit).toContain('careContextOf');
  });

  it('refuses a token that is spent or expired', () => {
    expect(submit).toContain('inviteState(row)');
    expect(submit).toContain('{ status: 409 }');
  });
});

describe('the public endpoint gives nothing away', () => {
  it('returns the unit, and no identity', () => {
    // It is open to the internet with no session to check, so there must be
    // nothing here worth stealing: a brute-forced token buys the name of a
    // surgical unit.
    expect(publicInvite).toContain('ok: true, unit');
    for (const leak of ['patientName', 'folderNumber', 'phoneNumber', 'procedureName', 'patientId']) {
      expect(publicInvite, leak).not.toContain(leak);
    }
  });

  it('answers a dead link with words, not a status code', () => {
    // A patient is reading this page, not a program handling an error.
    expect(publicInvite).toContain('ok: false, problem: state.problem');
    expect(publicInvite).toContain('ANONYMITY_NOTICE');
  });

  it('states the limit of the anonymity beside the code that keeps it', () => {
    // In the library, next to inviteState and the token handling, so the
    // promise and the behaviour have to change in the same commit. (It cannot
    // live in the route: Next refuses a route module that exports anything but
    // handlers and its known config.)
    expect(lib).toMatch(/caution:/);
    expect(lib).toMatch(/quiet week|point to you/i);
    expect(publicInvite).toContain('ANONYMITY_NOTICE');
  });
});

describe('the invitation', () => {
  it('is offered only once care is over', () => {
    expect(invite).toContain("const FINISHED = ['COMPLETED', 'CANCELLED']");
    expect(invite).toContain("code: 'NOT_FINISHED'");
    expect(button).toContain('FINISHED.includes(String(status ?? \'\'))');
  });

  it('does not quietly mint a second one', () => {
    // Opening the dialog twice must not leave two live links; and the first
    // cannot be reprinted, because only its hash was kept.
    expect(invite).toContain("code: 'ALREADY_INVITED'");
    expect(invite).toContain('existingInvite');
    expect(button).toMatch(/cannot be shown again/i);
  });

  it('says that somebody answered without saying what they said', () => {
    expect(invite).toContain('alreadyAnswered');
    expect(button).toMatch(/not linked\s*\n?\s*back to them|cannot be shown here/i);
  });

  it('stores only the hash', () => {
    expect(invite).toContain('tokenHash');
    expect(invite).not.toMatch(/data:\s*\{[^}]*\btoken\b\s*:/s);
  });

  it('is reachable from the finished-cases page', () => {
    expect(completed).toContain('FeedbackInviteButton');
  });
});

describe('the token does not leave the hospital', () => {
  it('draws the QR code locally', () => {
    // A hosted QR service takes the data in the URL. That hands the one secret
    // in this feature to a third party, who could then open the patient's form
    // and submit in their name.
    expect(button).toContain("import('qrcode')");
    // The image is whatever qrcode drew into a data: URL, not something
    // fetched. Matched on the code rather than on the name of any one service,
    // so naming the hazard in a comment does not trip the guard — and so a
    // DIFFERENT hosted service would still be caught.
    expect(button).toContain('QRCode.toDataURL(url');
    expect(button).toContain('src={qr}');
    expect(button).not.toMatch(/['"`]https?:\/\/[^'"`\s]*\bqr/i);
    expect(button).not.toMatch(/src=\{?['"`]?https?:/i);
  });

  it('builds the link without a request host', () => {
    expect(lib).not.toContain('headers.get');
    expect(lib).toContain('publicSiteUrl()');
  });
});

describe('the form behaves as the link promised', () => {
  it('does not prefill the patient\'s name from an invitation', () => {
    // Whether or not the name is submitted, what they can SEE is what they
    // will believe about who knows what they wrote.
    expect(form).toContain("const t = params.get('t')");
    const tokenBranch = form.indexOf("if (t) {");
    const prefill = form.indexOf("const name = params.get('name')");
    expect(tokenBranch).toBeGreaterThan(-1);
    expect(prefill).toBeGreaterThan(tokenBranch);
    // The token branch returns before the prefill can run.
    expect(form.slice(tokenBranch, prefill)).toContain('return;');
  });

  it('shows nothing at all until the invitation has been checked', () => {
    // Rendering the Name box and removing it a tick later gives the patient
    // two different answers, and they believe the first.
    expect(form).toContain('checkingInvite ? null : anonymous ?');
  });

  it('sends the token and withholds the identity', () => {
    expect(form).toContain('token: anonymous ? invite!.token : undefined');
    expect(form).toContain('patientName: anonymous ? undefined');
    expect(form).toContain("source: anonymous ? 'end-of-care' : 'link'");
  });

  it('keeps the ordinary form open when a link is dead', () => {
    expect(form).toContain('invite && !invite.ok && invite.message');
  });

  it('tells the patient what is kept and what is not', () => {
    expect(form).toMatch(/What we keep/);
    expect(form).toMatch(/What we do not/);
  });
});
