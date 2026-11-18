// Urology, andrology, obstetrics and gynaecology.
//
// Keys match the `category` strings in src/lib/procedures/catalogue.ts exactly.

import type { CounsellingLibrary } from '../types';

export const UROLOGY_OBGYN: CounsellingLibrary = {
  // ───────────────────────────────────────────────────────────── urology ────

  'Kidney and upper urinary tract surgery': {
    whatItIs:
      'An operation on the kidney or the tube draining it — to remove a stone, relieve a '
      + 'blockage, drain infection, remove a growth, or remove the kidney itself.',
    whyItIsDone:
      'For stones that will not pass, blockage threatening the kidney, a growth, severe '
      + 'infection, or a kidney already destroyed by disease.',
    benefits: [
      'Relieves blockage and protects the remaining kidney function.',
      'Removes stones, and the pain and infections they cause.',
      'Removes a growth, which may be curative.',
    ],
    risks: [
      'Bleeding, which from the kidney can be heavy and occasionally needs transfusion or a '
      + 'procedure to block the bleeding vessel.',
      'Injury to the ureter, bowel, spleen or liver lying next to the kidney.',
      'A urine leak afterwards, usually managed with a stent or drain.',
      'Reduced overall kidney function, which matters most if the other kidney is not healthy.',
      'Stones can re-form; surgery treats the stone, not the tendency to make them.',
      'A stent may be left inside and must be removed later — if it is forgotten it can '
      + 'encrust and cause serious problems.',
    ],
    alternatives: [
      'Fluids and pain relief, letting a small stone pass on its own.',
      'Shock-wave treatment to break stones without an incision.',
      'A tube placed through the back to drain the kidney temporarily.',
      'Monitoring a small growth with scans, in selected patients.',
    ],
    recovery:
      'Keyhole stone procedures: one to three days. Open or kidney-removal surgery: four to '
      + 'seven days, with six weeks before heavy lifting. Drink generously afterwards.',
  },

  'Ureteric surgery': {
    whatItIs:
      'An operation on the tube between the kidney and the bladder — to remove a stone, widen '
      + 'a narrowing, repair an injury, or reimplant the tube into the bladder.',
    whyItIsDone:
      'For a stone that will not pass, a narrowing causing back-pressure on the kidney, injury, '
      + 'or urine flowing backwards towards the kidney.',
    benefits: [
      'Relieves obstruction and protects the kidney from permanent damage.',
      'Removes the stone causing pain and infection.',
      'Stops repeated kidney infections where urine was flowing backwards.',
    ],
    risks: [
      'The ureter can narrow again at the site of repair, sometimes needing a further procedure.',
      'Perforation of the ureter during a telescopic procedure.',
      'A stent is usually left for some weeks. It commonly causes bladder discomfort, urgency '
      + 'and blood in the urine, and it must be removed.',
      'Urine leaking from the repair for a few days.',
      'Rarely, the ureter is damaged beyond simple repair and a larger reconstruction is needed.',
    ],
    alternatives: [
      'Waiting for a small stone to pass, with pain relief and medicines that relax the ureter.',
      'Shock-wave treatment.',
      'A drainage tube through the back as a temporary measure.',
      'Choosing not to intervene, accepting the risk of losing kidney function on that side.',
    ],
    recovery:
      'Telescopic procedures: home the same day or the next. Open repair: three to five days. '
      + 'Expect blood in the urine and stinging for several days.',
  },

  'Bladder surgery': {
    whatItIs:
      'An operation on the bladder, performed through the urethra with a telescope or through '
      + 'an open cut — to remove a growth or stone, enlarge or repair the bladder, or remove it.',
    whyItIsDone:
      'For blood in the urine, a bladder growth, stones, a bladder that holds too little, or '
      + 'injury.',
    benefits: [
      'Removes a growth and establishes its type and depth, which determines further treatment.',
      'Relieves blockage, bleeding or pain.',
      'Can greatly improve bladder capacity and continence.',
    ],
    risks: [
      'Perforation of the bladder during telescopic surgery, usually managed with a catheter '
      + 'for some days.',
      'Bladder growths commonly recur, and regular telescopic checks are needed for years.',
      'Changes in how often you pass urine, and urgency.',
      'If the bladder is removed, urine must be diverted — usually into a bag on the abdomen '
      + 'or a reconstructed reservoir — which is a permanent change.',
      'Operations near the bladder can affect erections and fertility in men, and sexual '
      + 'function in women.',
      'Narrowing of the urethra from instruments passed through it.',
    ],
    alternatives: [
      'Medicines for an overactive bladder.',
      'Injections into the bladder wall, or treatment put into the bladder, for some conditions.',
      'A long-term catheter.',
      'Choosing not to operate, accepting continued bleeding, symptoms or progression.',
    ],
    recovery:
      'Telescopic surgery: one to two days with a catheter, blood in the urine for a week. '
      + 'Bladder removal: ten days to two weeks, with months of adjustment afterwards.',
  },

  'Prostate surgery': {
    whatItIs:
      'Removal of part of the prostate through the urethra to relieve obstruction, or removal '
      + 'of the whole prostate for cancer.',
    whyItIsDone:
      'For a poor stream, incomplete emptying, repeated retention or infection, or for prostate '
      + 'cancer.',
    benefits: [
      'A stronger stream and better emptying, which is reliable after surgery for obstruction.',
      'Freedom from a catheter in men who were in retention.',
      'Where cancer is removed completely, the chance of cure.',
    ],
    risks: [
      'Dry orgasm — semen passing backwards into the bladder — is usual after surgery for '
      + 'obstruction and means infertility.',
      'Difficulty with erections, which is common after removal of the whole prostate and '
      + 'possible after other prostate surgery.',
      'Leakage of urine, usually temporary, occasionally lasting and needing further treatment.',
      'Bleeding, which may need transfusion or return to theatre to wash out clots.',
      'Narrowing of the urethra or the bladder neck, needing a further procedure.',
      'Rarely, absorption of irrigation fluid during telescopic surgery, causing confusion and '
      + 'low blood sodium.',
      'The prostate can grow again over years, and symptoms return.',
    ],
    alternatives: [
      'Medicines to relax the prostate or shrink it.',
      'Watchful waiting with bladder training for mild symptoms.',
      'A long-term catheter.',
      'For cancer: monitoring, radiotherapy, or hormone treatment instead of surgery.',
    ],
    recovery:
      'Telescopic surgery: two to three days, catheter one to three days, blood in the urine '
      + 'up to three weeks. Radical removal: three to seven days, catheter one to two weeks, '
      + 'and pelvic floor exercises that genuinely affect continence.',
  },

  'Urethral surgery': {
    whatItIs:
      'An operation to widen, repair or reconstruct the urethra, sometimes using tissue taken '
      + 'from the inside of the cheek or from the skin.',
    whyItIsDone:
      'For a narrowing causing a poor stream and straining, injury to the urethra, or a '
      + 'congenital abnormality.',
    benefits: [
      'Restores a normal stream and bladder emptying.',
      'Reconstruction gives a far more lasting result than repeated stretching.',
      'Protects the bladder and kidneys from the effects of long-term obstruction.',
    ],
    risks: [
      'The narrowing can recur, and some patients need more than one operation.',
      'A fistula — an abnormal opening through which urine leaks — may form.',
      'Spraying or a split stream afterwards.',
      'Where tissue is taken from the mouth, temporary numbness, tightness and difficulty '
      + 'opening the mouth wide.',
      'Change in the appearance of the penis, and effects on erection or ejaculation.',
      'A catheter is usually needed for two to three weeks.',
    ],
    alternatives: [
      'Stretching or telescopic incision of the narrowing, simpler but much more likely to '
      + 'recur.',
      'Intermittent self-catheterisation to keep the passage open.',
      'A permanent catheter or a bladder drain through the abdominal wall.',
    ],
    recovery:
      'One to three days in hospital, catheter for two to three weeks, and a test before it is '
      + 'removed. Avoid cycling and straddling for six weeks.',
  },

  'Male genital and reproductive surgery': {
    whatItIs:
      'An operation on the scrotum, testis, foreskin or penis — removing, repairing, draining '
      + 'or reconstructing.',
    whyItIsDone:
      'For a lump or swelling, twisting of the testis, hydrocele, varicocele, infection, a '
      + 'tight foreskin, or a growth.',
    benefits: [
      'Relieves swelling, pain and dragging discomfort.',
      'Saves a twisted testis if operated on quickly — this is an emergency measured in hours.',
      'Removes a growth and gives a definite diagnosis.',
    ],
    risks: [
      'Loss of the testis, either because it was already dead or because its blood supply is '
      + 'injured.',
      'A collection of blood in the scrotum, which can be large and occasionally needs draining.',
      'Swelling of the scrotum lasting weeks, which is normal but alarming.',
      'Effects on fertility, particularly where both sides are involved.',
      'Change in appearance and sensation; after circumcision, altered sensation is expected.',
      'Chronic scrotal pain in a small number of patients.',
    ],
    alternatives: [
      'Observation and support, where the condition is harmless.',
      'Antibiotics for infection.',
      'Aspiration of a hydrocele, which is simpler but commonly refills.',
      'Choosing not to operate — except for a twisted testis, where delay loses the testis.',
    ],
    recovery:
      'Usually a day case or one night. Wear supportive underwear for two weeks. Avoid heavy '
      + 'lifting and sport for two to four weeks. Swelling and bruising settle over weeks.',
  },

  'Andrology and male infertility': {
    whatItIs:
      'An operation to improve fertility or sexual function — correcting a varicocele, '
      + 'retrieving sperm, reversing a vasectomy, or implanting a device.',
    whyItIsDone:
      'For difficulty conceiving, blockage of the sperm passages, or erectile dysfunction that '
      + 'has not responded to other treatment.',
    benefits: [
      'May improve sperm quality and the chance of conceiving naturally.',
      'Sperm retrieval can allow fertility treatment even where none appears in the semen.',
      'An implant reliably restores the ability to have intercourse where medicines failed.',
    ],
    risks: [
      'Fertility may not improve. No operation can promise a pregnancy, and your surgeon '
      + 'cannot give you one honestly.',
      'A hydrocele forming after varicocele surgery, or the varicocele recurring.',
      'Injury to the artery of the testis, rarely causing it to shrink.',
      'Sperm retrieval may find none, and the result is known only afterwards.',
      'An implanted device can become infected or fail mechanically and may need removal.',
      'Reversal of vasectomy may restore flow without restoring fertility.',
    ],
    alternatives: [
      'Assisted conception without surgery, where that is available and affordable.',
      'Medicines, lifestyle change, and treating other causes first.',
      'Donor sperm, or adoption.',
      'Accepting the situation without further intervention.',
    ],
    recovery:
      'Most are day cases. Return to work in a few days, to sport in two to three weeks. Semen '
      + 'tests are repeated at three and six months, because change takes that long.',
  },

  'Paediatric urology': {
    whatItIs:
      'An operation on a child’s kidney, bladder, urethra or genitals, to correct an '
      + 'abnormality present from birth or to relieve a blockage.',
    whyItIsDone:
      'For blockage, urine flowing backwards towards the kidneys, repeated infections, or a '
      + 'congenital abnormality affecting function or appearance.',
    benefits: [
      'Protects the growing kidneys from damage, which is the main reason to operate early.',
      'Reduces repeated urinary infections.',
      'Allows normal passing of urine and normal development.',
    ],
    risks: [
      'A repair can narrow or leak, and a second operation is needed in a proportion of '
      + 'children — your surgeon will give you the figure for the specific operation.',
      'Infection after surgery, sometimes needing readmission.',
      'A catheter, stent or drain is often needed for days to weeks.',
      'Effects on later fertility or sexual function for some operations, which should be '
      + 'discussed now even though it feels distant.',
      'Children may need follow-up scans for years.',
    ],
    alternatives: [
      'Preventive antibiotics and monitoring, since some conditions improve as the child grows.',
      'Delaying surgery until the child is older, where it is safe to wait.',
      'Choosing not to operate, accepting the risk to kidney function.',
    ],
    recovery:
      'One to five days in hospital depending on the operation. Children recover quickly but '
      + 'need careful attention to the catheter and dressings. Follow-up is long term.',
  },

  // ───────────────────────────────────────────── obstetrics & gynaecology ────

  'Obstetric surgery': {
    whatItIs:
      'An operation during pregnancy or at delivery — most commonly a caesarean section, in '
      + 'which the baby is delivered through a cut in the abdomen and womb.',
    whyItIsDone:
      'When vaginal delivery is unsafe or not progressing, when the baby is in distress, or '
      + 'for bleeding, a scarred womb, or the position of the placenta.',
    benefits: [
      'Delivers the baby quickly when either mother or baby is at risk.',
      'Avoids a difficult or obstructed labour and the injuries that follow one.',
      'Allows a planned, controlled delivery where that is safer.',
    ],
    risks: [
      'Heavier bleeding than with vaginal birth, sometimes needing transfusion, and rarely '
      + 'removal of the womb to save life.',
      'Infection of the wound or the womb.',
      'Injury to the bladder or the tube from the kidney, which lie close to the womb.',
      'A scar on the womb affects future pregnancies: the placenta may implant abnormally and '
      + 'the scar can give way in a later labour.',
      'Clots in the legs or lungs, to which pregnancy already adds risk.',
      'The baby may be nicked by the blade — usually a small cut that heals, and breathing '
      + 'difficulty is a little commoner after caesarean than after vaginal birth.',
    ],
    alternatives: [
      'Vaginal delivery, with continued monitoring, where it is safe.',
      'Assisted vaginal delivery with forceps or vacuum.',
      'Inducing or augmenting labour.',
      'The alternative depends entirely on the reason, and your obstetrician will set it out.',
    ],
    recovery:
      'Usually three to four days in hospital. Walk early. Avoid heavy lifting for six weeks. '
      + 'Discuss the spacing of future pregnancies and the mode of future delivery before you '
      + 'leave.',
  },

  'Uterine surgery': {
    whatItIs:
      'An operation on the womb — removing fibroids, removing the womb itself, or repairing '
      + 'or reconstructing it.',
    whyItIsDone:
      'For heavy or painful periods, fibroids, prolapse, a growth, or bleeding after the '
      + 'menopause.',
    benefits: [
      'Stops or greatly reduces heavy bleeding, which often transforms daily life.',
      'Relieves pressure, pain and the bulk of large fibroids.',
      'Removing the womb ends periods permanently and removes the possibility of cancer of '
      + 'the womb.',
    ],
    risks: [
      'Bleeding, which during fibroid surgery can be considerable and occasionally leads to '
      + 'removal of the womb — this possibility is discussed and consented to beforehand.',
      'Injury to the bladder, the ureter or the bowel.',
      'Fibroids can grow again after removal.',
      'After removal of the womb you cannot carry a pregnancy. If the ovaries are also removed '
      + 'before the menopause, menopausal symptoms begin at once and hormone treatment should '
      + 'be discussed.',
      'A scar on the womb may require caesarean delivery in a future pregnancy.',
      'Early menopause can follow even when the ovaries are left.',
    ],
    alternatives: [
      'Medicines and the hormone-releasing coil, which control bleeding well in many women.',
      'Blocking the blood supply to fibroids, where available.',
      'Removing the lining of the womb instead of the womb itself, for bleeding in women who '
      + 'have completed their family.',
      'Choosing not to operate, accepting continued symptoms.',
    ],
    recovery:
      'Keyhole or vaginal: one to three days. Open: three to five days, six weeks before heavy '
      + 'lifting. Avoid intercourse and tampons for six weeks after the womb is removed.',
  },

  'Cervical and vaginal surgery': {
    whatItIs:
      'An operation on the cervix or vagina — removing abnormal cells, taking a cone of tissue, '
      + 'repairing a tear or fistula, or placing a stitch in pregnancy.',
    whyItIsDone:
      'For abnormal smear results, bleeding, a fistula between the bladder or bowel and the '
      + 'vagina, injury after childbirth, or a weak cervix in pregnancy.',
    benefits: [
      'Removes abnormal cells before they become cancer — the reason cervical screening works.',
      'Closes a fistula and restores continence, which is life-changing where it has caused '
      + 'leakage and isolation.',
      'A cervical stitch may allow a pregnancy to continue to term.',
    ],
    risks: [
      'Bleeding at the time or one to two weeks later as the scab separates.',
      'After removing a cone of cervix, a higher chance of premature delivery in a later '
      + 'pregnancy, and occasionally a cervix that narrows.',
      'A fistula repair may not heal completely at the first attempt and may need repeating.',
      'A catheter is often needed for one to three weeks after fistula repair, and keeping it '
      + 'draining freely is essential to success.',
      'Abnormal cells can recur, so follow-up smears are necessary and must not be skipped.',
      'Discharge and spotting for several weeks.',
    ],
    alternatives: [
      'Closer surveillance with repeat smears and colposcopy for low-grade changes.',
      'Conservative treatment of a small fistula, which occasionally closes with catheter '
      + 'drainage alone.',
      'Bed rest and progesterone instead of a cervical stitch, in selected cases.',
    ],
    recovery:
      'Cervical procedures are usually day cases with discharge for two to four weeks; no '
      + 'intercourse, tampons or swimming during that time. Fistula repair needs a longer stay '
      + 'and careful catheter care.',
  },

  'Ovarian and fallopian tube surgery': {
    whatItIs:
      'An operation on the ovary or fallopian tube — removing a cyst, untwisting or removing '
      + 'an ovary, treating a pregnancy in the tube, or sterilisation.',
    whyItIsDone:
      'For a cyst, a twisted ovary, a pregnancy growing in the tube, infection, a growth, or '
      + 'permanent contraception.',
    benefits: [
      'Relieves pain and removes the risk of a cyst twisting or bursting.',
      'Treats a tubal pregnancy, which is life-threatening if it ruptures.',
      'Establishes the exact nature of a mass, which scans cannot always do.',
    ],
    risks: [
      'Loss of the ovary or the tube, which affects fertility on that side.',
      'If both ovaries are removed before the menopause, menopause begins immediately.',
      'Adhesions afterwards, which can themselves cause pain and infertility.',
      'A cyst can recur, and surgery does not remove the tendency to form them.',
      'Sterilisation should be regarded as permanent, and it has a small failure rate; if it '
      + 'fails, the pregnancy is more likely to be in the tube.',
      'Where a growth proves to be cancer, further and larger surgery may be needed.',
    ],
    alternatives: [
      'Watching a simple cyst with scans — many resolve without treatment.',
      'The contraceptive pill, which reduces the formation of new cysts.',
      'Drug treatment for an early tubal pregnancy in selected women.',
      'Other forms of contraception instead of sterilisation, including vasectomy for a partner.',
    ],
    recovery:
      'Keyhole surgery: home in one to two days, back to normal in two weeks. Open surgery: '
      + 'three to five days and six weeks. Shoulder-tip pain after keyhole surgery is from the '
      + 'gas used and settles within days.',
  },

  'Urogynaecology and pelvic floor surgery': {
    whatItIs:
      'An operation to repair prolapse of the pelvic organs, or to treat leakage of urine, '
      + 'through the vagina or the abdomen.',
    whyItIsDone:
      'For a sensation of something coming down, leakage of urine on coughing or with urgency, '
      + 'or difficulty emptying the bladder or bowel.',
    benefits: [
      'Relieves the bulge and the dragging sensation.',
      'Substantially improves or stops leakage, with a marked effect on daily life.',
      'Can restore comfortable intercourse and normal bladder emptying.',
    ],
    risks: [
      'Prolapse can recur, and a second operation is needed in a proportion of women.',
      'New urgency, difficulty emptying the bladder, or a change in the pattern of leakage.',
      'Pain during intercourse, or narrowing of the vagina.',
      'Where mesh is used, it can erode through the vaginal wall and cause pain or discharge, '
      + 'and removing it is difficult. Discuss carefully whether mesh is being used and why.',
      'Injury to the bladder, bowel or ureter.',
      'Constipation and straining afterwards undo the repair, so these must be managed.',
    ],
    alternatives: [
      'Supervised pelvic floor physiotherapy, which is genuinely effective and should usually '
      + 'be tried first.',
      'A vaginal pessary to support the prolapse without surgery.',
      'Medicines for urgency, and weight loss, which reduces leakage.',
      'Choosing not to operate, accepting continued symptoms.',
    ],
    recovery:
      'One to three days in hospital. A catheter for one to two days. No heavy lifting, '
      + 'straining or intercourse for six weeks. Pelvic floor exercises continue for life.',
  },

  'Diagnostic and endoscopic gynaecological procedures': {
    whatItIs:
      'Looking inside the womb or the abdomen with a telescope, often with a sample taken or a '
      + 'small problem treated at the same time.',
    whyItIsDone:
      'To find the cause of pain, bleeding, or difficulty conceiving, and to treat what is '
      + 'found in the same sitting.',
    benefits: [
      'Gives a direct view and a diagnosis where scans have not answered the question.',
      'Treatment of what is found in the same procedure, sparing a second operation.',
      'Small cuts, quick recovery, and usually home the same day.',
    ],
    risks: [
      'Perforation of the womb or injury to bowel, bladder or blood vessels when the '
      + 'instruments are inserted — uncommon, but the reason this is done in theatre.',
      'Conversion to open surgery if an injury occurs or the view is inadequate.',
      'Shoulder-tip pain from the gas used, lasting a day or two.',
      'Fluid used to distend the womb can be absorbed, rarely causing problems with body salts.',
      'The procedure may find nothing, which is itself useful information but can be '
      + 'disappointing.',
    ],
    alternatives: [
      'Ultrasound and other scans alone.',
      'Treating on probability without a direct look.',
      'A sample taken in clinic rather than under anaesthetic, where appropriate.',
    ],
    recovery:
      'Usually home the same day. Period-like cramps and light bleeding for a few days. Back to '
      + 'normal activity within a week.',
  },

  'Reproductive surgery and fertility procedures': {
    whatItIs:
      'An operation intended to improve the chance of conceiving — opening or repairing tubes, '
      + 'removing fibroids, adhesions or endometriosis, or retrieving eggs.',
    whyItIsDone:
      'For difficulty conceiving where a surgically correctable cause has been identified.',
    benefits: [
      'May restore the natural chance of conception.',
      'Removing fibroids or endometriosis can relieve pain as well as improve fertility.',
      'Clarifies the anatomy, which helps in deciding whether to move to assisted conception.',
    ],
    risks: [
      'No operation can promise a pregnancy, and surgery may not improve your chances at all.',
      'Adhesions can re-form after being divided, sometimes worse than before.',
      'A pregnancy after tubal surgery is more likely to implant in the tube, which is '
      + 'dangerous and needs early scanning.',
      'Removing fibroids may require caesarean delivery in a later pregnancy.',
      'Reduced ovarian reserve after surgery on the ovary, particularly for endometriosis cysts.',
      'Time is itself a factor in fertility, and surgery costs some.',
    ],
    alternatives: [
      'Assisted conception without surgery, which may be more effective depending on the cause '
      + 'and on your age.',
      'Treating other factors first — weight, smoking, ovulation, the partner’s semen result.',
      'Donor options, or adoption.',
      'Accepting the situation without further intervention.',
    ],
    recovery:
      'Mostly keyhole day cases with a week before normal activity. Your team will advise when '
      + 'to start trying, and for how long before reconsidering.',
  },
};
