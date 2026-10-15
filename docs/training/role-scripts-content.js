/**
 * The nine role scripts. Content written by hand against the real workflows;
 * build-role-scripts.js only formats them.
 */

const { build, G } = require('./build-role-scripts');

const results = [];

// ─── 1. SURGEON — BOOKING AND THE TWO PACKS ────────────────────────────────
results.push(build({
  file: 'SCRIPT-surgeon-booking-and-packs.txt',
  title: 'THE SURGEON: BOOKING A CASE, AND CHOOSING THE TWO PACKS',
  describe: `A consultant surgeon at a Nigerian teaching hospital explains, to camera, how he
books a case and — the part everybody rushes — how he chooses the consumable
pack and the pharmacy pack that go with it. Practical and slightly wry. He has
had cases cancelled for a missing item and talks about it plainly.`,
  who: 'Man in his forties in blue theatre scrubs, surgical cap pushed back, ID badge on a lanyard, arms folded then unfolded as he explains.',
  where: 'a theatre corridor with a noticeboard and a trolley',
  still: 'SURGEON BOOKING SURGERY.jpeg',
  speaker: `Mr Kenneth Adaeze, consultant surgeon. Direct, unhurried, mildly amused at
himself. He is teaching a registrar, not addressing a conference.`,
  shots: [
    [G.toCamera, `I had a case cancelled at ten past nine one morning. The patient had fasted from midnight. The theatre was ready, the team was ready, and the mesh was not in the pack. Nobody did anything wrong that morning. It was decided three weeks earlier, by me, on the booking form, in about four seconds.`],
    [G.explain, `So let me show you how I book now, and where those four seconds actually go. It is not the typing. It is one thing I do before I press save, and it is the difference between a list that runs and a patient sent back to the ward still hungry.`],
    [G.talk, `Patients first, and I search before I register. Most of them are already here. Finding her instead of creating her keeps her whole history attached — her previous operations, her results, her allergies. Creating a second record for the same woman is how a patient ends up with half her history invisible.`],
    [G.talk, `Then Book Surgery. My unit, the procedure — I type two or three letters and it finds it — and the indication, written the way I would write it in the notes. That sentence is what the anaesthetist reads tonight when she decides whether this patient is fit for me in the morning.`],
    [G.explain, `Start time, and how long I think it will take. Both compulsory. I know people resent that. But a case with no start time can never be judged late, and a case with no duration means the case after mine cannot be scheduled at all. So I guess honestly. An honest three hours is worth far more to the coordinator than a hopeful ninety minutes that makes me look efficient.`],
    [G.point, `Now the part I got wrong with the mesh. When I choose the procedure, the consumable pack fills itself in, and the standard theatre pack is added on top of it. It is a good default. It is not a decision.`],
    [G.explain, `So I read it. Every line. And if this particular patient needs something the list does not have — a larger mesh, a different suture, the drill — I add it now, while I am the only person in the building who knows that. That is the four seconds. Not typing. Reading.`],
    [G.talk, `The pharmacy pack is the same idea and a different department. Drugs and dressings for this operation. The moment I save, that list is a job on the pharmacist's screen, and the consumable list is a job on the store's phone — tonight, while the shelves are still reachable and somebody is still there.`],
    [G.talk, `Then the special needs. Blood transfusion is the one that matters most, because ticking it is what tells the blood bank to expect a request, and cross-matching takes time that a patient bleeding on my table does not have. Diathermy, the C-arm, the microscope — each of those is a machine somebody has to physically find and wheel into the right room before nine.`],
    [G.explain, `The pre-operative results I fill in as far as I can, and leave the rest. The case still books. That was deliberate — we used to be blocked because a registrar did not yet hold a result somebody else was carrying in a folder. What is missing does not disappear. It comes back as an outstanding item, on my list and on everybody else's, until whoever holds it enters it.`],
    [G.talk, `I save, and three things exist. The case is on the list and every person linked to it can see it. An amber banner tells me exactly what is still outstanding — that is my work for today, not somebody else's for the morning. And two codes appear, one for the store and one for the pharmacy. I write them on the patient's card. She hands them in and they find her pack without a single phone call.`],
    [G.toCamera, `Booking is not paperwork. It is the instruction this hospital follows tomorrow morning. Read the pack list before you save it — that is the whole lesson, and it costs you four seconds.`],
  ],
}));

