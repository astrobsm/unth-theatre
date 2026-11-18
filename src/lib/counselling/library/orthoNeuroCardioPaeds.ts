// Orthopaedics, neurosurgery, cardiothoracic surgery and paediatric surgery.
//
// Keys match the `category` strings in src/lib/procedures/catalogue.ts exactly.
// Note the EN DASH (U+2013) in the cardiac key — it is there in the catalogue.

import type { CounsellingLibrary } from '../types';

export const ORTHO_NEURO_CARDIO_PAEDS: CounsellingLibrary = {
  // ──────────────────────────────────────────────────────────── orthopaedics ────

  'Trauma and fracture surgery': {
    whatItIs:
      'Setting a broken bone and holding it in position with plates, screws, nails, wires or '
      + 'an external frame, so that it heals in the right place.',
    whyItIsDone:
      'For a fracture that is displaced, unstable, involves a joint, or will not heal properly '
      + 'in plaster.',
    benefits: [
      'Holds the bone correctly so it heals in good alignment.',
      'Allows earlier movement of the joints, which prevents stiffness.',
      'Reduces pain and allows earlier return to walking and to work.',
    ],
    risks: [
      'The bone may heal slowly, in a poor position, or not at all, needing further surgery '
      + 'and sometimes a bone graft.',
      'Metalwork can irritate, loosen, break or become infected, and may be removed later.',
      'Infection of bone is difficult to treat and may need repeated operations.',
      'Stiffness of the nearby joints, and muscle wasting.',
      'Injury to nerves or blood vessels near the fracture.',
      'Arthritis later in the joint, particularly where the fracture entered the joint surface.',
      'Shortening, angulation, or a difference in limb length.',
      'Compartment syndrome — severe, increasing pain with a tight swollen limb — which is an '
      + 'emergency.',
    ],
    alternatives: [
      'Plaster or a brace, where the fracture is stable and well aligned.',
      'Traction, in selected cases.',
      'Accepting a degree of deformity rather than operating, which is sometimes the better '
      + 'choice.',
    ],
    recovery:
      'Depends on the bone. Expect six to twelve weeks for a fracture to unite, longer in the '
      + 'leg. Weight-bearing instructions must be followed exactly. Physiotherapy determines '
      + 'the final movement.',
  },

  'Spine surgery': {
    whatItIs:
      'An operation on the spine to take pressure off nerves, to stabilise with screws and '
      + 'rods, or to correct a deformity.',
    whyItIsDone:
      'For leg or arm pain from a trapped nerve, numbness or weakness, instability, deformity, '
      + 'infection, or a fracture.',
    benefits: [
      'Relieves nerve pain, often substantially and quickly.',
      'Stops progression of weakness or numbness.',
      'Stabilises the spine and corrects deformity.',
    ],
    risks: [
      'Back pain may persist even when leg pain resolves; the operation treats the nerve '
      + 'better than it treats the back.',
      'A tear in the lining of the spinal cord causing fluid leak and headache, needing flat '
      + 'bed rest or repair.',
      'Nerve injury causing new weakness, numbness, or problems with bladder, bowel or sexual '
      + 'function. Rare, but serious.',
      'The disc can prolapse again, or the adjacent level can wear out after fusion.',
      'Screws can be misplaced, loosen, or break, and the fusion may not take.',
      'Infection, which in the spine can be serious and prolonged.',
      'Smoking substantially reduces the chance of a fusion healing.',
    ],
    alternatives: [
      'Physiotherapy, pain relief and time, which resolve many disc problems without surgery.',
      'Steroid injection around the nerve root.',
      'Continuing without surgery, accepting the symptoms — reasonable unless there is '
      + 'progressive weakness or bladder or bowel involvement, which are urgent.',
    ],
    recovery:
      'One to five days for decompression, longer for fusion. Walking the same or next day. No '
      + 'heavy lifting or twisting for six to twelve weeks. Fusion takes months to consolidate.',
  },

  'Joint replacement and arthroplasty': {
    whatItIs:
      'Replacing a worn joint surface with an artificial one of metal, plastic or ceramic.',
    whyItIsDone:
      'For arthritis causing pain that disturbs sleep and limits walking, once other treatments '
      + 'have been tried.',
    benefits: [
      'Reliable relief of arthritic pain, which is the main reason to do it.',
      'Improved walking distance, sleep and independence.',
      'Most modern replacements last fifteen to twenty years or more.',
    ],
    risks: [
      'Infection of the implant, which is uncommon but serious and may require removal of the '
      + 'joint and months of treatment.',
      'Clots in the leg or lung; you will be given preventive treatment.',
      'Dislocation, particularly of the hip in the first weeks, which is why the movement '
      + 'precautions matter.',
      'A difference in leg length, usually small.',
      'Loosening or wear over the years, needing a revision operation which is bigger than the '
      + 'first.',
      'Nerve or vessel injury causing numbness or weakness.',
      'Fracture of the bone around the implant, during surgery or later.',
      'Some pain or stiffness may persist, and kneeling is often difficult after knee '
      + 'replacement.',
    ],
    alternatives: [
      'Weight loss, exercise and physiotherapy, which genuinely reduce pain.',
      'Pain relief and walking aids.',
      'Steroid injection into the joint.',
      'Other operations such as realignment, in younger patients.',
      'Waiting, accepting that an implant has a finite life and earlier surgery means more '
      + 'revisions later.',
    ],
    recovery:
      'Three to five days in hospital. Walking with aids from day one. Driving at about six '
      + 'weeks. Most improvement by three months, continuing for a year.',
  },

  'Arthroscopy and sports surgery': {
    whatItIs:
      'Keyhole surgery on a joint, using a camera and fine instruments through small cuts, to '
      + 'repair or trim ligaments, cartilage or joint lining.',
    whyItIsDone:
      'For instability, locking, catching or persistent pain after a sporting injury, or to '
      + 'establish what is wrong inside the joint.',
    benefits: [
      'Restores stability, allowing return to sport and to work.',
      'Relieves locking and catching from a torn meniscus or loose fragment.',
      'Small cuts, less pain and faster recovery than open surgery.',
    ],
    risks: [
      'A repair or reconstruction can fail or re-tear, particularly with early return to sport.',
      'Stiffness and loss of full movement.',
      'Where a graft is taken, pain at the donor site — kneeling pain is common after a '
      + 'patellar tendon graft.',
      'Numbness around the scars.',
      'Clots in the leg, and rarely joint infection, which needs urgent washout.',
      'Arthritis may still develop later despite a successful repair.',
      'Trimming cartilage relieves mechanical symptoms but does not treat arthritis, and '
      + 'expectations should be set accordingly.',
    ],
    alternatives: [
      'Structured physiotherapy and rehabilitation, which for some ligament injuries gives '
      + 'results as good as surgery.',
      'Activity modification and a brace.',
      'Injections for pain.',
      'Accepting the instability if your activities do not demand the joint.',
    ],
    recovery:
      'Usually a day case. Crutches for days to weeks. Rehabilitation is the operation’s other '
      + 'half: return to pivoting sport is typically nine to twelve months after ligament '
      + 'reconstruction, and returning early is how grafts fail.',
  },

  'Foot and ankle surgery': {
    whatItIs:
      'Correction of deformity, fusion of a painful joint, repair of tendons or ligaments, or '
      + 'removal of a painful lesion in the foot or ankle.',
    whyItIsDone:
      'For pain, deformity, difficulty with footwear, ulceration, or instability.',
    benefits: [
      'Relieves pain on walking and standing.',
      'Corrects deformity and allows normal footwear.',
      'Prevents pressure ulcers, which matters particularly in diabetes.',
    ],
    risks: [
      'Swelling of the foot for six to twelve months is usual and often underestimated.',
      'Bone may fail to unite, needing further surgery.',
      'Deformity can recur, particularly bunions.',
      'Stiffness, and transfer of pain or pressure to a neighbouring toe or joint.',
      'Nerve injury causing numbness or a painful neuroma.',
      'Wound healing problems, which are commoner in the foot, in smokers and in diabetes.',
      'Metalwork may be prominent and need removal.',
    ],
    alternatives: [
      'Footwear change, insoles and orthotics, which often help substantially.',
      'Physiotherapy and activity modification.',
      'Injection for localised pain.',
      'Accepting the deformity if it is not painful; appearance alone is rarely a good reason '
      + 'to operate on a foot.',
    ],
    recovery:
      'Often a day case. Expect six weeks in a boot or cast and limited weight-bearing. Keep '
      + 'the foot elevated — this is the single most effective thing you can do. Full recovery '
      + 'takes six to twelve months.',
  },

  'Paediatric orthopaedics and deformity correction': {
    whatItIs:
      'Correction of a bone or joint deformity in a growing child — by cast, by cutting and '
      + 'realigning bone, by guiding growth, or with a frame.',
    whyItIsDone:
      'For a deformity present from birth or acquired, a limb length difference, hip dysplasia, '
      + 'club foot, or the effects of a neurological condition.',
    benefits: [
      'Corrects alignment while the child is still growing, when correction is easiest.',
      'Improves walking, footwear and function.',
      'Prevents arthritis and pain in adult life.',
    ],
    risks: [
      'Deformity can recur as the child grows, and further surgery may be needed at intervals '
      + 'throughout childhood.',
      'Injury to a growth plate, causing later deformity or shortening.',
      'Stiffness of the joint.',
      'With frames: pin-site infection is common, treatment lasts months, and it is demanding '
      + 'for the family as well as the child.',
      'Nerve or vessel stretch injury during correction.',
      'Over- or under-correction.',
    ],
    alternatives: [
      'Observation, since many childhood deformities correct themselves with growth.',
      'Casting, bracing and physiotherapy.',
      'Delaying surgery to a more favourable age.',
      'Accepting the deformity where function is good.',
    ],
    recovery:
      'Varies widely. Casts for six to twelve weeks; frames for months. Schooling, transport '
      + 'and home arrangements need planning in advance. Follow-up continues until growth ends.',
  },

  'Other orthopaedic procedures': {
    whatItIs:
      'An orthopaedic operation on bone, joint, tendon or soft tissue not covered by the other '
      + 'groups — including biopsy, removal of metalwork, and treatment of infection.',
    whyItIsDone:
      'For pain, deformity, infection, a lump needing diagnosis, or removal of implants that '
      + 'are causing trouble.',
    benefits: [
      'Relieves pain or irritation from prominent metalwork.',
      'Clears infection from bone or joint, which rarely resolves without surgery.',
      'Obtains tissue so that treatment is based on a diagnosis.',
    ],
    risks: [
      'Removing metalwork leaves screw holes, and the bone is weaker for several weeks — '
      + 'refracture is possible.',
      'Bone and joint infection often needs more than one operation and weeks of antibiotics.',
      'Nerve or vessel injury at the operative site.',
      'Stiffness and muscle wasting.',
      'The symptoms may not be relieved if the metalwork was not the cause.',
    ],
    alternatives: [
      'Leaving metalwork in place, which is usually safe if it is not causing symptoms.',
      'Antibiotics alone for infection, though these seldom cure established bone infection.',
      'Observation and physiotherapy.',
    ],
    recovery:
      'Usually short. After metalwork removal, avoid impact and contact sport for six to twelve '
      + 'weeks. Infection may require a long course of antibiotics, sometimes through a line.',
  },

  // ──────────────────────────────────────────────────────────── neurosurgery ────

  'Cranial and intracranial surgery': {
    whatItIs:
      'An operation inside the skull — removing a tumour, a blood clot, or infected tissue, or '
      + 'relieving pressure on the brain.',
    whyItIsDone:
      'For a brain tumour, bleeding, raised pressure, severe head injury, or infection.',
    benefits: [
      'Relieves pressure on the brain, which can be immediately life-saving.',
      'Removes a tumour or clot and gives a definite diagnosis.',
      'Can relieve headache, seizures and neurological symptoms.',
    ],
    risks: [
      'New or worsened neurological problems — weakness, numbness, speech difficulty, visual '
      + 'loss, memory or personality change. These depend on which part of the brain is '
      + 'involved and may be permanent.',
      'Seizures, which may be new and may require long-term medication.',
      'Bleeding or swelling of the brain after the operation, sometimes needing a further '
      + 'operation.',
      'Infection of the wound, the bone flap, or the lining of the brain.',
      'Leakage of fluid from the wound or the nose.',
      'A tumour may be only partly removable if it lies in or next to vital structures.',
      'Stroke, coma or death are possible with intracranial surgery.',
    ],
    alternatives: [
      'A biopsy alone to establish the diagnosis without removing the lesion.',
      'Radiotherapy or chemotherapy, alone or instead of surgery for some tumours.',
      'Medical treatment to control pressure and seizures.',
      'Treatment aimed at comfort, where surgery cannot help.',
    ],
    recovery:
      'Several days to two weeks, often starting in intensive care. Headache and fatigue for '
      + 'weeks. Driving is restricted and the rules depend on seizures — ask specifically. '
      + 'Rehabilitation may continue for months.',
  },

  'Spinal neurosurgery': {
    whatItIs:
      'An operation on the spinal cord, nerve roots or the surrounding bone — to remove '
      + 'pressure, take out a tumour, or stabilise the spine.',
    whyItIsDone:
      'For pressure on the cord or nerves causing pain, numbness, weakness, or loss of bladder '
      + 'and bowel control, or for a tumour or infection.',
    benefits: [
      'Relieves pressure, which can stop deterioration and sometimes reverse it.',
      'Relieves nerve pain.',
      'Removes a tumour and gives a diagnosis.',
    ],
    risks: [
      'Injury to the spinal cord, causing weakness, numbness, or loss of bladder, bowel or '
      + 'sexual function. Rare, but the consequence can be permanent and severe.',
      'A tear in the lining causing fluid leak and headache.',
      'Function already lost before the operation may not return; surgery more reliably '
      + 'prevents further loss than restores what has gone.',
      'Instability requiring fusion, now or later.',
      'Infection, which in the spine may need prolonged treatment.',
      'Recurrence of the tumour or the compression.',
    ],
    alternatives: [
      'Steroids, radiotherapy or chemotherapy for some tumours.',
      'A brace and observation, where the cord is not compressed.',
      'Pain management without surgery.',
      'Urgent surgery is usually advised where bladder or bowel function is affected; delay '
      + 'there costs function permanently.',
    ],
    recovery:
      'Three days to two weeks. Mobilising with physiotherapy from early on. Recovery of nerve '
      + 'function, where it happens, continues over many months.',
  },

  'CSF diversion and hydrocephalus': {
    whatItIs:
      'Placing a shunt — a thin tube that carries fluid from the brain to the abdomen — or '
      + 'making a new drainage route inside the brain with a telescope.',
    whyItIsDone:
      'For a build-up of fluid raising the pressure inside the skull, causing headache, '
      + 'vomiting, drowsiness, visual problems, or, in a baby, a rapidly enlarging head.',
    benefits: [
      'Relieves raised pressure, often rapidly and dramatically.',
      'Protects vision and brain development, which is the reason to act promptly in children.',
      'Improves walking, memory and continence in adults with normal-pressure hydrocephalus.',
    ],
    risks: [
      'Shunts block. This is common over a lifetime, and a blocked shunt is an emergency — '
      + 'headache, vomiting and drowsiness mean come back at once.',
      'Shunt infection, usually within months of insertion, which normally means removing the '
      + 'shunt and treating before replacing it.',
      'Over-drainage, causing headaches on standing and occasionally bleeding over the brain.',
      'The tube can disconnect, migrate or become too short as a child grows, needing revision.',
      'An endoscopic opening can close again over time.',
      'Seizures, or injury to brain tissue along the track of the tube.',
    ],
    alternatives: [
      'An endoscopic opening instead of a shunt, which avoids a permanent implant where the '
      + 'anatomy is suitable.',
      'Treating the underlying cause of the obstruction.',
      'Temporary external drainage.',
      'Observation where pressure is not raised.',
    ],
    recovery:
      'Two to five days in hospital. Learn the signs of blockage and infection before you '
      + 'leave; they are the most important thing in this leaflet for you. Follow-up is lifelong.',
  },

  'Neurovascular surgery': {
    whatItIs:
      'An operation on the blood vessels of the brain — clipping an aneurysm, removing a '
      + 'malformation, or bypassing a blocked vessel.',
    whyItIsDone:
      'For a swelling on a brain artery that has bled or may bleed, an abnormal tangle of '
      + 'vessels, or a vessel at risk of causing a stroke.',
    benefits: [
      'Prevents a first or further bleed, which carries a high risk of death or disability.',
      'Removes the source of seizures or of progressive symptoms.',
      'Restores blood flow to brain at risk.',
    ],
    risks: [
      'Stroke, which may cause weakness, speech difficulty, visual loss or death. This is the '
      + 'principal risk, and it is the same event the operation is intended to prevent.',
      'Bleeding during or after the operation.',
      'Spasm of brain arteries after a bleed, which can cause delayed stroke in the following '
      + 'days.',
      'Seizures, needing medication.',
      'The aneurysm or malformation may not be completely treated, and further treatment may '
      + 'be needed.',
      'Memory, concentration and fatigue problems that persist for months.',
    ],
    alternatives: [
      'Treatment from inside the vessel with coils or glue, which avoids opening the skull and '
      + 'is preferred for many aneurysms.',
      'Focused radiation for some malformations.',
      'Observation with scans and strict blood-pressure control for small, unruptured '
      + 'aneurysms.',
    ],
    recovery:
      'One to three weeks, starting in intensive care after a bleed. Fatigue and headaches for '
      + 'months. Blood pressure control and stopping smoking matter greatly afterwards.',
  },

  'Peripheral nerve and functional neurosurgery': {
    whatItIs:
      'An operation on a nerve outside the brain and spinal cord — releasing, repairing or '
      + 'grafting it — or a procedure to modify nerve function for pain or movement disorder.',
    whyItIsDone:
      'For a trapped or injured nerve, a nerve tumour, severe facial pain, spasticity, or a '
      + 'movement disorder not controlled by medicines.',
    benefits: [
      'Relieves numbness, tingling, pain and weakness from a trapped nerve, often completely.',
      'Can restore some function after nerve injury if repaired early.',
      'Can give substantial relief in severe facial pain and in spasticity.',
    ],
    risks: [
      'Nerve recovery is slow — regrowth is about a millimetre a day — and is often incomplete. '
      + 'Long-standing weakness or wasting may not recover.',
      'New numbness in the area the nerve supplies, which for pain procedures is sometimes '
      + 'deliberate and permanent.',
      'Pain can return after months or years.',
      'Painful scar or neuroma at the operation site.',
      'Where a graft is taken, permanent numbness at the donor site.',
      'Implanted devices can move, fail or become infected.',
    ],
    alternatives: [
      'Splinting, therapy, and steroid injection.',
      'Medicines for nerve pain and for movement disorders.',
      'Injections of botulinum toxin for spasticity.',
      'Accepting the symptoms and avoiding surgery.',
    ],
    recovery:
      'Mostly short stays or day cases. Splints and therapy afterwards. Recovery of a repaired '
      + 'nerve is judged over twelve to eighteen months, not weeks.',
  },

  'Paediatric neurosurgery and congenital conditions': {
    whatItIs:
      'A neurosurgical operation in a child — closing a spinal defect present at birth, '
      + 'releasing a tethered cord, treating a skull that has fused too early, or removing a '
      + 'tumour.',
    whyItIsDone:
      'For a condition present from birth, raised pressure inside the skull, or a tumour.',
    benefits: [
      'Protects the exposed spinal cord and prevents infection, which is urgent in a newborn.',
      'Prevents further loss of leg, bladder and bowel function.',
      'Allows the brain room to grow and protects vision.',
    ],
    risks: [
      'Function already lost before surgery usually does not return; the aim is to prevent '
      + 'further loss.',
      'Leakage of spinal fluid from the wound.',
      'Hydrocephalus developing afterwards and needing a shunt.',
      'A tethered cord can re-tether as the child grows, needing further surgery.',
      'Significant blood loss in skull surgery, usually needing transfusion.',
      'Developmental, bladder and bowel problems needing long-term multidisciplinary follow-up.',
    ],
    alternatives: [
      'Timing of surgery can sometimes be adjusted; in an open spinal defect it is urgent.',
      'Observation of head shape and pressure for mild skull abnormalities.',
      'Supportive care where the condition is not survivable — a decision made with the family.',
    ],
    recovery:
      'One to two weeks in hospital. Specific nursing positions to protect the wound. Follow-up '
      + 'involves neurosurgery, urology, orthopaedics and development, and continues for years.',
  },

  // ───────────────────────────────────────────────────────── cardiothoracic ────

  'Thoracic and lung surgery': {
    whatItIs:
      'An operation inside the chest — removing part or all of a lung, taking a sample, '
      + 'draining fluid or pus, or operating on the chest wall. Often done through keyhole '
      + 'incisions.',
    whyItIsDone:
      'For a lung growth, infection, collapsed lung, fluid or pus in the chest, or injury.',
    benefits: [
      'Removes a tumour, which offers the best chance of cure in early lung cancer.',
      'Clears infection and allows the lung to re-expand.',
      'Prevents repeated collapse of the lung.',
      'Gives a definite tissue diagnosis.',
    ],
    risks: [
      'Air leaking from the lung surface, which is common and may keep the chest drain in for '
      + 'longer than planned.',
      'Breathlessness, which is permanent after removal of lung tissue; your fitness is tested '
      + 'beforehand to predict this.',
      'Chest wall pain that can persist for months and occasionally becomes chronic.',
      'Pneumonia and difficulty clearing secretions, particularly in smokers.',
      'Irregular heart rhythm, commonly in the first days.',
      'Bleeding, and injury to nerves causing hoarseness or a raised diaphragm.',
    ],
    alternatives: [
      'A needle sample through the chest wall instead of surgery.',
      'A chest drain alone for fluid or air.',
      'Radiotherapy or chemotherapy instead of resection for some tumours.',
      'Antibiotics alone for infection, which often fails once pus is thick and loculated.',
    ],
    recovery:
      'Three days to two weeks, governed by the chest drain. Breathing exercises and early '
      + 'walking are essential. Stopping smoking before surgery measurably reduces complications.',
  },

  'Cardiac surgery – coronary and valve surgery': {
    whatItIs:
      'Open heart surgery — bypassing blocked coronary arteries with grafts, or repairing or '
      + 'replacing a heart valve. Usually with the heart stopped and a machine taking over '
      + 'circulation.',
    whyItIsDone:
      'For angina or blocked arteries not controllable by other means, or a valve that is '
      + 'leaking or narrowed and straining the heart.',
    benefits: [
      'Relieves angina and improves exercise capacity.',
      'Improves survival in significant coronary disease and in severe valve disease.',
      'Prevents progressive damage to the heart muscle.',
    ],
    risks: [
      'Stroke, heart attack, kidney failure, or death. These are real risks in heart surgery; '
      + 'your surgeon will give you your own estimated figures, which depend on your heart '
      + 'function and other illnesses.',
      'Irregular heart rhythm, very common in the first days, sometimes needing treatment or a '
      + 'pacemaker.',
      'Infection of the chest wound or the breastbone, which is serious and prolonged.',
      'Bleeding needing transfusion or return to theatre.',
      'Memory and concentration difficulty in the early months.',
      'A mechanical valve requires lifelong blood-thinning medicine with regular blood tests '
      + 'and a bleeding risk; a tissue valve avoids this but wears out and may need replacing.',
      'Grafts can narrow or block over the years.',
    ],
    alternatives: [
      'Medicines alone, for symptom control and risk reduction.',
      'Stenting the coronary arteries instead of bypass, where the anatomy allows.',
      'Valve treatment through a catheter rather than open surgery, where available and '
      + 'suitable.',
      'Choosing not to operate, accepting the natural course of the disease.',
    ],
    recovery:
      'One to two days in intensive care, five to ten days in hospital. Breastbone takes six to '
      + 'twelve weeks to heal: no lifting, pushing or pulling. Cardiac rehabilitation improves '
      + 'both recovery and long-term outcome and should be attended.',
  },

  'Congenital cardiac surgery': {
    whatItIs:
      'An operation to repair a heart abnormality present from birth — closing a hole, '
      + 'relieving a narrowing, or reconstructing the connections of the heart and great '
      + 'vessels.',
    whyItIsDone:
      'Because the abnormality is causing heart failure, poor growth, blue colouring, or '
      + 'damage to the lungs that becomes irreversible if left.',
    benefits: [
      'Corrects or greatly improves the circulation, allowing normal growth and activity.',
      'Prevents irreversible lung damage, which is why timing matters.',
      'Many children go on to lead normal or near-normal lives.',
    ],
    risks: [
      'Death or serious complication, which is higher than in adult heart surgery for complex '
      + 'conditions and depends greatly on the specific defect.',
      'Irregular heart rhythm, sometimes needing a pacemaker.',
      'Residual leaks or narrowing, needing further operations — some conditions are repaired '
      + 'in planned stages over years.',
      'Effects on neurological development, particularly after long operations in infancy.',
      'Lifelong cardiology follow-up, and antibiotic precautions for dental work in some '
      + 'conditions.',
      'Valves and conduits used in children do not grow and will need replacing.',
    ],
    alternatives: [
      'Closure or dilatation through a catheter instead of open surgery, for suitable defects.',
      'Medicines to support the heart while waiting for the best time to operate.',
      'Staged palliative procedures where full repair is not possible.',
      'Comfort-focused care where repair is not achievable.',
    ],
    recovery:
      'A week to several weeks, beginning in intensive care. Feeding and growth are watched '
      + 'closely. Follow-up is lifelong, and transition to adult congenital services matters.',
  },

  'Cardiac emergency and miscellaneous surgery': {
    whatItIs:
      'Urgent heart surgery or a related procedure — draining fluid compressing the heart, '
      + 'repairing injury, inserting a pacemaker, or opening the chest for arrest.',
    whyItIsDone:
      'Because the heart is being compressed, injured, or beating dangerously, and the '
      + 'situation will not wait.',
    benefits: [
      'Relieves compression of the heart, which restores circulation immediately.',
      'Controls bleeding from cardiac injury.',
      'A pacemaker reliably prevents dangerously slow rhythms and collapse.',
    ],
    risks: [
      'Emergency cardiac procedures carry substantially higher risk than planned surgery.',
      'Injury to the heart or coronary vessels during drainage or device placement.',
      'Bleeding, tamponade recurring, or the need for open surgery.',
      'Pacemaker leads can dislodge, and the device pocket can become infected.',
      'Air around the lung needing a chest drain.',
      'Despite everything being done correctly, the underlying condition may not be survivable.',
    ],
    alternatives: [
      'Drainage with a needle or catheter instead of open surgery, where the situation allows.',
      'Medicines for rhythm control instead of a device, in selected patients.',
      'In a true emergency there is often no alternative that preserves life.',
    ],
    recovery:
      'Depends entirely on the underlying problem. After a pacemaker: home in a day or two, '
      + 'avoid raising the arm above the shoulder for a few weeks, and attend device checks.',
  },

  'Paediatric thoracic surgery': {
    whatItIs:
      'An operation inside a child’s chest — repairing a congenital abnormality of the gullet, '
      + 'diaphragm, airway or lung, or removing a lesion.',
    whyItIsDone:
      'For an abnormality present from birth that prevents feeding or breathing, or for '
      + 'infection or a growth.',
    benefits: [
      'Allows normal feeding and breathing, which is immediately life-saving in some newborns.',
      'Prevents repeated chest infection and damage to the lung.',
      'Allows normal growth and development.',
    ],
    risks: [
      'Leakage or narrowing at a join in the gullet, needing stretching or further surgery.',
      'Reflux, feeding difficulty and poor weight gain, often for months.',
      'Prolonged ventilation and intensive care, particularly for diaphragm defects.',
      'Chest wall asymmetry or curvature of the spine as the child grows after a thoracotomy.',
      'Air leak and the need for a chest drain.',
      'Some conditions require further operations in later childhood.',
    ],
    alternatives: [
      'Delaying surgery to stabilise the baby first, which is often the safer course.',
      'Keyhole rather than open surgery, where the child’s size and condition allow.',
      'Supportive care where the abnormality is not survivable — discussed openly with the '
      + 'family.',
    ],
    recovery:
      'One to several weeks, usually starting in neonatal or paediatric intensive care. Feeding '
      + 'is established gradually. Long-term follow-up for growth, feeding and chest shape.',
  },

  // ───────────────────────────────────────────────────── paediatric surgery ────

  'Neonatal and congenital abdominal surgery': {
    whatItIs:
      'An operation on a newborn’s abdomen to correct an abnormality present from birth — a '
      + 'blockage, a gap in the abdominal wall, or an absent or malformed passage.',
    whyItIsDone:
      'Because the baby cannot feed, pass stool, or because the bowel is exposed or at risk of '
      + 'losing its blood supply.',
    benefits: [
      'Restores the passage of feed and stool, allowing the baby to grow.',
      'Saves bowel that would otherwise die.',
      'Most babies go on to normal or near-normal function.',
    ],
    risks: [
      'A stoma is often needed, usually temporary, and closed at a later operation.',
      'A join in the bowel can leak or narrow, needing further surgery.',
      'Feeding intolerance and prolonged dependence on intravenous nutrition, which carries '
      + 'its own risks to the liver and from line infection.',
      'Short bowel, where a long segment must be removed, with lifelong consequences for '
      + 'feeding.',
      'Adhesions causing obstruction later in childhood.',
      'Associated abnormalities of the heart, kidneys or spine are common and are looked for.',
    ],
    alternatives: [
      'Staged surgery — a temporary measure first, with definitive repair when the baby is '
      + 'bigger and stronger.',
      'Non-operative management for a few specific conditions.',
      'Comfort care where the abnormality, or the baby’s other conditions, make survival '
      + 'unlikely. This is a decision made with the family.',
    ],
    recovery:
      'Weeks in neonatal intensive care is usual. Feeding is built up slowly. Parents are '
      + 'taught stoma care where needed. Follow-up continues through childhood.',
  },

  'Paediatric gastrointestinal surgery': {
    whatItIs:
      'An operation on the stomach, bowel or anus of an infant or child — for obstruction, '
      + 'inflammation, a congenital abnormality, or to provide feeding access.',
    whyItIsDone:
      'For vomiting, obstruction, severe reflux, appendicitis, constipation from an abnormal '
      + 'bowel, or inability to feed by mouth.',
    benefits: [
      'Relieves obstruction and allows feeding and growth.',
      'Removes an inflamed appendix before it bursts.',
      'Restores normal passage of stool and continence.',
      'A feeding tube can transform the growth of a child who cannot feed safely by mouth.',
    ],
    risks: [
      'Leak or narrowing at a join, needing further surgery.',
      'Soiling, constipation or incontinence after operations on the lower bowel and anus, '
      + 'sometimes needing a long-term bowel management programme.',
      'A stoma, usually temporary.',
      'Adhesions causing obstruction later.',
      'A feeding tube site can leak, granulate or become infected, and the tube needs changing '
      + 'periodically.',
      'Children can be slow to tolerate feed after bowel surgery.',
    ],
    alternatives: [
      'Medicines and feeding adjustments for reflux and constipation, which should usually be '
      + 'tried first.',
      'Non-operative treatment of some cases of appendicitis with antibiotics.',
      'Nasogastric feeding instead of a surgical feeding tube in the short term.',
    ],
    recovery:
      'Two days to two weeks depending on the operation. Feeds restart gradually. Parents are '
      + 'taught tube or stoma care. Follow-up for bowel function may continue for years.',
  },

  'Paediatric urological and genital surgery': {
    whatItIs:
      'An operation on a child’s genitals or urinary tract — repairing an abnormal opening, '
      + 'bringing down an undescended testis, correcting a hernia or hydrocele, or circumcision.',
    whyItIsDone:
      'For an abnormality present from birth, an undescended testis, a hernia, or a tight '
      + 'foreskin causing symptoms.',
    benefits: [
      'Allows normal passing of urine, in a standing stream where that matters to the child.',
      'Brings the testis into the scrotum, which protects fertility and allows it to be '
      + 'examined in later life.',
      'Repairs a hernia before it becomes trapped, which in infants can happen quickly.',
    ],
    risks: [
      'A fistula — a leak of urine through a new opening — after repair of an abnormal urethral '
      + 'opening. Common enough that a second operation is sometimes planned for.',
      'Narrowing at the new opening, causing a poor stream.',
      'The testis can retract upwards again, or shrink if its blood supply is compromised.',
      'Effects on later fertility, particularly where both testes were affected.',
      'Bleeding and infection after circumcision, and rarely injury to the glans — this is a '
      + 'procedure that should be done by trained hands.',
      'Repairs in young children may need revision in adolescence.',
    ],
    alternatives: [
      'Waiting, since some undescended testes descend in the first months and some hydroceles '
      + 'resolve.',
      'Hormone treatment in selected cases.',
      'Not circumcising, where there is no medical indication — this is a decision for the '
      + 'family and should be made with full information.',
    ],
    recovery:
      'Usually day cases. A catheter or dressing may stay for one to two weeks after urethral '
      + 'repair. Loose clothing, double nappies as instructed, and avoiding straddling toys for '
      + 'two to four weeks.',
  },

  'Paediatric tumours and miscellaneous procedures': {
    whatItIs:
      'Removal of a tumour in a child, placement of a line for chemotherapy, or another '
      + 'procedure in the overall treatment of childhood cancer.',
    whyItIsDone:
      'To remove a tumour, to obtain tissue for diagnosis, or to provide safe access for '
      + 'treatment that will run for months.',
    benefits: [
      'Removes the tumour, which with chemotherapy gives many childhood cancers a good chance '
      + 'of cure.',
      'Gives the exact diagnosis, which determines the whole treatment plan.',
      'A central line spares a child repeated needles over many months.',
    ],
    risks: [
      'Bleeding, and the possibility of needing to remove an adjacent organ such as a kidney.',
      'Tumour spillage during removal, which may mean more intensive treatment afterwards.',
      'A central line can become infected or blocked and may need replacing.',
      'Chemotherapy and radiotherapy have their own substantial effects, including on growth '
      + 'and fertility.',
      'Long-term follow-up for late effects of treatment is needed into adult life.',
      'Despite complete removal, the disease can return.',
    ],
    alternatives: [
      'Chemotherapy first to shrink the tumour before surgery, which is standard for several '
      + 'childhood cancers.',
      'Biopsy alone initially.',
      'Treatment aimed at comfort where cure is not achievable — discussed openly and with '
      + 'support.',
    ],
    recovery:
      'Varies with the operation and the treatment plan. Surgery is one step in a programme '
      + 'lasting months. The team will set out the whole plan, and you may ask for it in '
      + 'writing.',
  },
};
