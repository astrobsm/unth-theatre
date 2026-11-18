// General surgery, vascular surgery and the cross-specialty access procedures.
//
// Keys match the `category` strings in src/lib/procedures/catalogue.ts exactly.
// A near miss yields a leaflet with no operation-specific content and no
// error, so counselling.test.ts asserts the two sets agree.

import type { CounsellingLibrary } from '../types';

export const GENERAL_SURGERY: CounsellingLibrary = {
  'General Surgery': {
    whatItIs:
      'A general surgical operation, performed either through an open cut or through several '
      + 'small cuts using a camera and long instruments.',
    whyItIsDone:
      'To remove, repair or examine something inside the abdomen or on the body surface that '
      + 'cannot be treated with medicines alone.',
    benefits: [
      'Treats the problem directly rather than managing the symptoms.',
      'Allows tissue to be examined under a microscope so the diagnosis is certain.',
      'Often relieves pain, obstruction or bleeding that would otherwise continue.',
    ],
    risks: [
      'The operation may find something different from what was expected, and the plan may '
      + 'change while you are asleep.',
      'A keyhole operation is sometimes converted to an open one for safety. This is a '
      + 'judgement, not a complication.',
      'Scar tissue inside the abdomen can later cause the bowel to stick together or block.',
    ],
    alternatives: [
      'Continued treatment with medicines, where the condition allows it.',
      'Watching and waiting, with review if things change.',
      'Choosing not to have the operation. Your surgeon will explain what is likely to happen '
      + 'if you do.',
    ],
    recovery:
      'Most patients are up within a day. Hospital stay ranges from the same day to about a '
      + 'week depending on what is done. Avoid heavy lifting for about six weeks after an open '
      + 'abdominal operation.',
  },

  'Gastrointestinal and abdominal surgery': {
    whatItIs:
      'An operation on the stomach, small intestine, large bowel or the lining of the abdomen. '
      + 'Part of the bowel may be removed and the ends rejoined.',
    whyItIsDone:
      'For blockage, perforation, bleeding, long-standing inflammation, or a growth that needs '
      + 'to be removed.',
    benefits: [
      'Relieves obstruction so that food and fluid can pass again.',
      'Removes diseased or dead bowel before it causes widespread infection.',
      'Where a growth is removed, offers the best chance of cure and tells you its exact nature.',
    ],
    risks: [
      'A join in the bowel can leak, usually in the first week. This is serious and often needs '
      + 'a second operation.',
      'You may need a stoma — the bowel brought out onto the abdominal wall into a bag. This is '
      + 'sometimes temporary and sometimes permanent, and your surgeon will tell you in advance '
      + 'if it is likely.',
      'The bowel can be slow to wake up afterwards, causing swelling and vomiting for some days.',
      'Later adhesions can cause obstruction, sometimes years afterwards.',
      'Changes in bowel habit, which may be lasting if a large length was removed.',
    ],
    alternatives: [
      'Medicines, a drip and bowel rest, where the problem may settle without surgery.',
      'A stent or a tube placed by endoscopy to relieve a blockage in some situations.',
      'Choosing not to operate, accepting that obstruction, bleeding or perforation may progress.',
    ],
    recovery:
      'Usually five days to two weeks in hospital. Eating restarts gradually. Full strength '
      + 'takes six to twelve weeks, and no heavy lifting for six weeks.',
  },

  'Hernia and abdominal wall surgery': {
    whatItIs:
      'Repair of a weakness or gap in the muscle wall of the abdomen or groin, through which '
      + 'tissue bulges. The gap is closed, usually reinforced with a mesh.',
    whyItIsDone:
      'To relieve discomfort and to prevent the hernia becoming trapped — the dangerous '
      + 'complication, in which the contents lose their blood supply and need emergency surgery.',
    benefits: [
      'Removes the lump and the dragging discomfort.',
      'Greatly reduces the risk of the hernia becoming trapped.',
      'Allows return to lifting and physical work once healed.',
    ],
    risks: [
      'The hernia can come back, more likely if you smoke, are overweight, cough persistently '
      + 'or return to heavy lifting too soon.',
      'Long-lasting groin or abdominal wall pain in a small number of patients.',
      'Numbness of the skin near the scar, which is usually permanent but harmless.',
      'In men, injury to the vessels of the testis, which rarely causes shrinkage of the testis.',
      'Mesh can become infected and occasionally has to be removed.',
      'Fluid collecting under the wound, which looks like the hernia returning and usually '
      + 'settles on its own.',
    ],
    alternatives: [
      'A truss or support garment, which controls symptoms but does not repair anything and '
      + 'does not remove the risk of trapping.',
      'Watchful waiting for a small, painless hernia, if your surgeon advises it.',
      'Choosing not to operate, accepting the risk of emergency presentation.',
    ],
    recovery:
      'Often a day case or one night. Walking straight away, desk work in one to two weeks, '
      + 'and no heavy lifting for about six weeks.',
  },

  'Colorectal and proctological surgery': {
    whatItIs:
      'An operation on the large bowel, rectum or anus — ranging from a short procedure for '
      + 'piles or a fistula to removal of a segment of bowel.',
    whyItIsDone:
      'For bleeding, pain, a growth, long-standing inflammation, incontinence, or a fistula or '
      + 'abscess around the anus.',
    benefits: [
      'Relieves bleeding, pain and discharge.',
      'Removes a growth, and establishes exactly what it is.',
      'Can restore control and comfort in daily life.',
    ],
    risks: [
      'Pain on opening the bowels for the first days to weeks, which can be considerable after '
      + 'anal surgery.',
      'Difficulty controlling wind or stool. Usually temporary, occasionally lasting, and more '
      + 'likely where the muscle ring must be divided.',
      'Narrowing of the anus or the bowel join as it heals.',
      'A fistula or abscess can recur and need further surgery.',
      'Where the rectum is removed, a stoma may be temporary or permanent.',
      'Operations near the rectum can affect bladder and sexual function.',
    ],
    alternatives: [
      'Diet, fluid, fibre and local treatments, which resolve many anal conditions.',
      'Banding or injection for piles, done in clinic.',
      'Medicines for inflammatory bowel disease.',
      'Choosing not to operate, accepting continued symptoms or progression.',
    ],
    recovery:
      'Day case to about a week for anal procedures; longer for bowel resection. Expect some '
      + 'bleeding on opening the bowels. Keep the stool soft — straining is what delays healing.',
  },

  'Hepatobiliary and pancreatic surgery': {
    whatItIs:
      'An operation on the gallbladder, bile ducts, liver or pancreas, through keyhole or open '
      + 'surgery.',
    whyItIsDone:
      'For gallstones, blockage or injury of the bile duct, a cyst or abscess, or a growth in '
      + 'the liver or pancreas.',
    benefits: [
      'Relieves the pain and the repeated attacks caused by gallstones.',
      'Restores bile drainage, clearing jaundice and itching.',
      'Removes a growth, where removal offers the best chance of cure.',
    ],
    risks: [
      'Injury to the bile duct. Uncommon, but one of the more serious complications in surgery '
      + 'and it may need major reconstruction.',
      'Bile leaking after the operation, sometimes needing a drain or a further procedure.',
      'Stones left behind in the bile duct, needing an endoscopic procedure to remove.',
      'Liver and pancreas surgery carry a significant risk of bleeding, and pancreatic '
      + 'operations can leak pancreatic fluid.',
      'After the pancreas is operated on, diabetes or difficulty digesting fat may follow, '
      + 'sometimes permanently.',
      'Looser stools for some weeks after the gallbladder is removed.',
    ],
    alternatives: [
      'Avoiding fatty food and treating attacks as they come, which does not stop them '
      + 'recurring.',
      'An endoscopic procedure to clear the bile duct without open surgery.',
      'Drainage of a collection through the skin under scan guidance.',
      'Choosing not to operate, accepting further attacks or progression.',
    ],
    recovery:
      'Keyhole gallbladder removal: home in one to two days, normal activity in two weeks. '
      + 'Liver and pancreatic surgery: one to two weeks in hospital and two to three months to '
      + 'feel fully well.',
  },

  'Oesophageal and gastric surgery': {
    whatItIs:
      'An operation on the gullet or the stomach — repairing, removing part of it, or creating '
      + 'a new route for food.',
    whyItIsDone:
      'For a growth, severe reflux, a narrowing, a long-standing ulcer, a perforation, or '
      + 'bleeding that will not stop.',
    benefits: [
      'Allows swallowing and eating again where the passage was blocked.',
      'Stops bleeding or seals a perforation.',
      'Removes a growth and gives a definite diagnosis.',
    ],
    risks: [
      'A join in the gullet or stomach can leak, which is serious and may need intensive care.',
      'Narrowing at the join, causing difficulty swallowing and needing stretching.',
      'Smaller meals, feeling full quickly, and weight loss, sometimes permanently.',
      'Dumping — sweating, palpitations and diarrhoea after eating sugary food.',
      'Reflux, hoarseness, or a persistent cough.',
      'Anaemia and vitamin deficiency in the long term after stomach surgery, needing '
      + 'supplements and monitoring.',
    ],
    alternatives: [
      'Acid-suppressing medicines and dietary change for reflux and ulcers.',
      'Endoscopic stretching, or a stent placed through the mouth to hold a narrowing open.',
      'Feeding through a tube where swallowing cannot be restored.',
      'Choosing not to operate.',
    ],
    recovery:
      'Usually one to two weeks in hospital. Eating restarts gradually, often with small '
      + 'frequent meals for months. Expect to lose some weight before it stabilises.',
  },

  'Breast and endocrine surgery': {
    whatItIs:
      'Removal of a lump, part or all of a breast, or an operation on the thyroid, parathyroid '
      + 'or adrenal gland. Lymph nodes in the armpit may be sampled or removed.',
    whyItIsDone:
      'For a lump that needs removing or identifying, breast cancer, an overactive or enlarged '
      + 'gland, or a growth in a hormone-producing gland.',
    benefits: [
      'Removes the growth and establishes exactly what it is, which guides all further '
      + 'treatment.',
      'Corrects an overactive gland where medicines have not worked.',
      'Relieves pressure on the windpipe or gullet from a large goitre.',
    ],
    risks: [
      'Change in the shape of the breast, and numbness of the skin and upper inner arm.',
      'After armpit surgery, lasting arm swelling (lymphoedema), stiffness, or shoulder '
      + 'weakness.',
      'After thyroid surgery, hoarseness or voice change from injury to the nerve to the voice '
      + 'box — usually temporary, occasionally permanent.',
      'Low blood calcium after thyroid or parathyroid surgery, causing tingling and cramps. '
      + 'May need calcium for a time or for life.',
      'Needing thyroid hormone tablets for life if the whole gland is removed.',
      'Adrenal surgery can cause swings in blood pressure during and after the operation.',
    ],
    alternatives: [
      'Monitoring a benign lump with examination and scans.',
      'Drugs, or radioactive iodine, for an overactive thyroid.',
      'Medicines first, to make an adrenal or thyroid operation safer.',
      'Choosing not to operate, accepting the consequences for the diagnosis or the symptoms.',
    ],
    recovery:
      'Breast lump removal is often a day case. Mastectomy and thyroid surgery usually need one '
      + 'to three nights. Shoulder exercises start early after armpit surgery, and matter.',
  },

  'Skin and soft tissue surgery': {
    whatItIs:
      'Removal of a lump, cyst, or area of skin, or drainage of an abscess, with the specimen '
      + 'sent for examination.',
    whyItIsDone:
      'For a lump that is growing, painful, infected or of uncertain nature, or for an abscess '
      + 'that will not settle with antibiotics alone.',
    benefits: [
      'Removes the lump and gives a definite diagnosis.',
      'Relieves pain and discharge from an abscess quickly.',
      'Prevents a cyst recurring or becoming infected again.',
    ],
    risks: [
      'A scar, which may be thickened or raised — more likely over the chest, shoulder and '
      + 'upper back, and in darker skin.',
      'The lump returning, particularly if a cyst wall remains.',
      'Numbness of a patch of skin near the scar.',
      'A drained abscess is usually left open and needs regular dressings rather than stitches.',
      'If examination shows something unexpected, further surgery may be advised.',
    ],
    alternatives: [
      'Leaving a harmless lump alone and watching it.',
      'Antibiotics alone for early infection, before pus has formed.',
      'Choosing not to operate, accepting that the diagnosis stays uncertain.',
    ],
    recovery:
      'Usually a day case under local anaesthetic. Stitches come out in five to fourteen days '
      + 'depending on site. Open abscess cavities take two to six weeks to fill in.',
  },

  'Trauma, emergency and miscellaneous general surgery': {
    whatItIs:
      'An unplanned operation for injury or sudden illness — to stop bleeding, repair a '
      + 'perforation, remove dead tissue, or find out what is wrong inside the abdomen.',
    whyItIsDone:
      'Because waiting carries more risk than operating. The aim is to save life and limb '
      + 'first, and to restore normal anatomy second.',
    benefits: [
      'Stops bleeding and controls contamination, which are the immediate threats to life.',
      'Finds and treats injuries that scans cannot exclude.',
      'Gives the best chance of survival and of keeping the affected organ or limb.',
    ],
    risks: [
      'Emergency surgery carries higher risk than planned surgery. There is less time to '
      + 'prepare, and the patient is often already unwell.',
      'The findings may be worse than expected, and the operation larger than described.',
      'A stoma, a drain, or an abdomen left temporarily open may be necessary.',
      'More than one operation may be needed over the following days.',
      'Admission to intensive care, ventilation and blood transfusion may be required.',
    ],
    alternatives: [
      'Close observation with scans and repeated examination, where the situation allows.',
      'Drainage through the skin under scan guidance instead of open surgery, in selected cases.',
      'In an emergency, the realistic alternative is usually only a delay, and delay here '
      + 'carries its own and often greater risk.',
    ],
    recovery:
      'Varies widely with the injury. Expect a longer stay than for planned surgery, and a '
      + 'recovery measured in months rather than weeks after major trauma.',
  },

  'Emergency and damage-control procedures': {
    whatItIs:
      'A short, deliberately limited operation to control bleeding and contamination in a '
      + 'patient who is too unwell for a long one. Definitive repair is done later, once the '
      + 'patient is stable.',
    whyItIsDone:
      'Because a patient who is cold, bleeding and acidotic will not survive a long operation. '
      + 'Stopping the bleeding and getting them to intensive care comes first.',
    benefits: [
      'Controls the immediate threat to life in the shortest possible time.',
      'Allows warming, transfusion and correction of clotting before definitive surgery.',
      'Improves survival in severe injury compared with attempting everything at once.',
    ],
    risks: [
      'A planned return to theatre, usually within one to two days, and sometimes several.',
      'The abdomen or chest may be left temporarily closed with a dressing rather than stitches.',
      'Packs left inside to control bleeding must be removed at the next operation.',
      'Intensive care, ventilation and large volumes of blood are usually required.',
      'Even with everything done correctly, the injuries themselves may not be survivable.',
    ],
    alternatives: [
      'A single definitive operation, where the patient is well enough to withstand one.',
      'Stopping bleeding through a blood vessel without open surgery, where available.',
      'There is rarely a non-operative alternative at this point.',
    ],
    recovery:
      'Prolonged. Several operations, a period in intensive care, and rehabilitation over '
      + 'months. The team will explain each stage as it comes.',
  },

  'Surgical access and diagnostic procedures': {
    whatItIs:
      'A procedure to look inside, to obtain a tissue sample, or to place a line, tube or drain '
      + '— often a step towards treatment rather than the treatment itself.',
    whyItIsDone:
      'To establish a diagnosis with certainty, to drain a collection, or to provide reliable '
      + 'access for feeding, fluids, drugs or dialysis.',
    benefits: [
      'Gives a definite diagnosis, so that treatment is chosen on fact rather than on '
      + 'probability.',
      'Relieves pressure or infection by draining it.',
      'Provides dependable access, sparing you repeated needles.',
    ],
    risks: [
      'The sample may be inadequate and the procedure may have to be repeated.',
      'Bleeding or injury to a nearby structure at the site of entry.',
      'A line can become infected or blocked, and may need replacing.',
      'Placing a line in the neck or chest can cause air to leak around the lung, sometimes '
      + 'needing a chest drain.',
      'A normal result does not always exclude disease, and further tests may still be needed.',
    ],
    alternatives: [
      'Scans alone, accepting that they cannot always give a definite answer.',
      'A sample taken with a needle through the skin instead of by operation.',
      'Treating on the balance of probabilities without a tissue diagnosis, which risks '
      + 'treating the wrong condition.',
    ],
    recovery:
      'Most are day cases with a short recovery. Mild soreness at the site for a few days. '
      + 'Results usually take several days to two weeks.',
  },

  'Vascular surgery procedures': {
    whatItIs:
      'An operation on arteries or veins — clearing or bypassing a blockage, repairing a '
      + 'widened artery, creating access for dialysis, or treating varicose veins.',
    whyItIsDone:
      'For pain in the legs on walking or at rest, a non-healing ulcer, a swelling in an artery '
      + 'at risk of bursting, or the need for reliable dialysis access.',
    benefits: [
      'Restores blood supply, relieving pain and allowing ulcers to heal.',
      'Can prevent loss of a limb.',
      'Repairing a widened artery before it bursts prevents an event that is often fatal.',
    ],
    risks: [
      'The graft or repaired vessel can block, sometimes suddenly, and the leg may then be '
      + 'worse than before.',
      'Amputation may still become necessary despite successful surgery.',
      'Swelling of the leg after the blood supply is restored.',
      'Injury to nearby nerves, causing numbness or weakness.',
      'Major arterial surgery places strain on the heart and kidneys and carries a real risk '
      + 'of heart attack, stroke, kidney failure or death.',
      'A dialysis fistula may fail to mature, or may steal blood from the hand.',
    ],
    alternatives: [
      'Stopping smoking, a supervised walking programme and medicines, which genuinely improve '
      + 'walking distance.',
      'Opening the artery with a balloon or stent from inside instead of open surgery.',
      'Compression stockings and wound care for venous disease.',
      'Choosing not to operate, accepting the risk to the limb or from the aneurysm.',
    ],
    recovery:
      'Varies from a day case for varicose veins to one to two weeks for major arterial surgery. '
      + 'Stopping smoking is the single thing that most affects whether the result lasts.',
  },

  'Peripheral vascular and thoracic vascular procedures': {
    whatItIs:
      'An operation on the blood vessels of the limbs, neck or chest, to clear, repair, bypass '
      + 'or tie off a vessel.',
    whyItIsDone:
      'For blockage, injury, a widened or narrowed vessel, or to prevent a stroke from a '
      + 'narrowed artery in the neck.',
    benefits: [
      'Restores blood flow to a limb or to the brain.',
      'Reduces the risk of stroke where an artery in the neck is severely narrowed.',
      'Controls bleeding after injury to a major vessel.',
    ],
    risks: [
      'Stroke, which is the specific risk of surgery on the arteries of the neck, and the one '
      + 'the operation is meant to prevent.',
      'Injury to nerves running beside the vessels, affecting the voice, the tongue, the '
      + 'shoulder or sensation.',
      'Bleeding, which near large vessels can be rapid.',
      'The repair blocking or narrowing again over time.',
      'Strain on the heart and lungs, particularly for operations inside the chest.',
    ],
    alternatives: [
      'Medicines to thin the blood and control cholesterol and blood pressure.',
      'A stent placed from inside the vessel rather than open repair.',
      'Choosing not to operate, accepting the risk of stroke or of losing the limb.',
    ],
    recovery:
      'Usually two to seven days in hospital. Follow-up scans check that the repair stays open. '
      + 'Blood-thinning medicines are often continued long term.',
  },

  'Bone and soft tissue tumour surgery': {
    whatItIs:
      'Removal of a growth from bone or the soft tissues, with a margin of healthy tissue '
      + 'around it. Bone may be reconstructed, and occasionally amputation is required.',
    whyItIsDone:
      'To remove a tumour completely, to confirm what it is, and to preserve as much function '
      + 'of the limb as can safely be kept.',
    benefits: [
      'Removes the tumour and gives the exact diagnosis and grade, which determines all further '
      + 'treatment.',
      'Relieves pain and the risk of the bone breaking.',
      'In most cases the limb can be preserved and remain useful.',
    ],
    risks: [
      'The tumour can return locally, which may mean further and larger surgery.',
      'Loss of function, strength or length in the affected limb.',
      'Reconstructions and implants can loosen, break or become infected, sometimes years later.',
      'Amputation may be necessary, either at the first operation or later.',
      'Growth disturbance in children when surgery is near a growth plate.',
      'Chemotherapy or radiotherapy may be needed before or after, with their own effects.',
    ],
    alternatives: [
      'A biopsy alone first, to confirm the diagnosis before deciding on major surgery.',
      'Radiotherapy or chemotherapy, alone or before surgery.',
      'Amputation as the primary treatment, where it gives better function or better control '
      + 'than reconstruction.',
      'Treatment aimed at comfort rather than cure, where cure is not achievable.',
    ],
    recovery:
      'One to two weeks in hospital, then months of physiotherapy. Your team will explain the '
      + 'expected function of the limb before you decide.',
  },
};