// ─── 2. SURGEON — AVAILABILITY AND THE TEAM ────────────────────────────────
results.push(build({
  file: 'SCRIPT-surgeon-availability-and-team.txt',
  title: 'THE SURGEON: SAYING YOU ARE COMING, AND WHAT IT DOES TO THE TEAM',
  describe: `A surgeon explains why he marks himself present or en route for a case, and how
that one tap changes what the theatre, the anaesthetist and the nurses do next.
Honest about the times he did not, and what it cost other people.`,
  who: 'Man in his forties in blue theatre scrubs, surgical cap in one hand, phone in the other.',
  where: 'a changing room doorway opening onto a corridor',
  still: 'SURGEON BOOKING SURGERY.jpeg',
  speaker: `Mr Kenneth Adaeze, consultant surgeon. Slightly rueful in the opening, matter
of fact after that.`,
  shots: [
    [G.toCamera, `A theatre with a full team standing in it, waiting for one person, costs more than anything else we do. I have been that one person. The team did not know whether I was five minutes away or still in clinic, so they waited, and they were right to.`],
    [G.explain, `That is what Team Check-in is for, and it takes about two seconds. It is the smallest thing in this entire application, and I would argue it saves more theatre minutes than anything else I do all day.`],
    [G.talk, `I open the case and I say where I am. Present. En route. Delayed. Unavailable. Those are the only honest answers, and each one tells the theatre something different about what to do next.`],
    [G.talk, `Present means I am in the building and they can send for the patient. En route means start preparing, I am coming. Delayed means do not send for her yet — and, more usefully, it means somebody can decide to run the second case first instead of standing still.`],
    [G.explain, `Unavailable is the one people avoid, and it is the most valuable of the four. If I cannot make it, saying so at seven in the morning gives the coordinator two hours to find a replacement. Saying nothing gives her ten minutes and an angry corridor.`],
    [G.point, `The whole team sees each other's status on the same screen — surgeon, anaesthetist, scrub nurse, circulating nurse. So nobody rings round to find out who is coming. The theatre reads it once.`],
    [G.talk, `There is a second screen, Live Staff Availability, and it answers a different question: not who is coming to this case, but who in the whole suite is reachable right now. Available. Busy. In theatre. On an emergency case. On a break.`],
    [G.explain, `That one matters at night. When an emergency lands and somebody needs the nearest free anaesthetist, that board is how they find one — instead of walking the corridors opening doors. It records your position only while you are on duty and marked, never while you are simply signed in.`],
    [G.talk, `And keep it honest. If you are on a break, say you are on a break. A board where everybody is permanently Available is a board nobody trusts, and then we are back to walking the corridors.`],
    [G.toCamera, `Two seconds when you arrive. That is the whole thing. It is the cheapest courtesy in this hospital and it is the one that stops five people waiting for one.`],
  ],
}));

