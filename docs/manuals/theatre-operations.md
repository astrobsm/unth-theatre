# Theatre Operations — user manual

Covers the screens under **Theatre Operations** in the sidebar, plus the two
things that happen without anybody opening a screen: the preoperative alert
and the delay detector.

---

## 1. The day, in order

```
An hour before      the team is told, the radio calls for the patient
Before the case     everyone assigned says whether they are coming
On arrival          the theatre records the milestones as they happen
30 minutes late     a warning appears and notifications go out
45 minutes late     if no reason has been recorded, the case is flagged
Afterwards          the flag goes to a committee, who decide what it means
Continuously        the figures build themselves from the milestones
```

---

## 2. The 60-minute preoperative alert

**Nobody triggers this.** A scheduled job runs every five minutes through the
operating day. An hour before each case is due, it:

1. sends an in-app notification and a phone push to everyone assigned to the
   case who has an ORM account;
2. sends the ward a reminder naming the patient and the ward, asking for
   identity, consent, documentation and transfer;
3. puts a call on the Theatre Radio: *"Attention Theatre Three. Kindly send
   for Mr John Okeke, scheduled for exploratory laparotomy at 10:00 hours."*

### What it will and will not do

- A case added to the list **less than an hour ahead** is alerted on the next
  run — as soon as the system knows.
- A case whose scheduled time has **already passed** is not alerted at all.
  Being late is the delay detector's job; "your case starts in −20 minutes"
  helps nobody.
- Each case is alerted **exactly once**, however often the job runs.
- A cancelled case, or one where the patient has already been moved, is
  skipped.

### Why the radio does not say the hospital number

The announcement plays over a corridor speaker. The name, procedure, theatre
and time are what somebody needs in order to act. The hospital number is what
turns a name overheard in passing into a retrievable record, and it adds
nothing to an instruction to send for a patient. The full detail, including
the number, is in the private notification each person receives.

### The radio call stops by itself

It repeats every five minutes until acknowledged. It is retired automatically
once the patient has been moved, the case is cancelled or completed, or the
scheduled time is half an hour past — whether or not anybody pressed
acknowledge.

### If nobody gets an alert

The alert can only reach people who are **named on the case and have an ORM
account**. A surgeon typed in as free text has nowhere to receive anything.
Thinly assigned cases will get thin alerts. This is a booking-practice matter,
not a fault in the software.

---

## 3. Team check-in

**Sidebar → Team Check-in.**

Two parts to the screen. *Your cases* at the top, with the buttons; *every
case today* below, so a coordinator can see which theatres are short.

### The five answers

| Indicator | Meaning | Needs |
| --- | --- | --- |
| Green — Present | You are here | — |
| Amber — En route | On your way | Minutes away, optionally |
| Orange — Delayed | Coming, but late | **A reason** |
| Red — Unavailable | Not coming | **A reason** |
| Grey — Replaced | Somebody else is covering | **A reason and their name** |

Delayed, Unavailable and Replaced require a reason of at least a few words.
"Delayed" with no explanation reads the same as silence to anyone trying to
plan around it — the coordinator still has to ring and ask.

### What "ready" means

A case is ready when **everyone assigned has answered** and every role has
somebody coming. Silence counts against readiness. A team is not ready because
nobody complained.

Delayed still counts as coming: the case may well run, and it needs a decision
rather than a replacement. Unavailable and Replaced count as gaps until the
replacement checks in.

### About the location

When you check in, your phone is asked for its position. It is compared
against the hospital site and **then discarded**. What is stored is whether
you were on site and roughly how far away, rounded to the nearest 10 metres.
There is no latitude or longitude column on the check-in record.

You can check in perfectly well without a position. A theatre with thick walls
often has no satellite fix; the record then says *position not confirmed*,
which is information, not an accusation. The system will never refuse a
check-in because of a phone.

Nobody can check in on your behalf.

**▢ Hospital policy** — when the theatre coordinator should act on an
unanswered check-in, and who they should call.

---

## 4. Recording the milestones

**This is the one thing the software cannot do for you, and everything else
depends on it.**

The theatre records, as they happen:

| Milestone | Recorded by |
| --- | --- |
| Patient sent for | Ward / porter |
| Patient in the holding area | Holding area nurse |
| Patient inside the theatre | Scrub / circulating nurse |
| Anaesthesia commenced | Anaesthetist |
| WHO time-out completed | Scrub nurse |
| Knife to skin | Scrub nurse |
| Dressing / closure | Scrub nurse |
| Patient to recovery | Recovery nurse |

Every figure in this module — punctuality, turnover, utilisation, where the
time went — is derived from these timestamps. **A case with no milestones is
left out of the figures rather than counted as late.** That is deliberate and
it is honest, but it means a theatre that does not record milestones will see
an empty performance dashboard indefinitely.

