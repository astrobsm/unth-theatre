# Voice Dictation & OCR Implementation Guide

## Overview

The UNTH Theatre ORM application now includes advanced **Voice Dictation** and **Optical Character Recognition (OCR)** capabilities powered by:
- **Web Speech API** - Native browser speech-to-text
- **TensorFlow.js** - Machine learning image preprocessing
- **Tesseract.js** - OCR text extraction

## Features

### 🎤 Speech-to-Text (Voice Dictation)

1. **Medical Terminology Mode**
   - Automatically recognizes and corrects common medical terms
   - Supports surgical procedure names (appendectomy, cholecystectomy, etc.)
   - Recognizes anesthesia drugs (propofol, fentanyl, rocuronium, etc.)
   - Handles medical abbreviations (BP, HR, SpO2, ASA, NPO, etc.)

2. **Voice Commands for Punctuation**
   - Say "period" or "full stop" for `.`
   - Say "comma" for `,`
   - Say "question mark" for `?`
   - Say "new line" for line break
   - Say "new paragraph" for double line break

3. **Multi-Language Support**
   - English (US, UK, AU, IN)
   - French, German, Spanish, Portuguese
   - Arabic, Chinese, Hindi, and more

### 📷 OCR (Optical Character Recognition)

1. **Camera Capture**
   - Photograph handwritten notes, prescriptions, lab results
   - Real-time image processing with TensorFlow.js

2. **Image Upload**
   - Upload scanned documents
   - Supports JPG, PNG, PDF formats

3. **Image Enhancement** (TensorFlow.js)
   - Automatic contrast adjustment
   - Brightness optimization
   - Noise reduction (median filter)
   - Edge sharpening (unsharp mask)
   - Optional binarization for low-quality images

### 🔊 Text-to-Speech (Read Back)

- Read dictated text aloud for verification
- Adjustable speech rate
- Supports multiple languages

## Components

### SmartTextInput

The main component that replaces standard `<textarea>` elements.

```tsx
import SmartTextInput from '@/components/SmartTextInput';

<SmartTextInput
  label="Post-Operative Notes"
  value={notes}
  onChange={setNotes}
  placeholder="Dictate your notes or photograph written notes..."
  rows={4}
  enableSpeech={true}      // Enable voice dictation
  enableOCR={true}         // Enable camera/upload OCR
  enableReadBack={true}    // Enable text-to-speech
  medicalMode={true}       // Enable medical terminology
  language="en-US"         // Speech recognition language
  showCharCount={true}     // Show character count
/>
```

### Props Reference

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `value` | `string` | - | Current text value |
| `onChange` | `(value: string) => void` | - | Value change handler |
| `placeholder` | `string` | "Enter text..." | Placeholder text |
| `label` | `string` | - | Field label |
| `rows` | `number` | 4 | Number of visible rows |
| `enableSpeech` | `boolean` | true | Enable voice dictation |
| `enableOCR` | `boolean` | true | Enable OCR functionality |
| `enableReadBack` | `boolean` | true | Enable text-to-speech |
| `medicalMode` | `boolean` | true | Medical terminology mode |
| `language` | `string` | "en-US" | Speech recognition language |
| `showCharCount` | `boolean` | true | Show character counter |
| `maxLength` | `number` | - | Maximum character limit |
| `required` | `boolean` | false | Required field |
| `disabled` | `boolean` | false | Disable input |

## Pages Updated

The following pages now support voice dictation and OCR:

### Clinical Documentation
- **Pre-Operative Assessment** (`/dashboard/preop-reviews/new`)
  - Current Medications, Comorbidities, Previous Anesthesia History
  - Lab Results, Anesthetic Plan Details, Special Considerations
  - Risk Factors, Review Notes, Recommendations

- **WHO Surgical Checklist** (`/dashboard/checklists/new`)
  - Sign-In Notes, Time-Out Notes, Sign-Out Notes

- **PACU (Post-Anesthesia Care)** (`/dashboard/pacu/[id]`)
  - Discharge Instructions, Ward Nurse Handover Notes

- **Anesthesia Records** (`/dashboard/surgeries/[id]/anesthesia`)
  - Complication Management (Hypotension, Desaturation, Difficult Airway)
  - Medication Notes

- **Holding Area** (`/dashboard/holding-area/[id]`)
  - Allergy Details, Red Alert Description