// ─── 3. PHARMACIST ─────────────────────────────────────────────────────────
results.push(build({
  file: 'SCRIPT-pharmacist.txt',
  title: 'THE PHARMACIST: THE WHOLE ROLE, IN ORDER',
  describe: `A theatre pharmacist explains her entire day in the app, in the order it happens:
work arriving before she is asked, preparing packs, recording what is not
available, the patient code at the window, approvals, and reconciling what was
actually given. Calm, precise, quietly proud of not being ambushed any more.`,
  who: 'Woman in her thirties in a white coat over scrubs, hair covered, spectacles, a pen in her top pocket.',
  where: 'a pharmacy counter with shelving',
  still: 'THEATRE PHARMACIST.jpeg',
  speaker: `Halima Sani, theatre pharmacist. Precise and unhurried. She has been ambushed
at ten to eight often enough to enjoy no longer being.`,
  shots: [
    [G.toCamera, `Ten minutes to eight. A house officer arrives at my window, out of breath, with a handwritten list, for a case that starts at eight. That used to be every single morning of my working life.`],
    [G.explain, `It does not have to be, because that list was written three weeks ago. Nobody had sent it to me. Now it arrives by itself.`],
    [G.talk, `I open Pharmacy and tomorrow's work is already there. Every case booked, with the drugs and dressings the surgeon asked for, the patient, the operation and the time it starts. It landed the moment the case was booked — often days ahead. I am notified when a new one arrives, so I am not sitting refreshing a screen.`],
    [G.explain, `I work down the list and tick as I pick. And if something is not available, I say so here rather than leaving a gap. I mark it, and I write what I am putting in instead.`],
    [G.talk, `That single note appears on the surgeon's case and on the theatre readiness board, tonight. Which is the difference between a substitution agreed calmly at six in the evening, and an argument at the theatre door at half past eight with a patient already on the trolley.`],
    [G.point, `When the patient comes to the window, she brings a code her surgeon gave her at booking. I type it in and her pack comes straight up. No folder number, no spelling her name three different ways, no telephoning the ward. Encourage them to bring it — it is the fastest thing at this counter.`],
    [G.talk, `Rx Approvals holds anything that needs a pharmacist's sign-off before it goes anywhere. Controlled items mostly. It is a queue rather than a pile of paper, and it does not lose things.`],
    [G.explain, `Then Medication Tracking, which is my favourite screen and I will tell you why. It shows what I issued against what the anaesthetist actually recorded as given, case by case. That reconciliation used to be a monthly argument reconstructed from memory and handwriting. Now it is a screen I can open on the day it happened.`],
    [G.talk, `One more thing, and it is a matter of safety rather than tidiness. Record the issue as you hand it over, not at the end of the day. A drug that left this counter but is not recorded as having left is a drug nobody can account for, and that is a conversation you never want to be part of.`],
    [G.toCamera, `Open Pharmacy at four in the afternoon and prepare the morning list before you go home. Do that, and nobody arrives at your window out of breath ever again.`],
  ],
}));

// ─── 4. ANAESTHETIST ───────────────────────────────────────────────────────
results.push(build({
  file: 'SCRIPT-anaesthetist.txt',
  title: 'THE ANAESTHETIST: EVERY STEP, IN THE ORDER IT HAPPENS',
  describe: `A consultant anaesthetist walks through her whole workflow in sequence: the board
the evening before, the pre-operative review, the machine check, initialising
monitoring, recording drugs as she gives them, and handing over to recovery.
Unhurried, exact, and clear that most of her safety is bought the night before.`,
  who: 'Woman in her forties in green theatre scrubs, hair covered, stethoscope round her neck, glasses.',
  where: 'an anaesthetic room with a machine and monitor',
  still: 'generate — female consultant anaesthetist, Nigerian, green scrubs, anaesthetic room',
  speaker: `Dr Ngozi Anyanwu, consultant anaesthetist. Measured. She teaches by explaining
consequences rather than rules.`,
  shots: [
    [G.toCamera, `Ten past eight, at the theatre door, meeting a patient for the first time. Her potassium is six point nine. The case is now cancelled, the list has lost two hours, and every one of those facts was available last night while I was at home.`],
    [G.explain, `So my workflow starts the evening before, not in the morning. Let me take you through it in order.`],
    [G.talk, `First, the Anaesthetist Board. That is my list, not the surgeon's. Tomorrow's cases grouped by theatre, each showing the operation, the planned anaesthetic, and whether it has been reviewed. Twenty minutes with that screen the night before is the difference between a list that runs and a morning spent apologising.`],
    [G.talk, `Second, the pre-operative review. I tap a case and the bloods the surgical team entered are already there — I am not chasing them. I add the airway assessment, the ASA grade, the comorbidities, the drugs she is on. Then the decision: fit, fit with conditions, or not fit. And I write the reason.`],
    [G.explain, `Write it properly. That note is read by the surgeon, by the coordinator, and by whoever is on tomorrow if it is not me. A clear sentence tonight prevents four telephone calls in the morning, and one of those calls would have been to me.`],
    [G.point, `When I save it, it is everywhere at once. The surgical team see it, the readiness board sees it, and the case stops pretending it is ready. Nobody has to be telephoned. That is the entire reason I do it there instead of writing it in the folder.`],
    [G.talk, `Third, on the morning: Anaesthesia Setup. Machine, circuit, suction, airway trolley, drugs drawn up, monitoring. I tick each one as I do it — not before. When the last one is ticked, my theatre shows as anaesthetically ready, and the coordinator stops asking.`],
    [G.talk, `Fourth, when the case starts, I initialise monitoring. I get a timeline for this patient, and I enter observations as I take them — pressure, pulse, saturation, temperature. They build a chart as the case runs. If the connection drops, I keep recording. It is held on the machine and sent when the signal returns.`],
    [G.explain, `Fifth, the drugs go on that same timeline. What, how much, when. Two things follow. My anaesthetic record writes itself, so there is nothing to reconstruct at the end. And the pharmacy can see what was actually used against what was issued — which is how the controlled drug register stopped being an argument at the end of every month.`],
    [G.talk, `Sixth, I close the record, and it travels straight to recovery. The nurse receiving my patient has the anaesthetic, the drugs, the losses and my instructions before the trolley reaches her. She is not waiting on a piece of paper and she is not relying on thirty seconds of conversation in a doorway.`],
    [G.explain, `Emergencies come to me the same way but faster — an alert on the phone, and a shorter assessment built for a corridor. Fill in what you have. An emergency review with three fields completed is worth more than a perfect one that never gets written.`],
    [G.toCamera, `One thing, if you take nothing else: open the board at six in the evening, not eight in the morning. Almost all of my safety is bought the night before.`],
  ],
}));

