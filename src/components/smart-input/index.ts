/**
 * Smart Input Components Index
 * 
 * Export all OCR and Speech-to-Text components for easy import
 */

export { SmartTextInput } from './SmartTextInput';
export type { SmartTextInputProps } from './SmartTextInput';

// Re-export utilities
export { SpeechRecognitionService, createSpeechRecognition } from '@/lib/speech-recognition';
export { 
  initializeTensorFlow, 
  preprocessImage, 
  applyImageEnhancements,
  detectTextRegions,
  cleanupTensors,
  getMemoryStats 
} from '@/lib/tensorflow-ocr';
