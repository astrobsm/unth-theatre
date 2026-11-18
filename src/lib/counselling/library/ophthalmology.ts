// Ophthalmology — the largest group in the catalogue, at 29 categories.
//
// Keys match the `category` strings in src/lib/procedures/catalogue.ts exactly.
//
// A NOTE ON ONE RISK THAT RECURS BELOW. Infection inside the eye
// (endophthalmitis) is rare after any intraocular procedure — of the order of
// one in a thousand — and is the one complication that can take the sight of
// an eye within days. It is written out wherever the eye is entered, in the
// same words, because a patient who recognises it and returns the same day
// keeps vision that a patient who waits a week does not.

import type { CounsellingLibrary } from '../types';

export const OPHTHALMOLOGY: CounsellingLibrary = {
  'Cataract and lens surgery': {
    whatItIs:
      'Removal of the eye’s clouded natural lens through a small incision, and replacement '
      + 'with a clear artificial lens. Usually under local anaesthetic, with you awake.',
    whyItIsDone:
      'For clouding of the lens causing blurred vision, glare, difficulty reading or driving, '
      + 'or where the cataract prevents treatment of the retina.',
    benefits: [
      'Restores clear vision in the great majority of eyes — one of the most reliably '
      + 'successful operations in medicine.',
      'Reduces glare and improves colour and contrast.',
      'Often reduces dependence on spectacles for distance, though reading glasses are usually '
      + 'still needed.',
    ],
    risks: [
      'Infection inside the eye, which is rare but can blind the eye. Redness, increasing pain '
      + 'and falling vision in the days afterwards means come back the same day.',
      'The back of the lens capsule can tear during surgery, needing a different lens position '
      + 'or a second procedure.',
      'Swelling at the centre of the retina, causing blurred vision for weeks to months.',
      'Retinal detachment, more likely in short-sighted eyes.',
      'The capsule clouds over months to years in many patients, treated painlessly with a '
      + 'laser in clinic.',
      'The lens power may not be exactly right, leaving you needing spectacles.',
      'Raised pressure, bleeding, or drooping of the lid.',
      'Where the eye has other disease, vision may not improve as much as hoped.',
    ],
    alternatives: [
      'Stronger spectacles and better lighting, which help in early cataract.',
      'Waiting — cataract surgery is rarely urgent and can be timed to suit you.',
      'Choosing not to operate, accepting gradual loss of vision.',
    ],
    recovery:
      'A day case. Vision is often useful within days and settles over four to six weeks. Use '
      + 'the drops exactly as prescribed. Do not rub the eye. Avoid swimming and dusty work '
      + 'for a month. New spectacles at about six weeks.',
  },

  'Congenital cataract and paediatric lens surgery': {
    whatItIs:
      'Removal of a clouded lens in a baby or child, with or without an artificial lens, '
      + 'followed by careful correction of the focus with spectacles or contact lenses.',
    whyItIsDone:
      'Because a clouded lens in early childhood prevents the visual pathway from developing, '
      + 'and that loss becomes permanent if not treated promptly.',
    benefits: [
      'Allows light to reach the retina so that vision can develop.',
      'Early surgery gives the best chance of useful sight in that eye.',
      'Prevents the eye from becoming permanently lazy.',
    ],
    risks: [
      'Glaucoma after lens surgery in infancy, which can appear years later and requires '
      + 'lifelong monitoring.',
      'The visual pathway may still not develop fully, and patching of the better eye is '
      + 'usually needed for years — this is demanding for families and is the main determinant '
      + 'of the result.',
      'Clouding behind the lens needing further surgery, which is common in children.',
      'The eye grows, so the lens power changes; spectacles must be updated frequently and '
      + 'further surgery may be needed.',
      'Infection inside the eye, retinal detachment, or inflammation.',
      'General anaesthesia, often repeated for examinations.',
    ],
    alternatives: [
      'Contact lenses rather than an implanted lens in the youngest children.',
      'Delaying implantation until the eye has grown.',
      'Observation only for a small, partial cataract not affecting vision.',
    ],
    recovery:
      'Day case or one night. Drops for weeks. Optical correction and patching begin almost at '
      + 'once and continue for years, with frequent review.',
  },

  'Glaucoma surgery': {
    whatItIs:
      'An operation to lower the pressure inside the eye — creating a new drainage channel, '
      + 'implanting a drainage device, or treating the structure that produces fluid.',
    whyItIsDone:
      'Because pressure is damaging the optic nerve despite drops or laser, and sight already '
      + 'lost cannot be recovered.',
    benefits: [
      'Lowers the pressure, which is the only treatment shown to slow glaucoma.',
      'Preserves the sight that remains.',
      'May reduce or remove the need for daily drops.',
    ],
    risks: [
      'Surgery preserves vision but does not restore what has been lost. This is the single '
      + 'most important thing to understand before consenting.',
      'Pressure may fall too low, causing blurred vision and, rarely, fluid under the retina.',
      'The drainage channel can scar closed, and further surgery or injections may be needed.',
      'Cataract commonly develops or worsens afterwards.',
      'Infection in or around the drainage bleb, which can occur years later — a red, painful, '
      + 'sticky eye means come back at once.',
      'Drooping lid, double vision, or discomfort from a drainage tube.',
      'Loss of central vision shortly after surgery in advanced disease, which is uncommon but '
      + 'devastating.',
    ],
    alternatives: [
      'Continuing or intensifying drops.',
      'Laser treatment to the drainage angle, which is simpler and repeatable.',
      'Accepting the pressure and the likely rate of visual loss, which may be reasonable in '
      + 'advanced age or limited life expectancy.',
    ],
    recovery:
      'A day case or one night. Frequent visits in the first weeks, because the pressure is '
      + 'adjusted by releasing sutures or giving injections. Avoid heavy lifting and bending '
      + 'for a month. Do not rub the eye, ever.',
  },

  'Acute glaucoma and emergency procedures': {
    whatItIs:
      'Urgent treatment to lower a suddenly very high pressure in the eye — with drops and '
      + 'tablets, a laser opening in the iris, or an operation.',
    whyItIsDone:
      'Because very high pressure causes severe pain, vomiting and rapid, permanent damage to '
      + 'the optic nerve. This is an emergency measured in hours.',
    benefits: [
      'Relieves severe pain and nausea, often quickly.',
      'Prevents permanent loss of sight from continuing high pressure.',
      'A laser opening prevents the attack recurring, and is usually done in the other eye too '
      + 'as it is at the same risk.',
    ],
    risks: [
      'Sight already lost during the attack does not return.',
      'Transient blurring, glare or a line of light after the laser opening.',
      'Bleeding from the iris, and a rise in pressure immediately after treatment.',
      'The opening can close, requiring repeat.',
      'Cataract may develop or worsen.',
      'The attack can recur if the opening is inadequate.',
    ],
    alternatives: [
      'Medicines alone, which lower pressure but do not remove the underlying cause.',
      'Removing the lens, which in some eyes is the definitive treatment.',
      'There is rarely a safe option to delay — delay here is measured in lost sight.',
    ],
    recovery:
      'Often same-day treatment. Drops continue for a period. Both eyes are usually treated. '
      + 'Return immediately if pain or redness recurs.',
  },

  'Congenital glaucoma': {
    whatItIs:
      'An operation in a baby or young child to open or bypass the eye’s drainage structures '
      + 'and lower the pressure.',
    whyItIsDone:
      'Because raised pressure in an infant eye enlarges and clouds the cornea, causes '
      + 'watering and light sensitivity, and damages the optic nerve permanently.',
    benefits: [
      'Lowers pressure and halts damage to the developing eye.',
      'Clears the cornea so that vision can develop.',
      'Relieves the pain, watering and light sensitivity.',
    ],
    risks: [
      'More than one operation is commonly needed; the first may not control the pressure.',
      'Vision may remain poor despite good pressure control, because of corneal scarring, '
      + 'short-sightedness or a lazy eye.',
      'Lifelong follow-up, with examinations under anaesthetic in early years.',
      'Infection, bleeding inside the eye, or cataract.',
      'The eye may remain larger than the other, with lasting short-sightedness and the need '
      + 'for spectacles and patching.',
    ],
    alternatives: [
      'Drops to lower pressure, which are rarely sufficient alone in infants and are used to '
      + 'buy time.',
      'A different surgical technique if the first fails.',
      'There is no safe option of leaving the pressure untreated.',
    ],
    recovery:
      'One to two nights. Drops for weeks. Examinations under anaesthetic at intervals. '
      + 'Spectacles and patching are usually part of the long-term plan.',
  },

  'Vitrectomy and vitreous surgery': {
    whatItIs:
      'Removal of the clear jelly filling the eye, through very fine instruments, to allow '
      + 'work on the retina, clear blood, or remove scar tissue.',
    whyItIsDone:
      'For bleeding into the eye, scar tissue pulling on the retina, infection, a retained '
      + 'foreign body, or retinal detachment.',
    benefits: [
      'Clears blood and opacity so that light reaches the retina again.',
      'Relieves traction on the retina, preventing or treating detachment.',
      'Allows direct treatment of the retina.',
    ],
    risks: [
      'Cataract develops in most eyes within a year or two after vitrectomy, and often needs '
      + 'surgery.',
      'Retinal tear or detachment during or after the operation.',
      'Raised pressure in the eye.',
      'Infection inside the eye — rare, and an emergency.',
      'Bleeding recurring into the eye.',
      'If gas or oil is placed, posturing face-down may be required for days, and you must not '
      + 'fly or travel to altitude while gas remains in the eye. That restriction is absolute.',
      'Vision may not improve if the retina is already damaged.',
    ],
    alternatives: [
      'Observation, since some bleeding into the eye clears by itself over weeks to months.',
      'Laser treatment where the view permits.',
      'Injections into the eye for some conditions.',
      'Choosing not to operate, accepting the current vision and the risk of progression.',
    ],
    recovery:
      'Day case or one night. Drops for weeks. Posturing where instructed, which is '
      + 'uncomfortable but determines the result. Vision is blurred for weeks and improves '
      + 'gradually; with gas it clears only as the bubble absorbs.',
  },

  'Retinal detachment surgery': {
    whatItIs:
      'An operation to reattach the retina — sealing the tear and supporting the retina with a '
      + 'band around the eye, a gas bubble, or vitrectomy with gas or oil.',
    whyItIsDone:
      'Because a detached retina loses its blood supply and dies, and the sight it carried is '
      + 'lost permanently. It is urgent.',
    benefits: [
      'Reattaches the retina in the great majority of cases, often at the first operation.',
      'Preserves the vision that remains, and prevents the detachment spreading to the centre.',
      'Where the centre is still attached, operating promptly preserves good central vision.',
    ],
    risks: [
      'The retina can detach again, and further surgery is needed in a proportion of eyes.',
      'Vision often does not return to normal, particularly if the centre of the retina was '
      + 'already detached. Expectations should be set honestly now.',
      'Scar tissue can form on the retina and pull it off again, which is the commonest reason '
      + 'for failure.',
      'Cataract, raised pressure, double vision from a band around the eye, and change in the '
      + 'eye’s focus.',
      'Infection inside the eye.',
      'With gas: strict posturing, and an absolute ban on flying or altitude until it absorbs. '
      + 'With oil: a further operation to remove it later.',
    ],
    alternatives: [
      'Sealing a tear with laser or freezing alone, where the retina has not yet detached.',
      'A gas bubble with posturing, without vitrectomy, for selected detachments.',
      'Observation only where the eye has no useful vision and no symptoms.',
    ],
    recovery:
      'One to two nights. Posturing for several days where instructed. Vision recovers slowly '
      + 'over months. Follow-up is frequent at first. Report sudden worsening at once.',
  },

  'Macular and retinal procedures': {
    whatItIs:
      'Fine surgery at the centre of the retina — peeling a membrane, closing a hole, or laser '
      + 'treatment to the retina.',
    whyItIsDone:
      'For distortion or blurring of central vision from a membrane or a hole, or to treat '
      + 'abnormal blood vessels and leakage.',
    benefits: [
      'Reduces distortion and often improves central vision.',
      'Closes a macular hole in the large majority of cases.',
      'Laser treatment reduces the risk of severe visual loss in diabetic eye disease.',
    ],
    risks: [
      'Improvement is often partial. Long-standing distortion may persist even after '
      + 'successful surgery.',
      'Cataract almost always follows vitrectomy in an eye that still has its natural lens.',
      'The hole may fail to close, or reopen, needing further surgery.',
      'Face-down posturing for several days is usually required after macular hole surgery.',
      'Laser treatment itself destroys some retina: side vision and night vision are reduced, '
      + 'which is the accepted trade for preserving central sight.',
      'Retinal tear, detachment, bleeding, raised pressure or infection.',
    ],
    alternatives: [
      'Observation, since mild membranes may not progress.',
      'Injections into the eye for leakage and abnormal vessels.',
      'Magnifiers and low-vision support rather than surgery.',
    ],
    recovery:
      'Day case. Posturing as instructed. Vision blurred for weeks, with improvement continuing '
      + 'for six to twelve months. Drops for several weeks.',
  },

  'Retinopathy of prematurity and paediatric retinal surgery': {
    whatItIs:
      'Laser treatment, injection, or surgery to the retina of a premature baby whose retinal '
      + 'blood vessels are growing abnormally.',
    whyItIsDone:
      'Because abnormal vessels can pull the retina off, causing blindness, and treatment at '
      + 'the right moment prevents it. Timing is critical and screening exists for that reason.',
    benefits: [
      'Greatly reduces the risk of retinal detachment and blindness.',
      'Preserves useful vision in most treated babies.',
      'Treatment at the correct stage is far more effective than surgery after detachment.',
    ],
    risks: [
      'Laser destroys peripheral retina, reducing side vision, and most treated children are '
      + 'significantly short-sighted.',
      'The disease can progress despite treatment, and retreatment may be needed.',
      'Injections can be followed by late reactivation, so follow-up must continue.',
      'Surgery after detachment has already occurred has a poor outcome for vision.',
      'The procedure is done in a fragile baby and carries risks of apnoea and instability.',
      'Lifelong follow-up for squint, lazy eye, glaucoma and retinal problems.',
    ],
    alternatives: [
      'Continued close screening without treatment where the disease has not reached the '
      + 'threshold.',
      'Injection instead of laser in selected cases, which spares peripheral retina but needs '
      + 'longer follow-up.',
      'There is no safe option of leaving threshold disease untreated.',
    ],
    recovery:
      'Performed in the neonatal unit or theatre. The baby is monitored closely afterwards. '
      + 'Eye examinations continue weekly at first, then for years.',
  },

  'Intravitreal procedures': {
    whatItIs:
      'An injection of medicine directly into the jelly of the eye, performed in a sterile '
      + 'room under local anaesthetic drops. It takes a few minutes.',
    whyItIsDone:
      'For leakage and abnormal blood vessels at the macula — in diabetes, age-related macular '
      + 'degeneration, or after a vein blockage — and for infection inside the eye.',
    benefits: [
      'Reduces swelling and leakage at the centre of the retina.',
      'Preserves vision, and in many patients improves it, which no previous treatment achieved.',
      'Done in minutes, without a general anaesthetic.',
    ],
    risks: [
      'Infection inside the eye. Rare — roughly one in a thousand injections — and the reason '
      + 'you must return the same day with increasing pain, redness or falling vision.',
      'Raised pressure in the eye immediately afterwards.',
      'Floaters, a red patch on the white of the eye, and grittiness for a day or two — all '
      + 'common and harmless.',
      'Retinal tear or detachment, and bleeding inside the eye. Rare.',
      'Cataract progression from repeated injections or from steroid.',
      'Treatment is usually repeated, often monthly at first and then at intervals for years. '
      + 'Stopping early loses the benefit.',
    ],
    alternatives: [
      'Laser treatment, for some conditions.',
      'Observation where the macula is not threatened.',
      'Controlling blood sugar and blood pressure, which is not an alternative to injection but '
      + 'is essential alongside it.',
      'Choosing not to treat, accepting progressive loss of central vision.',
    ],
    recovery:
      'Home within the hour. Vision is blurred for a day. Do not rub the eye. Come back at once '
      + 'if the eye becomes more painful or red, or vision falls, over the following days.',
  },

  'Intraocular tamponade and silicone oil procedures': {
    whatItIs:
      'Filling the eye with gas or silicone oil to hold the retina in place while it heals, '
      + 'and later a second operation to remove the oil.',
    whyItIsDone:
      'To support a repaired retina, particularly in complicated or recurrent detachment.',
    benefits: [
      'Holds the retina in position reliably while scarring seals it.',
      'Oil gives long-term support in complex cases where gas would absorb too soon.',
      'Allows useful vision while the eye is filled, unlike gas.',
    ],
    risks: [
      'With gas: vision is very poor until it absorbs, and you MUST NOT fly or travel to '
      + 'altitude until it has gone. Doing so can cause irreversible blindness.',
      'Posturing, often face-down, for days — uncomfortable but important.',
      'With oil: cataract, raised pressure, and oil passing into the front of the eye and '
      + 'touching the cornea.',
      'Oil usually needs a second operation to remove, and the retina can re-detach when it is '
      + 'taken out.',
      'If oil is left long term, it can affect the cornea and the optic nerve.',
      'Vision may remain limited because of the original retinal damage.',
    ],
    alternatives: [
      'Gas rather than oil where the case is less complex.',
      'Leaving oil in place permanently in an eye with limited visual potential.',
      'Not operating, where the eye has no useful vision.',
    ],
    recovery:
      'Posturing for days after gas. Gas absorbs over two to eight weeks depending on the type. '
      + 'Oil removal is planned months later. Pressure is checked frequently throughout.',
  },

  'Corneal transplantation': {
    whatItIs:
      'Replacing the clouded or damaged cornea — the clear window at the front of the eye — '
      + 'with donated tissue, either the full thickness or a selected layer.',
    whyItIsDone:
      'For scarring, clouding, swelling, thinning or distortion of the cornea that cannot be '
      + 'corrected with spectacles or contact lenses.',
    benefits: [
      'Restores a clear window and, with it, vision in most eyes.',
      'Relieves pain from a swollen or ulcerated cornea.',
      'Partial-thickness grafts recover faster and reject less often than full-thickness ones.',
    ],
    risks: [
      'Rejection of the graft, which can occur at any time, even years later. Redness, pain, '
      + 'light sensitivity or falling vision means return the same day — early treatment '
      + 'usually saves the graft.',
      'Graft failure, needing a repeat transplant.',
      'Long-term steroid drops, with the risk of raised pressure and cataract.',
      'Astigmatism after a full-thickness graft, often needing hard contact lenses or further '
      + 'surgery.',
      'Loose or broken sutures causing irritation and infection; sutures may stay in for a '
      + 'year or more.',
      'Infection inside the eye.',
      'Availability of donor tissue may delay surgery.',
    ],
    alternatives: [
      'Rigid contact lenses, which correct many irregular corneas without surgery.',
      'Partial rather than full-thickness transplantation.',
      'Treatment aimed only at comfort in an eye with no visual potential.',
    ],
    recovery:
      'Day case or one night. Drops for a year or longer. Vision improves over months and the '
      + 'final result may take a year. Protect the eye from injury permanently — a transplanted '
      + 'eye is more fragile.',
  },

  'Corneal repair and reconstruction': {
    whatItIs:
      'Repair of a cut, perforation, ulcer or thinning of the cornea — with sutures, tissue '
      + 'glue, a graft of membrane, or a patch.',
    whyItIsDone:
      'For injury, perforation, or an ulcer that is thinning the cornea and threatening to '
      + 'burst.',
    benefits: [
      'Restores the integrity of the eye, which is the first priority — a perforated eye can '
      + 'be lost.',
      'Relieves pain and allows healing.',
      'Preserves the possibility of later visual rehabilitation.',
    ],
    risks: [
      'Scarring, which may leave vision permanently reduced depending on where it sits.',
      'Astigmatism and irregular focus.',
      'Infection inside the eye, particularly where the eye was already perforated.',
      'The repair can leak and need to be redone.',
      'Cataract and damage to the iris or lens from the original injury.',
      'A further corneal transplant may be needed later for vision.',
      'In severe injury, the eye may not be salvageable.',
    ],
    alternatives: [
      'A bandage contact lens and intensive drops for a small leak.',
      'Tissue glue instead of sutures for a tiny perforation.',
      'Removing an eye that is blind and painful, where repair cannot help — discussed only '
      + 'when it is genuinely the better option.',
    ],
    recovery:
      'Often admitted for intensive drops. A shield over the eye, worn at night for weeks. '
      + 'Sutures removed over months. Vision may remain limited and further surgery may follow.',
  },

  'Corneal, refractive and ocular surface laser procedures': {
    whatItIs:
      'Laser reshaping of the surface of the cornea, or laser and surface treatment for '
      + 'disease of the front of the eye.',
    whyItIsDone:
      'To correct short sight, long sight or astigmatism, to smooth a scarred surface, or to '
      + 'treat recurrent erosions and surface disease.',
    benefits: [
      'Can reduce or remove dependence on spectacles and contact lenses.',
      'Smooths an irregular surface, improving comfort and vision.',
      'Reduces recurrent painful erosions.',
    ],
    risks: [
      'Dry eye, which is very common for months afterwards and occasionally persistent.',
      'Glare, haloes and difficulty with night driving.',
      'Over- or under-correction, needing spectacles or further treatment.',
      'Haze or scarring of the surface, affecting clarity.',
      'Infection of the cornea.',
      'In eyes with thin or abnormal corneas, progressive bulging afterwards — which is why '
      + 'careful measurement before surgery matters and why not everyone is suitable.',
      'Refractive surgery is elective. The eye you have now works with spectacles; weigh that '
      + 'against these risks.',
    ],
    alternatives: [
      'Spectacles or contact lenses, which carry none of these risks.',
      'Lens-based surgery instead of corneal laser for high prescriptions.',
      'Lubricants and bandage lenses for surface disease.',
    ],
    recovery:
      'Day case. Surface treatments are painful for two to four days and vision takes one to '
      + 'two weeks to settle. Use drops as prescribed and do not rub. Avoid swimming and dusty '
      + 'environments for a month.',
  },

  'Keratoconus and refractive corneal surgery': {
    whatItIs:
      'Treatment to stop the cornea bulging and thinning — cross-linking to stiffen it — or to '
      + 'improve its shape with implanted segments.',
    whyItIsDone:
      'For keratoconus that is progressing, causing increasing short sight and astigmatism and '
      + 'poor vision even with spectacles.',
    benefits: [
      'Cross-linking halts progression in the great majority, which is its purpose.',
      'Preserves the cornea and may avoid the need for transplantation later.',
      'Segments can improve the shape enough to allow contact lens wear or better vision.',
    ],
    risks: [
      'Cross-linking stabilises the cornea; it does not usually improve vision, and expecting '
      + 'it to is the commonest disappointment.',
      'Pain for several days after cross-linking, and blurred vision for weeks.',
      'Haze in the cornea, usually fading over months.',
      'Infection of the cornea, which can scar.',
      'Progression can continue despite treatment and may need repeating.',
      'Segments can migrate, extrude or need removal.',
    ],
    alternatives: [
      'Rigid or scleral contact lenses, which give good vision in most keratoconus.',
      'Observation where the condition is stable, which it often becomes with age.',
      'Corneal transplantation for advanced disease.',
    ],
    recovery:
      'Day case. A bandage contact lens for several days after cross-linking. Expect pain and '
      + 'light sensitivity initially. Vision settles over one to three months, and corneal shape '
      + 'continues changing for a year.',
  },

  'Pterygium and conjunctival surgery': {
    whatItIs:
      'Removal of a fleshy growth from the surface of the eye, with the bare area covered by a '
      + 'graft of the eye’s own surface tissue.',
    whyItIsDone:
      'For a growth encroaching on the cornea, causing irritation, redness, astigmatism, or '
      + 'threatening vision.',
    benefits: [
      'Removes the growth and the chronic irritation and redness.',
      'Prevents it reaching the centre of the cornea and affecting sight.',
      'Improves appearance.',
    ],
    risks: [
      'Recurrence, which is the main problem and is substantially less likely when a graft is '
      + 'used than with bare excision. Recurrent growths are more aggressive.',
      'Discomfort, redness and a gritty feeling for two to four weeks.',
      'Scarring of the cornea and residual astigmatism.',
      'Double vision if the muscle is involved, which is rare.',
      'Graft slipping or failing, and a visible mark where tissue was taken.',
      'Infection, and with certain adjunctive agents, thinning of the white of the eye.',
    ],
    alternatives: [
      'Lubricants, sunglasses and avoiding sun, dust and wind, which control symptoms and slow '
      + 'growth.',
      'Observation where the growth is small and not advancing.',
      'Choosing not to operate, accepting irritation and appearance.',
    ],
    recovery:
      'Day case. Marked redness and discomfort for one to two weeks, which is expected. Drops '
      + 'for several weeks. Protect from sun permanently, which reduces recurrence.',
  },

  'Eyelid surgery': {
    whatItIs:
      'An operation on the eyelid — to correct a lid turning in or out, lift a drooping lid, '
      + 'remove a lump or tumour, or remove excess skin.',
    whyItIsDone:
      'For lashes rubbing the eye, watering, a drooping lid obscuring vision, a lump, or a '
      + 'skin cancer of the lid.',
    benefits: [
      'Stops lashes abrading the cornea, which protects sight.',
      'Relieves watering and irritation.',
      'Restores the field of vision where a lid was drooping.',
      'Removes a tumour completely, with examination of the margins.',
    ],
    risks: [
      'Over- or under-correction, leaving the lid too high, too low, or still turning. Further '
      + 'adjustment is sometimes needed.',
      'Incomplete lid closure, causing a dry, exposed eye — particularly after lifting a '
      + 'drooping lid.',
      'Dry eye and watering.',
      'Asymmetry between the two lids, which is often noticeable to you and rarely to others.',
      'Visible scar, lumpiness, or a change in lash position.',
      'Bleeding behind the eye, which is rare but a sight-threatening emergency — severe pain '
      + 'with proptosis and falling vision means return immediately.',
      'Tumours can recur if not completely removed.',
    ],
    alternatives: [
      'Lubricants, taping, and epilation of lashes.',
      'Observation for a small, harmless lump.',
      'Radiotherapy for some lid tumours.',
      'Choosing not to operate.',
    ],
    recovery:
      'Day case under local anaesthetic in most cases. Bruising and swelling for one to two '
      + 'weeks. Ice in the first 48 hours. Ointment at night. Sutures out at five to fourteen '
      + 'days.',
  },

  'Congenital eyelid and orbital abnormalities': {
    whatItIs:
      'Correction of an eyelid or socket abnormality present from birth — a drooping lid, an '
      + 'abnormal fold, a narrow opening, or an underdeveloped socket.',
    whyItIsDone:
      'Because a drooping lid can block the visual axis and cause permanent lazy eye, and '
      + 'because the socket must develop for the face to grow symmetrically.',
    benefits: [
      'Clears the visual axis so vision can develop — the reason to operate early when the lid '
      + 'covers the pupil.',
      'Improves appearance and symmetry, which matters socially from an early age.',
      'Allows the socket to expand and the face to grow evenly.',
    ],
    risks: [
      'Incomplete lid closure after lifting a lid, risking corneal exposure and ulceration — '
      + 'ointment at night may be needed for a long time.',
      'Over- or under-correction, and a need for revision as the child grows.',
      'Lazy eye may persist and require patching regardless of surgery.',
      'Asymmetry, visible scars, and altered lid crease.',
      'Repeated procedures through childhood are common.',
      'General anaesthesia, sometimes repeatedly.',
    ],
    alternatives: [
      'Observation with monitoring of vision, where the lid does not cover the pupil.',
      'Patching and spectacles to treat the lazy eye first.',
      'Delaying surgery until the child is older, where it is safe to wait.',
      'Expanders and prostheses for an underdeveloped socket.',
    ],
    recovery:
      'Day case or one night. Ointment and careful eye protection. Vision and lid position '
      + 'reviewed regularly, with orthoptic follow-up for years.',
  },

  'Orbital surgery': {
    whatItIs:
      'An operation on the bony socket around the eye — to remove a tumour, drain infection, '
      + 'repair a fracture, or create space where tissues are crowding the eye.',
    whyItIsDone:
      'For a growth, infection, injury, or thyroid eye disease pushing the eye forward and '
      + 'threatening the optic nerve.',
    benefits: [
      'Relieves pressure on the optic nerve, protecting sight.',
      'Removes a tumour and gives a diagnosis.',
      'Corrects a sunken or protruding eye and double vision after fracture.',
      'Drains infection, which near the eye can spread to the brain.',
    ],
    risks: [
      'Loss of vision, which is uncommon but is the specific and serious risk of operating '
      + 'close to the optic nerve.',
      'Double vision, which may be new or worse, and may need prisms or further surgery.',
      'Numbness of the cheek, lip or forehead.',
      'Bleeding behind the eye, which is a sight-threatening emergency.',
      'A sunken or asymmetric eye, or a change in eyelid position.',
      'Infection, and implants that may need removal.',
    ],
    alternatives: [
      'Steroids or radiotherapy for inflammatory orbital disease.',
      'A needle biopsy rather than open surgery for some lesions.',
      'Observation of a small, stable lesion with scans.',
      'Prisms in spectacles for double vision instead of surgery.',
    ],
    recovery:
      'One to three days in hospital. Marked swelling and bruising for two weeks. Vision is '
      + 'checked frequently in the first 24 hours. Double vision may take months to settle.',
  },

  'Orbital and periocular emergencies': {
    whatItIs:
      'Urgent treatment around the eye — releasing pressure from bleeding behind the eye, '
      + 'draining an abscess, or treating spreading infection.',
    whyItIsDone:
      'Because pressure or infection behind the eye can destroy the optic nerve within hours, '
      + 'and infection can spread to the brain.',
    benefits: [
      'Releases pressure quickly, which is the only way to save the optic nerve.',
      'Drains infection and allows antibiotics to work.',
      'Prevents spread of infection into the skull.',
    ],
    risks: [
      'Sight already lost before treatment usually does not return; speed is everything.',
      'Injury to the eye, nerves or muscles during urgent decompression.',
      'Double vision and lid malposition afterwards.',
      'Infection may recur or need repeated drainage.',
      'Scarring of the lid or the skin.',
    ],
    alternatives: [
      'Intravenous antibiotics alone for early infection without an abscess.',
      'Medical lowering of pressure as a temporary measure.',
      'In a true orbital compartment emergency, there is no alternative to immediate release.',
    ],
    recovery:
      'Admission with frequent checks on vision and eye movement. Antibiotics are often '
      + 'continued for one to two weeks. Follow-up for double vision and lid position.',
  },

  'Lacrimal drainage system surgery': {
    whatItIs:
      'An operation to restore tear drainage — creating a new passage between the tear sac and '
      + 'the nose, probing or intubating a blocked duct, or repairing a torn tear canal.',
    whyItIsDone:
      'For a constantly watering eye, repeated infection of the tear sac, or a blocked or torn '
      + 'drainage passage.',
    benefits: [
      'Relieves constant watering, which is more disabling in daily life than it sounds.',
      'Stops repeated painful infections of the tear sac.',
      'Restores drainage after injury.',
    ],
    risks: [
      'The new passage can scar closed, and surgery fails in a proportion of patients.',
      'Nosebleed, which can be brisk in the first days.',
      'A visible scar beside the nose, where an external approach is used.',
      'A silicone tube is often left for weeks to months and must be removed; it can loosen and '
      + 'become visible or irritating.',
      'Watering may persist even with a patent passage, if the lid position or tear film is '
      + 'the real problem.',
      'Infection, and rarely a fistula to the skin.',
    ],
    alternatives: [
      'Massage and antibiotic drops, which resolve many blocked ducts in infants without '
      + 'surgery.',
      'Probing alone, simpler but more likely to fail in adults.',
      'Lubricants and lid-position correction where the cause is not a blockage.',
      'Accepting the watering.',
    ],
    recovery:
      'Day case. Avoid nose-blowing for two weeks. Expect blood-stained tears and nasal '
      + 'discharge initially. The tube is removed in clinic at the planned time.',
  },

  'Lacrimal gland and periocular procedures': {
    whatItIs:
      'An operation on the tear gland or the tissues around the eye — removing or sampling a '
      + 'lesion, or repositioning a prolapsed gland.',
    whyItIsDone:
      'For a swelling in the upper outer eyelid, a mass in the gland, or inflammation that '
      + 'needs a diagnosis.',
    benefits: [
      'Gives a tissue diagnosis, which determines whether the lesion is inflammatory, benign '
      + 'or malignant.',
      'Relieves swelling, discomfort and the mass effect on the eye.',
      'Improves lid contour and appearance.',
    ],
    risks: [
      'Dry eye, where tear gland tissue is removed.',
      'Drooping of the lid, or a change in lid contour.',
      'Double vision if nearby muscles are affected.',
      'Numbness of the upper lid and forehead.',
      'Where the lesion is malignant, much more extensive surgery may be required, and biopsy '
      + 'of certain tumours must be planned carefully to avoid seeding.',
      'Bleeding and infection.',
    ],
    alternatives: [
      'Imaging and observation, where the lesion is small and stable.',
      'A trial of steroids for inflammatory swelling.',
      'A needle sample instead of open biopsy in selected cases.',
    ],
    recovery:
      'Day case or one night. Bruising and swelling for one to two weeks. Lubricants if the '
      + 'eye is dry. Results usually in one to two weeks.',
  },

  'Strabismus and extraocular muscle surgery': {
    whatItIs:
      'Adjusting the muscles that move the eye — weakening or strengthening them — so that the '
      + 'eyes align.',
    whyItIsDone:
      'For a squint causing double vision, an abnormal head posture, poor binocular vision, or '
      + 'the social and functional effects of misalignment.',
    benefits: [
      'Aligns the eyes, which can restore binocular vision and depth perception in children.',
      'Relieves double vision and the need to tilt or turn the head.',
      'The effect on confidence and social interaction is substantial and should not be '
      + 'dismissed as cosmetic.',
    ],
    risks: [
      'Over- or under-correction, so that a squint remains or appears in the other direction. '
      + 'A proportion of patients need a second operation.',
      'Double vision afterwards, which is usually temporary in children but can persist in '
      + 'adults.',
      'The squint can recur years later.',
      'Redness and discomfort for two to three weeks, which is more than patients expect.',
      'Scarring of the surface, and rarely a cyst or granuloma at the muscle site.',
      'Very rarely, the needle perforates the eye wall, or the muscle slips, which threatens '
      + 'vision or movement.',
      'Surgery straightens the eyes; it does not by itself cure a lazy eye, which needs '
      + 'patching.',
    ],
    alternatives: [
      'Spectacles, which fully correct some childhood squints without surgery.',
      'Patching to treat a lazy eye first.',
      'Prisms in spectacles for double vision.',
      'Botulinum toxin injection to the muscle in selected cases.',
    ],
    recovery:
      'Day case. Red, sore eyes for two to three weeks. Drops for several weeks. Back to school '
      + 'in about a week. The final alignment is judged at two to three months.',
  },

  'Ocular oncology and intraocular tumour surgery': {
    whatItIs:
      'Treatment of a tumour in or around the eye — local removal, a radioactive plaque sewn '
      + 'to the eye wall, or removal of the eye where that is necessary.',
    whyItIsDone:
      'For a malignant tumour of the eye, where the aims are to save life first, then the eye, '
      + 'then the vision, in that order.',
    benefits: [
      'Controls the tumour locally and reduces the risk of spread.',
      'Plaque treatment can preserve the eye and some vision in many patients.',
      'Removing the eye gives definitive local control where the tumour is advanced.',
    ],
    risks: [
      'Loss of vision in the affected eye, which is common whichever treatment is chosen.',
      'After radiation: cataract, glaucoma, and damage to the retina and optic nerve developing '
      + 'over years, with gradual visual loss.',
      'The tumour can recur, and the eye may still need removing later.',
      'Removal of the eye is permanent and has a significant emotional impact; a prosthesis '
      + 'gives a good appearance but not vision.',
      'Some eye cancers can spread elsewhere in the body, and lifelong surveillance is needed.',
      'In children, hereditary forms carry implications for siblings and future children, and '
      + 'genetic counselling should be offered.',
    ],
    alternatives: [
      'Observation of a small, stable lesion with photographs and scans.',
      'Radiation instead of removal, where the tumour is suitable.',
      'Chemotherapy, including treatment delivered into the eye’s artery in children.',
      'Treatment aimed at comfort in advanced disease.',
    ],
    recovery:
      'Plaque treatment involves a few days with the plaque in place and a second operation to '
      + 'remove it. After removal of an eye, a prosthesis is fitted at about six weeks. '
      + 'Surveillance continues for years.',
  },

  'Open-globe and penetrating eye injuries': {
    whatItIs:
      'Urgent repair of an eye that has been cut or penetrated, closing the wound and restoring '
      + 'the structure of the eye.',
    whyItIsDone:
      'Because an open eye is at immediate risk of infection and of losing its contents, and '
      + 'closing it is the first step in any chance of saving sight.',
    benefits: [
      'Closes the eye and greatly reduces the risk of infection inside it.',
      'Restores structure, making later reconstructive surgery possible.',
      'Preserves whatever visual potential the eye retains.',
    ],
    risks: [
      'Vision is often permanently and severely reduced, and the eye is sometimes lost despite '
      + 'everything. The outcome depends mainly on the injury, not the repair.',
      'Infection inside the eye, which is a particular risk after penetrating injury.',
      'Retinal detachment and scarring, commonly requiring further surgery weeks later.',
      'Cataract, glaucoma, and persistent distortion of the pupil.',
      'Sympathetic ophthalmia — inflammation in the uninjured eye — which is rare but can '
      + 'threaten the only good eye, and is a reason removal of a blind injured eye is '
      + 'sometimes advised.',
      'Repeated operations over months are usual.',
    ],
    alternatives: [
      'There is no alternative to closing an open eye urgently.',
      'Later decisions — further reconstruction, or removal of a blind painful eye — are '
      + 'genuine choices and are discussed when the situation is clearer.',
    ],
    recovery:
      'Admission, intensive drops and often antibiotics. A protective shield. Further planned '
      + 'surgery often follows in one to two weeks. Follow-up is long, and the final visual '
      + 'result is not known for months.',
  },

  'Intraocular and orbital foreign bodies': {
    whatItIs:
      'Removal of a fragment of metal, glass or other material from inside the eye or the '
      + 'socket, with repair of the entry wound.',
    whyItIsDone:
      'Because a retained fragment can cause infection, and metal fragments can poison the '
      + 'retina over months, causing irreversible blindness.',
    benefits: [
      'Removes the source of infection and of long-term toxicity.',
      'Allows the entry wound to be properly repaired.',
      'Preserves vision that would otherwise be lost gradually.',
    ],
    risks: [
      'Infection inside the eye, which is substantially more likely with a retained foreign '
      + 'body, especially from soil or vegetation.',
      'Retinal detachment and scarring, during removal or afterwards.',
      'Cataract and damage to the lens and iris.',
      'Some fragments are safer left in place, particularly inert ones in the orbit, and '
      + 'removal can cause more damage than it prevents.',
      'Vision may be limited by the original injury regardless of successful removal.',
      'Further surgery is often needed.',
    ],
    alternatives: [
      'Observation of an inert, well-tolerated fragment, with scans and regular review.',
      'Staged removal, stabilising the eye first.',
      'Imaging to locate the fragment precisely is essential first, and metal detection '
      + 'influences whether an MRI can be used at all.',
    ],
    recovery:
      'Admission with intensive drops and antibiotics. Protective shield. Follow-up to watch '
      + 'for retinal problems and, with metal, for long-term toxicity.',
  },

  'Chemical and thermal eye injuries': {
    whatItIs:
      'Treatment of an eye burnt by chemicals or heat — copious irrigation first, then removal '
      + 'of dead tissue, placement of a membrane graft, or reconstruction of the surface.',
    whyItIsDone:
      'Because alkali in particular continues to penetrate and destroy tissue for as long as '
      + 'it remains, and the first minutes of irrigation matter more than anything done later.',
    benefits: [
      'Irrigation stops ongoing damage — immediate, prolonged washing is the single most '
      + 'effective treatment.',
      'Membrane grafting reduces inflammation and scarring and promotes healing.',
      'Reconstruction can restore a surface that supports vision later.',
    ],
    risks: [
      'Severe chemical burns commonly leave permanent scarring, dryness and loss of vision '
      + 'despite everything.',
      'Scarring of the lids to the eyeball, limiting movement and closure.',
      'Glaucoma and cataract developing later.',
      'Loss of the stem cells at the edge of the cornea, which makes later transplantation much '
      + 'less likely to succeed.',
      'Repeated operations over months or years.',
      'Perforation of a severely thinned cornea.',
    ],
    alternatives: [
      'Intensive medical treatment alone for less severe burns.',
      'Staged reconstruction once inflammation settles, which is usually better than operating '
      + 'early.',
      'For the acute injury, there is no alternative to immediate and prolonged irrigation.',
    ],
    recovery:
      'Admission is usual for significant burns. Intensive drops, often hourly at first, for '
      + 'weeks. Follow-up is prolonged, and reconstruction is planned months later.',
  },

  'Ocular infections and inflammatory conditions requiring surgery': {
    whatItIs:
      'Surgery for infection or inflammation of the eye — taking a sample, injecting antibiotic '
      + 'into the eye, vitrectomy to remove infected material, or draining an abscess.',
    whyItIsDone:
      'Because infection inside the eye destroys the retina within days, and treatment must be '
      + 'delivered directly and immediately.',
    benefits: [
      'Delivers antibiotic directly to where the infection is, at a concentration drops and '
      + 'tablets cannot achieve.',
      'Removes infected material and reduces the damage it causes.',
      'Obtains a sample so that the right antibiotic can be chosen.',
    ],
    risks: [
      'Even with prompt treatment, vision is often severely and permanently reduced, and the '
      + 'eye is occasionally lost. The infection, not the treatment, causes this.',
      'Retinal detachment, scarring, and the need for further surgery.',
      'Cataract and raised pressure.',
      'Repeat injections are often needed.',
      'Identifying the organism is not always possible, and treatment is then empirical.',
    ],
    alternatives: [
      'Antibiotic injection alone without vitrectomy, in less severe cases.',
      'Intravenous and oral treatment where the infection is around rather than inside the eye.',
      'Removal of a blind, painful eye, where infection cannot be controlled.',
      'Delay is the one thing that is not an option.',
    ],
    recovery:
      'Admission with frequent review in the first days. Repeated examinations and sometimes '
      + 'repeated injections. Vision is reassessed over weeks, and further surgery may follow.',
  },

  'Other ophthalmic procedures': {
    whatItIs:
      'An eye procedure not covered by the other groups — including examination under '
      + 'anaesthetic, removal of an eye, socket surgery, and minor surface procedures.',
    whyItIsDone:
      'To examine an eye properly where this cannot be done awake, to treat a blind or painful '
      + 'eye, or to treat a localised surface problem.',
    benefits: [
      'A thorough examination under anaesthetic allows accurate diagnosis in children and in '
      + 'uncooperative or very sore eyes.',
      'Removing a blind, painful eye reliably relieves pain that nothing else has touched.',
      'A well-fitted prosthesis restores appearance and confidence.',
    ],
    risks: [
      'Removal of an eye is irreversible, and loss of depth perception affects judging '
      + 'distances, pouring, driving and sport. The remaining eye becomes precious and should '
      + 'be protected with spectacles at all times.',
      'The socket can shrink, and the prosthesis may need refitting or further surgery.',
      'Implants can extrude or become infected.',
      'Anaesthetic risk, particularly where examinations are repeated in small children.',
      'A minor surface procedure may need repeating.',
    ],
    alternatives: [
      'Retaining a blind eye with treatment for pain, where the patient prefers it.',
      'A shell fitted over a blind eye rather than removing it, in selected cases.',
      'Examination in clinic where the patient can cooperate.',
    ],
    recovery:
      'Examination under anaesthetic is a day case. After removal of an eye, a conformer is '
      + 'worn, swelling settles over weeks, and the custom prosthesis is fitted at about six '
      + 'weeks. Support should be offered and accepted — this is a bereavement as well as an '
      + 'operation.',
  },
};