// ─── 5. RECOVERY ROOM NURSE ────────────────────────────────────────────────
results.push(build({
  file: 'SCRIPT-recovery-room-nurse.txt',
  title: 'THE RECOVERY NURSE: RECEIVING, WATCHING, AND DISCHARGING SAFELY',
  describe: `A recovery room nurse explains what she does from the moment a trolley comes
through her door: what is already on her screen before it arrives, recording
observations that build a trend, scoring discharge rather than judging it, and
escalating when a patient deteriorates. Warm, firm, protective of her bay.`,
  who: 'Woman in her thirties in green scrubs, hair covered, fob watch pinned to her tunic.',
  where: 'a recovery bay with monitors and curtained spaces',
  still: 'RECOVERY ROOM NURSE.jpeg',
  speaker: `Chinelo Agu, recovery room nurse. Warm but immovable when somebody is pressing
her for a bay.`,
  shots: [
    [G.toCamera, `A patient comes through my door with thirty seconds of handover and no notes, and the anaesthetist is already back in theatre. I am about to look after somebody I know nothing about. That is how recovery used to begin.`],
    [G.explain, `Now she is on my screen before the trolley even reaches my door. Let me show you the four things I do, in the order I do them, from the moment she comes through it.`],
    [G.talk, `First, I open PACU and she is already there. The anaesthetic that was used, the drugs given and when, blood loss, and what the anaesthetist wants watched. It arrived when the record was closed in theatre. I am not waiting for paper and I am not relying on a doorway conversation.`],
    [G.talk, `Second, I record observations as I take them, and they build a trend rather than a page of numbers. A pressure that is falling slowly looks completely different from three numbers written down separately, and it is the falling I need to see.`],
    [G.explain, `Pain and nausea go here too. Those two decide how the patient remembers the entire operation. She will forget the incision. She will not forget four hours of vomiting, and neither will her family.`],
    [G.point, `Anything I give is logged against her, so the ward can see exactly what she has had and when the next dose is due. That stops the double dose, and it stops the missed one.`],
    [G.talk, `Third, discharge. And discharge is a score, not a feeling. I work through the criteria — consciousness, breathing, circulation, pain, nausea, mobility. When she meets them, I record where she is going and the ward is told she is coming.`],
    [G.explain, `If she does not meet them, that is recorded too. And that record is the strongest thing I have when somebody senior is standing over me asking for the bay. I am not refusing him. The score is.`],
    [G.talk, `Fourth, if a patient deteriorates, I raise it from this screen. It alerts the anaesthetist directly instead of sending somebody to find one, and it timestamps the moment I was worried. That timestamp matters afterwards, and it matters for me.`],
    [G.toCamera, `Open PACU before the trolley arrives, not after. Two minutes of reading, and you meet your patient already knowing her.`],
  ],
}));