- **Mortality Records** (`/dashboard/mortality/new` and `/dashboard/mortality/[id]/audit`)
  - Cause of Death, Contributing Factors, Resuscitation Details
  - Audit Findings, Recommendations, Actions Taken

### Patient Management
- **Patient Registration** (`/dashboard/patients/new`)
  - Comorbidities, Metabolic Status, Other Medications
  - Assessment Notes

- **Surgery Scheduling** (`/dashboard/surgeries/new`)
  - Other Special Needs

- **Patient Transfers** (`/dashboard/transfers/new`)
  - Transfer Notes

- **Surgery Cancellations** (`/dashboard/cancellations/new`)
  - Detailed Notes

### Equipment & Inventory
- **Equipment Checkout** (`/dashboard/equipment-checkout`)
  - Checkout Notes, Return Notes

- **Inventory** (`/dashboard/inventory/new`)
  - Item Description

- **Fault Alerts** (`/dashboard/fault-alerts`)
  - Resolution Notes

- **Alerts** (`/dashboard/alerts`)
  - Resolution Notes

### CSSD (Central Sterile Supply Department)
- **Sterilization Logs** (`/dashboard/cssd/sterilization`)
  - Notes

- **Readiness Reports** (`/dashboard/cssd/readiness`)
  - Issues, Recommended Actions, Notes

### Power House
- **Status Updates** (`/dashboard/power-house/status`)
  - Issues, Notes

### Blood Bank
- **Blood Requests** (`/dashboard/blood-bank`)
  - Status Notes

## Technical Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    SmartTextInput                        │
│                   (React Component)                      │
└─────────────────────────────────────────────────────────┘
          │                    │                    │
          ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Web Speech API  │  │   Tesseract.js   │  │   TensorFlow.js  │
│  (Dictation)     │  │   (OCR Engine)   │  │  (Image Prep)   │
└─────────────────┘  └─────────────────┘  └─────────────────┘
          │                    │                    │
          └────────────────────┼────────────────────┘
                               ▼
                    ┌─────────────────────┐
                    │   speech-recognition.ts   │
                    │   tensorflow-ocr.ts       │
                    │   (Utility Libraries)     │
                    └─────────────────────┘
```

## Browser Support

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| Speech Recognition | ✅ | ❌* | ❌* | ✅ |
| OCR (Tesseract) | ✅ | ✅ | ✅ | ✅ |
| TensorFlow.js | ✅ | ✅ | ✅ | ✅ |
| Text-to-Speech | ✅ | ✅ | ✅ | ✅ |

*Firefox and Safari do not support Web Speech API for speech recognition

## Usage Tips

### For Voice Dictation

1. Click the microphone icon to start dictating
2. Speak clearly and at a moderate pace
3. Use voice commands for punctuation
4. Click the microphone again to stop
5. Use the read-back feature to verify

### For OCR

1. Click the camera icon to capture from device camera
2. Or click the upload icon to upload an image file
3. Position the document clearly in frame
4. Wait for processing (progress shown)
5. Review and edit extracted text as needed

### For Best Results

- Use good lighting when capturing images
- Position documents flat and straight
- Speak medical terms slowly and clearly
- Review dictated text for accuracy
- Use read-back for critical notes

## Troubleshooting

### Speech Recognition Not Working

1. Ensure browser supports Web Speech API (Chrome/Edge recommended)
2. Grant microphone permission when prompted
3. Check that microphone is not muted
4. Try refreshing the page

### OCR Quality Issues

1. Ensure image is well-lit and in focus
2. Avoid shadows and glare
3. Use high-contrast text on light background
4. Rotate image if text is not horizontal
5. Try the image enhancement options

### TensorFlow Not Loading

1. Check browser console for errors
2. Ensure stable internet for first load
3. WebGL required for optimal performance
4. May fall back to CPU (slower but works)

## Dependencies

```json
{
  "@tensorflow/tfjs": "^4.x",
  "tesseract.js": "^5.x"
}
```

## Performance Notes

- TensorFlow.js models load on-demand
- OCR worker initializes in background
- Large images are resized before processing
- Memory is cleaned up after processing
- WebGL backend preferred for speed

## Security Considerations

- All processing happens client-side
- No audio/images sent to external servers
- Microphone access requires user permission
- Camera access requires user permission
- HTTPS required for production
