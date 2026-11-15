# Running a policy review on ORM

For the Chairman of the Theatre Users Committee.

This replaces circulating a draft in the WhatsApp group and trying to reconcile
thirty messages afterwards. Members answer section by section, every value in
[square brackets] is tallied, and a single patient-safety objection is reported
to you on its own instead of scrolling away under the next message.

---

## What you need before you start

- The latest export of the draft, as **Word (.docx)** or **Markdown**. Export it
  from wherever the committee is editing it.
- The members' names and, for each one, their **WhatsApp number**. Role and unit
  are worth adding — they are how the dashboard can tell you that Anaesthesia
  answered and Pharmacy has not.

You do not need accounts for the members. Most heads of department will never
register, so each one gets a personal link that works without signing in.

---

## 1. Import the draft

**Policy Review → Import a draft.** Upload the file, or paste the text.

Nothing is stored yet. You get a **preview**, and it is worth reading, because
this is the only screen where a bad parse is visible. Check:

- **The warnings at the top.** The common one is that your headings are numbered
  by Word's automatic numbering. If so the numbers are not in the text at all,
  ORM cannot see them, and 3.1–3.12 will arrive as twelve separate top-level
  sections. The fix is to type the numbers into the headings and export again.
- **The section list.** You can correct any number or title, and remove anything
  that is not really a section. Remove a parent and its subsections are promoted
  rather than lost.
- **The open values.** Every `[bracketed]` value found is listed with the
  sentence it sits in. Change its type if ORM guessed wrong — the type decides
  whether a member gets a time picker or a text box. Mark anything that is not
  really a decision as **not a decision**.

Then set the title and version and press **Store this draft**.

---

## 2. Create the round

**New round.** Choose the draft, set the closing date and time, and create it.

The round is created **closed**. That is deliberate: it gives you a gap in which
to invite people and check the links. Anybody who opens a link before you open
the round is told to keep the message, not shown an empty review.

---

## 3. Invite the committee

On the round page, **Invite**. Paste one person per line:

```
Dr A. Example | Head of Surgery | Surgery | 08030000000
Dr B. Example | Head of Anaesthesia | Anaesthesia | 08030000001
```

Role, unit and phone can be left blank, but **the phone is what makes the
WhatsApp button work**.

You then get each member's link, with **Copy link**, **Copy message** and **Send
on WhatsApp**.

> ### Copy the links before you leave that screen
>
> ORM stores only a one-way hash of each link, never the link itself. That means
> nobody can read a member's link back later — not you, and not anybody who gets
> hold of a database backup and tries to answer in a head of department's name on
> a policy that is going to Management.
>
> The cost of that is real: **if a link is lost it cannot be retrieved, only
> reissued.** Reissuing mints a new link and stops the old one working. Nothing
> the member has already answered is affected.

There is also a **group link** for the committee's WhatsApp group. It requires an
ORM sign-in, so whoever uses it answers under their own name.

---

## 4. Open the round

Press **Open the round**. The links start working immediately.

---

## 5. Watch it come in

The round page shows, recomputed every time you open it:

- **Participation** — invited, opened, in progress, submitted, not started, and
  the same broken down by unit. "Not started" is the column to act on.
- **Safety, fairness and high-priority comments**, shown *above* the counts.
  A lone objection from one anaesthetist is the most important thing in a review
  and it is not a majority of anything, so it is never averaged into one.
- **Agreement section by section** — a bar per section, with the numbers printed
  beside it.
- **The values still to be settled** — each bracketed value, how many accepted
  what was drafted, and every alternative proposed with who supports it and why.

Values are grouped on exactly what members typed. "11:00" and "11am" are shown
as two proposals, not merged: they are the same intention and different text, and
merging them would invent a consensus the committee never expressed. You decide.

---

## 6. Reminders

ORM chases non-responders automatically at about **48 hours** and **12 hours**
before closing, and you can chase at any time from the round page.

**A reminder cannot contain the member's link** — see the box above; the link
cannot be rebuilt. The reminder points them at the message they already have and
tells them to reply if they have lost it. If somebody has, reissue theirs.

---

## What the members see

- A welcome screen with the deadline, the time it takes, and a plain statement
  that their answers are recorded under their name.
- Every section, with the open values highlighted in the text.
- Four buttons per section: **Agree**, **Agree with changes**, **Disagree**,
  **Not my area** — and they are told to use the last one freely. The Head of
  Pharmacy has nothing to say about cancellation escalation and should not be
  made to pretend otherwise.
- A comment box, and an option to propose new wording pre-filled with the
  current text.
- Four general questions at the end, including the one a group chat never asks:
  *what would stop this working in your own unit?*

**They can stop at any point.** Every answer is saved the moment it is given, so
closing the tab loses nothing, and reopening the same link puts them back where
they stopped — on the same phone or a different device. A member may keep
changing their answers until the deadline; press Submit again and you see the
latest version.

They may submit an incomplete review on purpose. That is correct: insisting on
all twenty-two sections before accepting anything would mean marking eighteen
"not my area" to be heard on the four that matter, and most people would simply
close the tab.

---

## Who can see what

- **You** (and any deputy an administrator has named) see everything.
- **Management** — CMD, CMAC, DCMAC — see the participation figures always, and
  individual responses only once you release them. You can release them with
  names, or by role only.
- Nobody else reaches the review at all.

Release is per round: **Results visibility** on the round page.

---

## Not built yet

The AI analysis, the tracked-change decision screen, the final-proposal
generator and the PDF/CSV exports are the second half of this work. The tables
they use are already in place, so they arrive without another database change.

What exists today collects the committee's responses in a structured, attributed
form and shows you the counts, the proposals and the safety concerns. That is
enough to run the meeting; the analysis is there to save you writing the
synthesis by hand.

---

## If something looks wrong

- **A member says the link does not work.** Ask what it says. ORM distinguishes
  four cases in plain words: not recognised (usually a part-copied link),
  withdrawn, too early (keep the message), and closed.
- **A section has no answers at all.** Check it exists in the preview and that
  it is not a heading with no text of its own.
- **The dashboard looks empty inside the hospital.** It should not — the review
  replicates to both nodes. If it does, say so; that is a sync fault, not a
  reviewing one.