// ─── 6. ANAESTHETIC TECHNICIAN ─────────────────────────────────────────────
results.push(build({
  file: 'SCRIPT-anaesthetic-technician.txt',
  title: 'THE ANAESTHETIC TECHNICIAN: THE ROOM, THE MACHINE, AND WHAT IS BROKEN',
  describe: `An anaesthetic technician explains his morning: finding which theatre he is on,
the machine and airway check, booking equipment in and out, and reporting faults
so they actually get fixed. Practical, direct, no ceremony.`,
  who: 'Man in his thirties in green scrubs, theatre clogs, a cylinder key clipped to his waist.',
  where: 'an empty theatre before a list, with an anaesthetic machine',
  still: 'ANAESTHETIC TECHNICIAN.jpeg',
  speaker: `Peter Musa, anaesthetic technician. Says things once, plainly.`,
  shots: [
    [G.toCamera, `Twenty to eight. Nobody is in the room yet and the suction is not connected. This is the last five minutes in which that is a small problem.`],
    [G.explain, `Four screens carry my whole day and none of them takes long. Between them they answer where I am working, whether my room is ready, where the shared equipment went, and what is broken.`],
    [G.talk, `First, Technician Coverage. It tells me which theatre I am on today, and who is on the others. I am rostered to a theatre rather than to a specialty, because my work follows the room. If my name is not there, the roster has not been published — and I say so at seven, not at half past.`],
    [G.talk, `Second, Anaesthesia Setup for my room. Machine, circuit, suction, airway trolley, monitoring. I tick each one as I do it, never in advance. When the last one is ticked, the room shows as ready and the coordinator stops asking me.`],
    [G.point, `Third, Equipment Checkout. Anything that moves between theatres — book it out when you take it, book it back when it returns. This is not bureaucracy. It is so that when a machine is needed urgently at two in the morning, somebody can see which room it is in instead of opening six doors.`],
    [G.talk, `Fourth, Fault Alerts. If something is broken, I raise it there and I photograph it. It goes straight to biomedical engineering with the theatre, the machine and the time attached.`],
    [G.explain, `And that is the difference that matters. A fault reported that way gets fixed. A fault mentioned to an engineer in a corridor is forgotten by the afternoon — not because anybody is careless, but because he was told three things in three corridors and got one of them clearly.`],
    [G.talk, `One more habit worth having. When a machine is repaired and back in service, set it back. A machine that works but is still marked broken is a machine nobody uses, and we have too few of them for that.`],
    [G.toCamera, `Check Technician Coverage before you leave the changing room. Then the first thing you do in the room is the suction.`],
  ],
}));

