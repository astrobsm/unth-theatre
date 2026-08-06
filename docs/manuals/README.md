# UNTH Operative Resource Manager — Manuals

Written August 2026, covering the Theatre Supply Chain, Theatre Billing and
Theatre Operations Intelligence work.

## What is here

| Manual | Who it is for |
| --- | --- |
| [Theatre Operations](./theatre-operations.md) | Everyone who works an operating list |
| [Theatre Supply Chain](./theatre-supply-chain.md) | Store keepers, procurement, pharmacy, CSSD |
| [Theatre Billing](./theatre-billing.md) | Finance, procurement, management |
| [Per-role desks](./desks.md) | Consultants, inventory, vendor accounts, finance |
| [Administrator guide](./administrator-guide.md) | System administrators and theatre management |
| [Hybrid deployment](./hybrid-deployment.md) | Running from the cloud and a hospital server together |
| [Technical reference](./technical-reference.md) | Whoever maintains the software |

## What these manuals do and do not cover

They describe **what the software does**: which screen does what, what each
field means, what the system will and will not accept, and why a rule is
there. Every statement is checked against the code.

They do **not** describe UNTH's own administrative procedure — who signs what,
which committee meets when, what the hospital's policy is on a late start or a
missing consent. Where the software leaves a decision to the hospital, the
manual says so and stops, rather than inventing a rule that nobody agreed to.

Sections marked **▢ Hospital policy** are exactly those points. They are the
places where somebody at UNTH needs to write one or two sentences of local
procedure. They are deliberately left blank rather than filled with a
plausible guess.

## A note on the philosophy the software is built to

Several rules will look unhelpfully strict until you know why they are there.
They are collected here because they explain most of the design:

- **Silence is not consent.** A team is not ready because nobody said
  otherwise; a delay is not acceptable because nobody complained. Screens
  count "no answer" as its own state and show it.
- **The software says what happened; a person says what it means.** The system
  records that a case started late. Only a human being, having read the case,
  may record that a delay was avoidable — and must write down why.
- **No screen names a person as responsible.** There is no column anywhere for
  a person to blame. Reports break down by theatre, department and category.
- **Nothing is measured that was not recorded.** Where a milestone is missing,
  the case is left OUT of a figure rather than counted as a failure.