---

## 5. Delays

### What happens automatically

- **At 30 minutes** past the scheduled start, if the case has not commenced, a
  warning appears on the board and notifications go to the team, the
  coordinator and the theatre manager.
- **At 45 minutes**, if no reason has been recorded, the case is flagged as
  *unexplained* and goes to the quality assurance queue.
- **Emergencies** are measured from booking, not from a scheduled time, with a
  60-minute threshold.

The detector runs every five minutes. A case can only ever be flagged **once**.

### Recording a reason — do this

Anybody in the room may record a delay: surgeon, anaesthetist, scrub nurse,
coordinator, manager. Choose a category, write what actually happened, and add
a photograph if it helps.

**Recording a reason before 45 minutes prevents the flag. Recording one after
45 minutes withdraws it.** A theatre that explains itself is never penalised
for having been late; the flag is for silence, not for lateness.

There are 41 categories in nine groups: Patient, Surgical team, Anaesthesia,
Instruments & CSSD, Equipment, Pharmacy, Facility, Administrative and Other.
Several route a notification to the department concerned, so that they learn
about a problem attributed to them at the time rather than in a report months
later.

**▢ Hospital policy** — the hospital's own expectation about how quickly a
delay should be documented.

---

## 6. Quality assurance review

**Sidebar → QA Review.** Theatre management and the CMD / CMAC / DC-MAC.

Every unexplained flag arrives here. The committee reads the case and records
one of three outcomes:

- **Reviewed, no action** — looked at, nothing to answer for.
- **Reviewed, system issue** — the theatre was let down by something outside
  its control.
- **Reviewed, referred** — needs a conversation the software has no business
  having.

There is deliberately **no "guilty" outcome**. A screen should not offer a
verdict on a person, and if it did, people would click it.

### Reasons that arrived late

The queue shows prominently where a reason was recorded *after* the threshold.
A theatre that explained itself at 50 minutes documented the problem and was
late saying so. That is a materially different conversation from one where
nobody ever said anything, and the reviewer should not have to dig for it.

### The avoidability judgement

Optional. Defaults to *not judged*. **This is the only place in the entire
system where anything is recorded as avoidable**, it can only be set by a
named reviewer who has read the case, and written reasoning is required — at
least a sentence. A tick-box conclusion cannot be defended later to the person
it concerns.

The delay categories carry an "avoidable" flag for *reporting* — "we lost four
hours this month to CSSD packs". That is a statement about a cause, never
about a case or a person.

**▢ Hospital policy** — who sits on the committee, how often it meets, and
what a *referred* outcome leads to.

---

## 7. Emergency response

**Sidebar → Emergency Response.**

From the moment an emergency is booked, a clock runs. The board lists **every
required department**, including the ones that have said nothing — because
those are what holds the case up.

| State | Meaning |
| --- | --- |
| Responded | They answered. Any answer settles the row. |
| Awaiting | No answer yet, under 20 minutes |
| Overdue | No answer after 20 minutes — ring them |

*Unable to attend* is an answer, and a useful one: it lets a coordinator start
finding cover instead of waiting. It is silence that escalates.

**Cannot start** appears when a core role — surgeon, anaesthetist or scrub
nurse — has nobody coming. Only those three; a longer list would turn every
board red and train people to ignore the colour.

Cases are ordered by who needs a phone call: blocked first, then longest
waiting. Closed cases sink to the bottom and read as history.

Acknowledgements themselves are made from the **Emergency Booking** page, as
they always have been. This board watches; it does not replace that.

---

## 8. Theatre performance

**Sidebar → Theatre Performance.** Consultants and management.

Punctuality, turnover, utilisation, where the time goes, and delay trends,
broken down **by theatre and by specialty — never by individual**. A ranking
needs at least 10 cases before it is shown at all; below that the sample says
more about luck than about a theatre.

The headline figure is **record completeness** — what proportion of cases have
enough milestones to be assessed. If that is low, nothing else on the page
means anything, so it is shown first.

Consultants see their own punctuality on **My Practice**. Nobody sees a
colleague's.

---

## 9. Booking rules that affect the day

- **A start time and an estimated duration are required** at booking.
- **20 minutes of turnover** is added between cases in a theatre — the patient
  leaves, the room is cleaned, the next patient is brought in. A second case
  booked for the moment the first is due to finish is booked for a time that
  cannot happen, and the booking form will say so.
- When a unit books more than one case in a day, later cases default to a
  start time that already accounts for the case before it plus turnover.

---

## 10. Times and timezones

Theatre lists are written and read in **West Africa Time**. The servers run in
UTC. Every calculation in this module converts explicitly, so a case listed
for 09:00 is judged against 09:00 in Enugu wherever the software happens to be
running.