// ─── 7. SCRUB / CIRCULATING NURSE ──────────────────────────────────────────
results.push(build({
  file: 'SCRIPT-scrub-and-circulating-nurse.txt',
  title: 'THE SCRUB AND CIRCULATING NURSE: READINESS, CHECKLISTS, MILESTONES, HANDOVER',
  describe: `A senior scrub nurse explains her day in order: checking pack readiness the
evening before, checking in, the WHO pauses, tapping milestones as they happen,
and writing the handover as the shift runs. Brisk, generous, absolutely certain
about the checklist.`,
  who: 'Woman in her forties in green scrubs, hair fully covered, mask pulled down under her chin, gloved hands held away from her body at first then relaxed.',
  where: 'a theatre with an instrument trolley and overhead lights',
  still: 'nurse sussan.png',
  speaker: `Sister Sussan Okoro, senior scrub nurse. Brisk and warm. Immovable on the
checklist and says so.`,
  shots: [
    [G.toCamera, `A coordinator walking into four theatres asking the same question, and by the time she reaches the fourth, the answer from the first has already changed. That was every morning. One screen answers it for every room at once now.`],
    [G.explain, `My day runs in five steps, and the first happens the evening before, while I can still do something about whatever I find. That is the whole trick of this job.`],
    [G.talk, `Case Pack Readiness, at six in the evening. Every case tomorrow, and whether its pack exists yet. A case with no pack at six in the evening is a problem I can solve. The same case at half past eight in the morning is a cancellation with a fasted patient on a trolley.`],
    [G.talk, `Then Theatre Readiness, which is every room side by side — anaesthesia, equipment, packs, sterile supply, cleaning, staff. Green means somebody has confirmed it. Amber means it is waiting on someone. Nobody fills that board in as a form; it builds itself from what each department has already recorded.`],
    [G.point, `In the morning, Team Check-in. I tap in when I arrive at my theatre. Two seconds, and it replaces the coordinator's walk. It is also the fairest record any of us has on a day when somebody claims a theatre was unstaffed.`],
    [G.explain, `Then the checklists, and I will not be moved on this one. Three pauses. Sign in before anaesthesia. Time out before incision. Sign out before she leaves the room.`],
    [G.talk, `Tick as the answer is spoken aloud, by the person responsible for it. Not in advance, and not by one person reading it quietly to themselves. A checklist ticked silently has caught nothing at all. The entire value is in the room hearing the answer.`],
    [G.talk, `Through the case, Record Milestones. Big buttons, one tap, and the time is recorded for me. Sent for. Arrived. Anaesthesia started. Knife to skin. Out to recovery. Every report and every conversation about delay is built from those later.`],
    [G.explain, `Tap them as they happen. Filled in from memory at four in the afternoon they are fiction, and then somebody uses that fiction to decide how many staff this suite needs.`],
    [G.talk, `Last, the handover. Write it as the shift runs, a line at a time, not at the end. Ten seconds each. What is done, what is left, what broke, what has run low, and which patient I am worried about.`],
    [G.explain, `And if you are the one coming on, read it before you walk in. Two minutes in the changing room, and you enter already knowing the diathermy is intermittent and the second case has a difficult airway. That is a completely different shift from one that starts with a whispered handover in a doorway.`],
    [G.toCamera, `Open Case Pack Readiness at six in the evening. Everything else that morning gets easier because you did.`],
  ],
}));

// ─── 8. HOLDING AREA NURSE ─────────────────────────────────────────────────
results.push(build({
  file: 'SCRIPT-holding-area-nurse.txt',
  title: 'THE HOLDING AREA NURSE: THE LAST PLACE A MISTAKE IS STILL CHEAP',
  describe: `A holding area nurse explains receiving a patient: marking her arrived, working
the same check every time, and flagging what does not add up while there are
still choices. Calm, kind to patients, completely unembarrassed about stopping a
list.`,
  who: 'Woman in her thirties in green scrubs, hair covered, a folder under one arm.',
  where: 'a holding bay with a trolley and a curtain',
  still: 'generate — female nurse, Nigerian, green scrubs, holding bay with trolley',
  speaker: `Sister Grace Ibrahim, holding area nurse. Gentle with patients, immovable about
the check.`,
  shots: [
    [G.toCamera, `A patient on a trolley in my corridor, nine minutes, alone. Nobody here knows which theatre she is for and her folder is still on the ward. This is the exact point in the journey where patients get lost.`],
    [G.explain, `Two things stop that from ever happening, and the first is a single tap. The second is a list I work exactly the same way every time, no matter who is on duty or how far behind we are running.`],
    [G.talk, `Theatre Reception lists everyone expected today. When she reaches my door, I find her and I mark her arrived. That one tap tells the theatre she is in the building, it stops the send-for announcement repeating, and it starts the clock that tells us honestly how long she waited.`],
    [G.explain, `Mark it when the trolley stops, not when you get a free minute. If you ever hear the same patient called over and over on the radio, that is somebody who has arrived and not been marked, and it teaches the whole suite to ignore the announcements.`],
    [G.talk, `Then the holding assessment, which is the last check before the doors. Identity. The marked site. When she last ate. Consent sighted — sighted, not assumed. Jewellery and prosthetics, allergies, and a set of observations.`],
    [G.explain, `It is deliberately the same list every single time, in the same order, so that nothing depends on who happens to be on duty. The morning it saves you will be a morning you were tired.`],
    [G.point, `And if something does not add up, record it exactly as it is. Do not round the fasting time. Do not assume somebody else noticed the consent was not in the folder. Flag it here, and the anaesthetist knows within seconds — while she is still outside the theatre, and while there are still choices.`],
    [G.talk, `People worry that flagging something makes them unpopular. It does not. What makes you unpopular is the theatre finding it at the door with the patient already on the table, because then nobody has any options at all.`],
    [G.talk, `And talk to her while you work. She is frightened, she has been awake since five, and you are the last person who will speak to her properly before she goes to sleep. The check is on the screen so that your attention can be on her.`],
    [G.toCamera, `Mark arrival the moment the trolley stops. Work the list the same way every time. Flag what does not add up, early and out loud.`],
  ],
}));

