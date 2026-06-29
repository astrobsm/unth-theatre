/**
 * Smart Input Components Index
 *
 * Exports the SmartTextInput component only. The OCR (TensorFlow.js / Tesseract)
 * and Speech utilities are intentionally NOT re-exported here: doing so created a
 * static dependency chain that risked pulling those heavy modules into any bundle
 * importing this barrel. Import them directly from their libs where they are
 * lazy-loaded on demand:
 *   import { initializeTensorFlow } from '@/lib/tensorflow-ocr';
 *   import { createSpeechRecognition } from '@/lib/speech-recognition';
 */

export { SmartTextInput } from './SmartTextInput';
export type { SmartTextInputProps } from './SmartTextInput';
