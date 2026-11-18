// ENT, oral and maxillofacial surgery, and plastic and reconstructive surgery.
//
// Keys match the `category` strings in src/lib/procedures/catalogue.ts exactly.

import type { CounsellingLibrary } from '../types';

export const ENT_MAXFAX_PLASTICS: CounsellingLibrary = {
  // ───────────────────────────────────────────────────────────────── ENT ────

  'Ear and otology surgery': {
    whatItIs:
      'An operation on the ear — draining the middle ear, repairing the eardrum, removing '
      + 'disease from the mastoid bone, or working on the small hearing bones.',
    whyItIsDone:
      'For repeated infection, a persistent hole in the eardrum, discharge, cholesteatoma '
      + '(skin growing where it should not), or hearing loss that can be corrected.',
    benefits: [
      'Stops repeated discharge and infection, giving a safe, dry ear.',
      'Removes disease that, left alone, can erode bone and threaten the facial nerve, the '
      + 'balance organ and the brain.',
      'Hearing may improve, though a safe dry ear is the primary aim.',
    ],
    risks: [
      'Hearing can be worse after the operation, and in rare cases the ear becomes completely '
      + 'deaf.',
      'Weakness of the face on that side, from injury to the facial nerve which runs through '
      + 'the ear. Uncommon, usually temporary, occasionally permanent.',
      'Dizziness and unsteadiness for days or weeks.',
      'Ringing in the ear, which may be new or worse.',
      'Change in taste on that side of the tongue, usually temporary.',
      'Disease can recur, and cholesteatoma in particular needs long-term follow-up and '
      + 'sometimes further surgery.',
    ],
    alternatives: [
      'Regular ear cleaning and drops, which can control discharge without surgery.',
      'A hearing aid instead of hearing-restoring surgery.',
      'Choosing not to operate — reasonable for a dry hole in the drum, but not where there is '
      + 'cholesteatoma.',
    ],
    recovery:
      'Usually a day case or one night. Keep the ear completely dry for several weeks. Avoid '
      + 'nose-blowing, flying and swimming until you are told it is safe.',
  },

  'Nose and sinus surgery': {
    whatItIs:
      'An operation inside the nose — straightening the partition, reducing the turbinates, '
      + 'opening the sinuses with a telescope, or removing polyps.',
    whyItIsDone:
      'For blocked nose, repeated or chronic sinus infection, polyps, loss of smell, or '
      + 'recurrent nosebleeds.',
    benefits: [
      'Improves nasal airflow and, with it, sleep and daytime function.',
      'Reduces the frequency of sinus infections and the need for antibiotics.',
      'Allows sprays and rinses to reach the sinuses and actually work.',
    ],
    risks: [
      'Bleeding, which from the nose can be brisk, and occasionally needs packing or a return '
      + 'to theatre.',
      'Crusting, dryness and a blocked feeling for several weeks while the nose heals.',
      'Symptoms can return; polyps in particular commonly recur and need ongoing treatment.',
      'Change in the shape of the nose after work on the partition.',
      'Reduced or altered sense of smell, which may not recover.',
      'Rarely, injury to the thin bone next to the eye or the brain, causing leakage of fluid '
      + 'from the nose, eye problems, or infection — rare but serious.',
      'Adhesions forming inside the nose, needing division in clinic.',
    ],
    alternatives: [
      'Steroid sprays, saline rinses and allergy treatment, which should usually be tried '
      + 'properly first.',
      'Antibiotics for acute infection.',
      'Choosing not to operate, accepting continued blockage.',
    ],
    recovery:
      'Usually a day case or one night. Expect a blocked, bloody nose for one to two weeks. '
      + 'Saline rinses several times daily make a real difference. Avoid blowing the nose and '
      + 'heavy lifting for two weeks.',
  },

  'Throat and laryngeal surgery': {
    whatItIs:
      'An operation on the tonsils, adenoids, pharynx, voice box or windpipe — removing, '
      + 'sampling, widening or creating an airway.',
    whyItIsDone:
      'For repeated tonsillitis, obstructed breathing or sleep apnoea, hoarseness, a growth, '
      + 'or an airway that is narrowing.',
    benefits: [
      'Stops repeated throat infections and the time lost to them.',
      'Relieves obstructed breathing and snoring, often transforming sleep.',
      'Secures the airway, which in some conditions is life-saving.',
      'Gives a tissue diagnosis for a growth.',
    ],
    risks: [
      'Bleeding after tonsil surgery, which can occur up to two weeks later and is an '
      + 'emergency — come straight back.',
      'Severe throat pain for one to two weeks, often referred to the ears.',
      'Change in voice, which is the specific risk of surgery on the voice box and may be '
      + 'permanent.',
      'Difficulty swallowing, and food or fluid going into the airway.',
      'Damage to teeth or lips from the instrument used to hold the mouth open.',
      'A tracheostomy, if needed, changes voice, swallowing and daily care, and may be '
      + 'temporary or permanent.',
    ],
    alternatives: [
      'Antibiotics and watchful waiting for recurrent tonsillitis — counting the episodes per '
      + 'year is how the decision is properly made.',
      'Weight loss and breathing support devices for sleep apnoea.',
      'Speech therapy for voice problems.',
      'Radiotherapy instead of surgery for some growths.',
    ],
    recovery:
      'Tonsil surgery: day case or one night, two weeks of sore throat, eat normally as it '
      + 'helps healing, drink plenty. Stay off work or school for two weeks and away from '
      + 'people with coughs and colds.',
  },

  'Head and neck surgery': {
    whatItIs:
      'An operation on the structures of the neck — lymph nodes, glands, or a growth — '
      + 'sometimes with removal of the lymph nodes of the neck.',
    whyItIsDone:
      'For a lump in the neck, a growth of the mouth, throat or glands, or to stage and treat '
      + 'a cancer.',
    benefits: [
      'Removes the growth and gives the exact diagnosis and stage.',
      'Clearing lymph nodes reduces the risk of the disease returning in the neck.',
      'Relieves pressure on the airway or the gullet.',
    ],
    risks: [
      'Numbness of the neck, ear and shoulder skin, which is usual and often permanent.',
      'Shoulder weakness and a dropped shoulder from injury to the nerve supplying the '
      + 'shoulder muscle, causing lasting difficulty lifting the arm.',
      'Weakness of the lower lip, the tongue or the voice from injury to other nerves.',
      'Leakage of lymph fluid from the wound, needing drainage and a low-fat diet.',
      'A visible scar on the neck.',
      'Swallowing and speech may be affected, sometimes needing therapy or temporary tube '
      + 'feeding.',
    ],
    alternatives: [
      'A needle sample first, to establish the diagnosis before major surgery.',
      'Radiotherapy, with or without chemotherapy, instead of surgery for some cancers.',
      'Observation for a benign lump.',
      'Treatment aimed at comfort where cure is not achievable.',
    ],
    recovery:
      'Three days to two weeks in hospital. Drains stay until the fluid settles. Shoulder '
      + 'physiotherapy should start early and is important.',
  },

  'Paediatric ENT procedures': {
    whatItIs:
      'An ear, nose or throat operation in a child — commonly removing tonsils or adenoids, '
      + 'inserting grommets, or removing something a child has inhaled or swallowed.',
    whyItIsDone:
      'For repeated infection, glue ear with hearing loss, obstructed breathing during sleep, '
      + 'or an inhaled or swallowed foreign body.',
    benefits: [
      'Restores hearing where fluid behind the eardrum has dulled it, which matters for speech '
      + 'and schooling.',
      'Relieves obstructed breathing at night, which improves sleep, behaviour and growth.',
      'Removes an inhaled object before it causes lasting lung damage.',
    ],
    risks: [
      'Bleeding after tonsil surgery, which may happen up to two weeks later and needs '
      + 'immediate return to hospital.',
      'Breathing problems in the first night, which is why some children stay in, particularly '
      + 'the very young and those with sleep apnoea.',
      'Grommets fall out naturally and may need repeating; the eardrum can be left with a hole '
      + 'or scarring.',
      'Change in the sound of the voice after adenoid removal, and rarely fluid coming down '
      + 'the nose when drinking.',
      'Children feel pain for longer than parents expect, and need regular pain relief by the '
      + 'clock rather than on demand.',
    ],
    alternatives: [
      'Watchful waiting, since glue ear and many throat infections improve as the child grows.',
      'Hearing aids instead of grommets.',
      'Nasal steroids for obstruction.',
      'Choosing not to operate, accepting continued symptoms.',
    ],
    recovery:
      'Day case or one night in most cases. Two weeks off school after tonsil surgery. Keep '
      + 'the ears dry after grommets if advised. Give pain relief regularly for the first week.',
  },

  // ──────────────────────────────────────────────────── oral & maxillofacial ────

  'Oral and dental surgery': {
    whatItIs:
      'An operation inside the mouth — removing teeth including buried wisdom teeth, draining '
      + 'infection, removing cysts, or preparing the jaw for implants.',
    whyItIsDone:
      'For pain, infection, a tooth that cannot be saved or is impacted, a cyst, or to prepare '
      + 'for dentures or implants.',
    benefits: [
      'Relieves pain and clears infection at its source.',
      'Prevents damage to neighbouring teeth and the spread of infection into the neck.',
      'Restores the ability to eat comfortably.',
    ],
    risks: [
      'Numbness of the lip, chin or tongue from injury to the nerves lying close to the lower '
      + 'back teeth. Usually temporary, occasionally permanent.',
      'Dry socket — severe pain three to five days afterwards — which is commoner in smokers.',
      'Opening between the mouth and the sinus when upper back teeth are removed, sometimes '
      + 'needing repair.',
      'Limited mouth opening, swelling and bruising for about a week.',
      'Fracture of the jaw during removal of a deeply buried tooth. Rare but serious.',
      'Infection of the socket, needing antibiotics.',
    ],
    alternatives: [
      'Root canal treatment or a filling to save the tooth.',
      'Antibiotics to settle infection first, though they rarely cure it alone.',
      'Leaving an impacted tooth and monitoring it, if it is causing no trouble.',
    ],
    recovery:
      'Day case. Swelling peaks at two to three days. Soft diet, salt-water rinses from the '
      + 'next day, no smoking and no spitting or straws for a week — these cause dry socket.',
  },

  'Oral and maxillofacial oncology': {
    whatItIs:
      'Removal of a growth from the mouth, jaw or face, usually with reconstruction of what is '
      + 'removed, and often with removal of lymph nodes from the neck.',
    whyItIsDone:
      'For a cancer or an aggressive growth of the mouth, tongue, jaw or facial bones.',
    benefits: [
      'Removes the tumour with a margin, which offers the best chance of cure.',
      'Reconstruction restores the ability to eat, speak and to have a face you recognise.',
      'Gives the full pathological information that decides whether further treatment is needed.',
    ],
    risks: [
      'Lasting change in speech, chewing and swallowing, sometimes requiring long-term '
      + 'adaptation or tube feeding.',
      'Visible change in facial appearance, which is permanent.',
      'Numbness or weakness of the face, lip or tongue.',
      'A flap used for reconstruction can fail, needing urgent further surgery; there will '
      + 'also be a wound where the tissue was taken from.',
      'Teeth may need removal, and dental rehabilitation takes months.',
      'Radiotherapy afterwards brings dry mouth, taste change and risk to the jaw bone.',
      'The disease can still return despite complete removal.',
    ],
    alternatives: [
      'Radiotherapy with or without chemotherapy, instead of surgery for some tumours.',
      'A smaller operation accepting a higher chance of recurrence.',
      'Treatment aimed at comfort and quality of life where cure is not achievable.',
    ],
    recovery:
      'One to three weeks in hospital, often with time in intensive care. Feeding tube and '
      + 'tracheostomy may be needed temporarily. Speech and swallowing therapy continues for '
      + 'months, and follow-up for years.',
  },

  'Facial trauma and fracture surgery': {
    whatItIs:
      'Repositioning and fixing broken facial bones with small plates and screws, sometimes '
      + 'with the teeth wired or elastically held together for a period.',
    whyItIsDone:
      'For fractures of the jaw, cheek, nose or eye socket that have displaced the bones, '
      + 'altering the bite, the vision or the shape of the face.',
    benefits: [
      'Restores the bite, so that chewing works and the teeth meet correctly.',
      'Restores facial shape and symmetry.',
      'Protects the eye and corrects double vision from a fractured eye socket.',
    ],
    risks: [
      'Numbness of the lip, cheek, chin or gums, often from the injury itself rather than the '
      + 'surgery, which may be permanent.',
      'The bite may not be perfect afterwards and may need adjustment or orthodontic treatment.',
      'Plates can become infected, loosen or be felt under the skin, and may need removal later.',
      'Scars where cuts are made outside the mouth.',
      'Double vision or a sunken eye after eye-socket fractures.',
      'Jaw joint stiffness, particularly if the jaws are held together for weeks.',
      'Injury to the facial nerve, causing weakness.',
    ],
    alternatives: [
      'Treating without surgery, with a soft diet and observation, where the bones are barely '
      + 'displaced.',
      'Closed reduction without plates, for some fractures.',
      'Accepting the deformity or the altered bite rather than operating.',
    ],
    recovery:
      'One to three days in hospital. Soft or liquid diet for up to six weeks. Scrupulous mouth '
      + 'care. Avoid contact sport for three months.',
  },

  'Orthognathic and jaw surgery': {
    whatItIs:
      'Planned repositioning of the upper jaw, lower jaw or chin, cut and fixed in a new '
      + 'position with plates and screws, usually alongside orthodontic treatment.',
    whyItIsDone:
      'For a bite that cannot be corrected by braces alone, difficulty chewing or speaking, '
      + 'sleep apnoea, or marked facial disproportion.',
    benefits: [
      'Corrects the bite so that the teeth meet properly and chewing is effective.',
      'Improves facial balance and profile.',
      'Can substantially improve sleep apnoea and breathing.',
    ],
    risks: [
      'Numbness of the lower lip and chin is very common after lower jaw surgery, and is '
      + 'permanent in a proportion of patients. This must be accepted before going ahead.',
      'The jaw can relapse towards its old position over the following year.',
      'The bite may need further orthodontic adjustment afterwards.',
      'Jaw joint pain or stiffness, and limited mouth opening.',
      'Plates may need removal later.',
      'Significant swelling for two to three weeks and a face that looks different — which is '
      + 'the point, but can be unsettling.',
      'Unexpected fracture of the bone during the cut.',
    ],
    alternatives: [
      'Orthodontic treatment alone, accepting a compromise in the bite and the profile.',
      'No treatment, if function is adequate.',
      'Treating sleep apnoea with a breathing device instead.',
    ],
    recovery:
      'Two to four days in hospital. Liquid then soft diet for about six weeks. Swelling '
      + 'settles over weeks and the final result is judged at six to twelve months. Braces '
      + 'usually continue for some months afterwards.',
  },

  'Salivary gland and temporomandibular joint surgery': {
    whatItIs:
      'Removal of a salivary gland or a stone within it, or an operation on the jaw joint in '
      + 'front of the ear.',
    whyItIsDone:
      'For a lump in the gland, repeated swelling and pain on eating, a stone blocking the '
      + 'duct, or a jaw joint that is painful, locked or dislocating.',
    benefits: [
      'Removes the lump and gives a definite diagnosis.',
      'Stops the repeated painful swelling caused by a blocked gland.',
      'Can improve jaw opening and relieve joint pain.',
    ],
    risks: [
      'Facial nerve weakness after parotid surgery — the nerve to the face runs through the '
      + 'gland. Usually temporary; permanent weakness of part of the face is possible.',
      'Numbness of the earlobe, which is usual and often permanent.',
      'Frey’s syndrome — sweating and flushing of the cheek when eating — developing months '
      + 'later.',
      'A salivary fistula or collection, usually settling with time.',
      'Dry mouth if multiple glands are removed.',
      'Jaw joint surgery may not relieve pain, and the joint can stiffen afterwards.',
    ],
    alternatives: [
      'Massage, hydration, sour sweets and antibiotics for a blocked or infected gland.',
      'Removing a stone through the duct rather than removing the gland.',
      'For the jaw joint: a bite splint, physiotherapy, pain relief and avoiding wide opening — '
      + 'which should usually be tried thoroughly first.',
    ],
    recovery:
      'One to three days in hospital. A drain for a day or two. Facial movement is checked '
      + 'before you leave. Soft diet and jaw exercises as instructed.',
  },

  'Cleft and craniofacial procedures': {
    whatItIs:
      'Repair of a cleft lip or palate, or reshaping of the skull and facial bones in a child '
      + 'born with an abnormality of facial development.',
    whyItIsDone:
      'To allow normal feeding, speech, hearing and facial growth, and to relieve pressure on '
      + 'the growing brain where the skull has fused too early.',
    benefits: [
      'Allows normal feeding and, after palate repair, normal speech development in most '
      + 'children.',
      'Improves appearance and the child’s social development.',
      'Relieves raised pressure inside the skull and protects vision and brain development.',
    ],
    risks: [
      'A hole can re-open in the repaired palate, needing further surgery.',
      'Speech may still be nasal and need therapy, and sometimes a further operation.',
      'Facial growth can be restricted by the repair, requiring jaw surgery in the teenage years.',
      'Craniofacial surgery involves significant blood loss and usually transfusion, and is '
      + 'performed with a neurosurgical team.',
      'Repeated operations over childhood are the norm rather than the exception, and the plan '
      + 'spans years.',
      'Glue ear and hearing problems are common with cleft palate and need monitoring.',
    ],
    alternatives: [
      'Timing the operation differently, since staging varies between units.',
      'Feeding aids and obturator plates while waiting.',
      'For mild skull abnormalities, monitoring head shape and pressure rather than operating.',
    ],
    recovery:
      'Lip repair: two to three days. Palate repair: three to five days, soft diet, arm splints '
      + 'to stop the child putting fingers in the mouth. Craniofacial surgery: a week, often '
      + 'with intensive care, and dramatic facial swelling that settles.',
  },

  // ──────────────────────────────────────────────── plastic & reconstructive ────

  'Flap reconstruction': {
    whatItIs:
      'Moving living tissue — skin, fat, muscle, sometimes bone — with its blood supply, from '
      + 'one part of the body to cover or rebuild a defect in another.',
    whyItIsDone:
      'To cover an area where bone, tendon or an implant is exposed, where a graft will not '
      + 'take, or to rebuild a part that has been removed.',
    benefits: [
      'Provides durable, living cover with its own blood supply, which a skin graft cannot.',
      'Rebuilds shape and function, not just the surface.',
      'Allows wounds to heal that have resisted every other treatment.',
    ],
    risks: [
      'The flap can fail, partly or completely, if its blood supply is compromised. This is '
      + 'the central risk and may mean urgent return to theatre or a different reconstruction.',
      'A second wound where the tissue was taken from, with its own scar, and sometimes a skin '
      + 'graft to close it.',
      'Weakness or loss of function at the donor site.',
      'Mismatch of skin colour and texture, and a bulky result that may need refining later.',
      'Prolonged immobility and strict positioning afterwards, which is demanding.',
      'Smoking substantially increases the risk of failure, and is the one factor you control.',
    ],
    alternatives: [
      'A skin graft, where the bed will support one.',
      'Dressings and healing by secondary intention over a long period.',
      'A simpler, less ambitious reconstruction.',
      'Amputation, where reconstruction is not realistic.',
    ],
    recovery:
      'One to two weeks in hospital with frequent checks on the flap in the first days. Strict '
      + 'positioning and no smoking. Refinement procedures are often planned months later.',
  },

  'Skin grafting and wound reconstruction': {
    whatItIs:
      'Taking a thin layer of skin from one part of the body and laying it onto a wound, or '
      + 'closing a wound by moving adjacent skin.',
    whyItIsDone:
      'To close a wound that is too large to stitch, to speed healing, and to reduce infection '
      + 'and fluid loss.',
    benefits: [
      'Closes the wound far faster than waiting for it to heal on its own.',
      'Reduces pain, infection and scarring from prolonged open healing.',
      'Allows earlier mobilisation and discharge.',
    ],
    risks: [
      'The graft may not take, wholly or partly, particularly if the bed is infected or moves. '
      + 'Repeat grafting may be needed.',
      'The donor site is a painful raw area that takes two to three weeks to heal and leaves a '
      + 'permanent mark.',
      'Colour and texture of the grafted skin differ permanently from the surrounding skin.',
      'Grafts contract as they mature, which across a joint can limit movement and need '
      + 'release later.',
      'Increased or reduced sensation in the grafted area.',
      'Itching for months as it matures.',
    ],
    alternatives: [
      'Dressings alone, allowing the wound to close slowly on its own.',
      'A flap, where a graft would not survive or would give a poor functional result.',
      'Negative-pressure dressings to prepare or close the wound.',
    ],
    recovery:
      'The graft is usually inspected at day three to five. Keep the area still. Donor site '
      + 'heals in two to three weeks. Moisturise and protect from sun for a year, and massage '
      + 'as instructed.',
  },

  'Burns surgery': {
    whatItIs:
      'Removing burnt tissue and covering the area, together with release of tight scar that '
      + 'has restricted movement.',
    whyItIsDone:
      'To remove dead tissue that drives infection and illness, to close the wound, and to '
      + 'restore movement lost to contracture.',
    benefits: [
      'Removing dead tissue early reduces infection and improves survival in major burns.',
      'Closing the wound stops fluid and heat loss and reduces pain.',
      'Releasing a contracture restores movement and function, often dramatically.',
    ],
    risks: [
      'Considerable blood loss during removal of burnt tissue; transfusion is usual in large '
      + 'burns.',
      'Infection and sepsis remain the main threat to life in major burns.',
      'Grafts may fail and need repeating.',
      'Scars thicken, tighten and itch for a year or more, and contractures can recur, '
      + 'especially in children as they grow.',
      'Permanent change in colour, texture and sensation.',
      'Repeated operations over months or years are usual.',
      'Pain and the psychological effect of burns are substantial and need treating in their '
      + 'own right.',
    ],
    alternatives: [
      'Dressings alone for superficial burns, which heal without surgery.',
      'Delaying surgery until the depth declares itself, in uncertain burns.',
      'Splinting, pressure garments and physiotherapy to prevent or limit contracture.',
    ],
    recovery:
      'Depends on the size of the burn and is often measured in months. Pressure garments, '
      + 'splints, massage and physiotherapy continue long after the wounds close, and they '
      + 'determine the final result as much as the surgery does.',
  },

  'Hand and upper limb reconstruction': {
    whatItIs:
      'Repair or reconstruction of the tendons, nerves, bones, joints or skin of the hand and '
      + 'arm, including release of trapped nerves and correction of deformity.',
    whyItIsDone:
      'For injury, a trapped nerve, a stiff or deformed hand, infection, or loss of function.',
    benefits: [
      'Restores grip, pinch and movement — the functions that determine independence and work.',
      'Relieves numbness, tingling and night pain from a trapped nerve.',
      'Prevents permanent deformity and wasting if done early.',
    ],
    risks: [
      'Stiffness, which is the main enemy of hand surgery and the reason therapy is not '
      + 'optional.',
      'A repaired tendon can rupture, often in the first six weeks, and need re-operation.',
      'Nerve recovery is slow and often incomplete; numbness or altered sensation may be '
      + 'permanent.',
      'Cold intolerance after nerve injury, which can persist for years.',
      'Scar sensitivity and tenderness at the base of the palm after nerve release, lasting '
      + 'months.',
      'Complex regional pain syndrome — disproportionate pain, swelling and stiffness — which '
      + 'is uncommon but difficult.',
      'The hand may not return to its previous level of function.',
    ],
    alternatives: [
      'Splinting, therapy and steroid injection, which resolve many hand conditions.',
      'Activity modification and waiting.',
      'Accepting the deformity or loss of function rather than operating.',
    ],
    recovery:
      'Mostly day cases. A splint for days to six weeks depending on what was repaired. Hand '
      + 'therapy is central: the result depends on it at least as much as on the operation. '
      + 'Elevate the hand to control swelling.',
  },

  'Breast and body contouring surgery': {
    whatItIs:
      'Reshaping of the breast or body — reduction, reconstruction, lifting, or removal of '
      + 'excess skin and fat.',
    whyItIsDone:
      'For back and neck pain or rashes from large breasts, reconstruction after cancer '
      + 'surgery, excess skin after major weight loss, or asymmetry.',
    benefits: [
      'Relieves the physical symptoms of very large breasts, which is a genuine medical benefit.',
      'Restores shape after cancer surgery, which affects how patients live afterwards.',
      'Removes skin folds that cause recurrent rashes and infection.',
    ],
    risks: [
      'Extensive permanent scars; this is the trade made in every contouring operation and '
      + 'should be seen and understood before consenting.',
      'Changed or lost nipple sensation, and possible inability to breastfeed after reduction.',
      'Partial loss of the nipple or of skin edges, particularly in smokers and people with '
      + 'diabetes.',
      'Fluid collecting under the skin, often needing repeated drainage.',
      'Asymmetry, irregularity or a result that does not match what you pictured. Further '
      + 'surgery may be wanted.',
      'With implants: hardening, rippling, rupture, rotation, and the near-certainty of further '
      + 'surgery over a lifetime.',
      'Clots in the legs and lungs, to which long body-contouring operations add real risk.',
    ],
    alternatives: [
      'A properly fitted support garment and physiotherapy for symptoms from large breasts.',
      'Weight stabilisation before surgery, which improves both safety and result.',
      'An external prosthesis instead of breast reconstruction.',
      'Choosing not to operate.',
    ],
    recovery:
      'One to three days in hospital for larger procedures. Support garments for six weeks. No '
      + 'heavy lifting for six weeks. Scars take twelve to eighteen months to fade and the '
      + 'final shape settles over months.',
  },

  'Craniofacial and aesthetic surgery': {
    whatItIs:
      'Surgery to alter the shape of the face or skull — reshaping bone, lifting or removing '
      + 'skin, or augmenting contour.',
    whyItIsDone:
      'To correct a deformity present from birth, the result of injury or disease, or an '
      + 'appearance causing the patient distress.',
    benefits: [
      'Improves facial symmetry and proportion.',
      'Can correct functional problems — breathing, vision, chewing — as well as appearance.',
      'Where the concern is longstanding and realistic, can substantially improve confidence.',
    ],
    risks: [
      'The result may not match what you imagined. Expectations are the commonest cause of '
      + 'dissatisfaction, and they are worth discussing in detail beforehand.',
      'Visible scars, asymmetry, or contour irregularities.',
      'Numbness or weakness of parts of the face, which may be permanent.',
      'Further surgery is frequently wanted or needed.',
      'Swelling and bruising for weeks, and a final result that cannot be judged for many '
      + 'months.',
      'Implants can shift, become infected, or need removal.',
    ],
    alternatives: [
      'Non-surgical treatments, camouflage or no treatment at all.',
      'A staged, smaller procedure first.',
      'Psychological support where distress about appearance is the dominant problem — this is '
      + 'offered as help, not as dismissal.',
    ],
    recovery:
      'One to several days in hospital. Marked swelling for two to three weeks. Avoid strenuous '
      + 'activity for a month. Judge the result at six to twelve months, not before.',
  },
};