// ─── 9. DUTY ROSTER ────────────────────────────────────────────────────────
results.push(build({
  file: 'SCRIPT-duty-roster.txt',
  title: 'THE DUTY ROSTER: ENTERING IT, AND THE BUTTON THAT MAKES IT REAL',
  describe: `A departmental rota-holder explains how a roster is built and — the part that
catches everyone — published. Covers choosing the week, adding staff, the
assignment field that decides everything, and what happens to booked cases the
moment Publish is pressed. Wry about having learned this the hard way.`,
  who: 'Woman in her fifties in green scrubs with a cardigan over them, reading glasses on, phone in hand.',
  where: 'a small office with a window and a wall planner',
  still: 'THEATRE MANAGER.jpeg',
  speaker: `Matron Adaora Nnaji, who holds the anaesthetists' rota. Dry, precise, and
completely direct about the mistake she made herself.`,
  shots: [
    [G.toCamera, `Twenty-two people, entered correctly, for a Monday. And on Monday morning every case on the list said no anaesthetist assigned. The roster was right. I had simply not pressed the last button.`],
    [G.explain, `So let me show you the whole thing, start to finish, and I will tell you exactly where it goes wrong. It is always the same place, and it is not the part anybody expects.`],
    [G.talk, `First, check the week you are looking at. The page opens on a week, and if you are building the coming week you must be looking at the coming week. Rows dated outside the week on screen are not part of what you publish. That is the mistake I made, and it is the commonest one.`],
    [G.talk, `Then add people. Type part of a name and it finds them. Choose the shift — Electives, or Call and Emergencies. And then the assignment field, which is the one that decides everything.`],
    [G.explain, `For anaesthetists, that field is the surgical specialty they are covering. For technicians it is the theatre. That single field is how a booked case finds the right person. Leave it empty and the case will read as unassigned tomorrow, no matter how carefully you did the rest.`],
    [G.point, `Do it from your phone if that is easier. Every field fits on the smallest screen — nothing is hidden behind a scroll — because most rosters in this hospital are built standing up, and often at night.`],
    [G.explain, `Now the important part. What you have entered is a DRAFT. It does nothing at all. It does not reach booking, it does not reach the coverage screen, and it does not reach theatre readiness. A counter tells you how many changes are waiting.`],
    [G.talk, `Press Publish. The version number goes up, a permanent snapshot is taken of exactly what was published and by whom, and only now does the rest of the hospital see it. If that counter is not zero, you have not finished.`],
    [G.explain, `And watch what happens to cases that were already booked. They pick up their anaesthetist automatically, at that moment. That used to have to be done by hand, case by case — fifteen of them, one morning, before anyone noticed.`],
    [G.talk, `The response also tells you which specialties still have cases and nobody rostered to them. Read that. It is the gap worth chasing while there is still an afternoon left to chase it in.`],
    [G.talk, `Later changes work the same way. Amend, then publish again. Every version is kept, so when somebody asks what the roster said on a particular day, the answer is a record rather than a memory.`],
    [G.toCamera, `Check the week. Fill the assignment field. Press Publish, and make sure the counter reads zero. Three habits, and the theatre never wonders who is covering it.`],
  ],
}));

console.log(`${results.length} scripts written to ${'C:/Users/HomePC/Documents/phone and desktop screenshots'}\n`);
for (const r of results) console.log(`  ${r.file.padEnd(46)} ${String(r.shots).padStart(2)} shots  ~${r.runtime}`);
