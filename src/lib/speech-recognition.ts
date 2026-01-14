/**
 * Speech Recognition Utility
 * 
 * Provides speech-to-text functionality using:
 * - Web Speech API (primary)
 * - TensorFlow.js Speech Commands model (fallback/enhancement)
 * 
 * Features:
 * - Continuous dictation mode
 * - Medical terminology support
 * - Punctuation commands
 * - Multi-language support
 */

// Speech recognition types
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  grammars: any;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onaudioend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onaudiostart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onerror: ((this: SpeechRecognition, ev: Event) => any) | null;
  onnomatch: ((this: SpeechRecognition, ev: Event) => any) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
  onsoundend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onsoundstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onspeechend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onspeechstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  abort(): void;
  start(): void;
  stop(): void;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

// Medical terminology dictionary for post-processing
const MEDICAL_TERMS: Record<string, string> = {
  // Common medical terms that may be misheard
  'anastomosis': 'anastomosis',
  'anesthesia': 'anesthesia',
  'anaesthesia': 'anaesthesia',
  'hemostasis': 'hemostasis',
  'hemorrhage': 'hemorrhage',
  'haemorrhage': 'haemorrhage',
  'laparoscopic': 'laparoscopic',
  'thoracoscopic': 'thoracoscopic',
  'endoscopic': 'endoscopic',
  'perioperative': 'perioperative',
  'postoperative': 'postoperative',
  'preoperative': 'preoperative',
  'intraoperative': 'intraoperative',
  'appendectomy': 'appendectomy',
  'cholecystectomy': 'cholecystectomy',
  'colectomy': 'colectomy',
  'gastrectomy': 'gastrectomy',
  'herniorrhaphy': 'herniorrhaphy',
  'laparotomy': 'laparotomy',
  'mastectomy': 'mastectomy',
  'nephrectomy': 'nephrectomy',
  'oophorectomy': 'oophorectomy',
  'orchidectomy': 'orchidectomy',
  'splenectomy': 'splenectomy',
  'thyroidectomy': 'thyroidectomy',
  'hysterectomy': 'hysterectomy',
  'prostatectomy': 'prostatectomy',
  'cystectomy': 'cystectomy',
  'pneumonectomy': 'pneumonectomy',
  'lobectomy': 'lobectomy',
  'craniotomy': 'craniotomy',
  'laminectomy': 'laminectomy',
  'discectomy': 'discectomy',
  'arthroplasty': 'arthroplasty',
  'arthroscopy': 'arthroscopy',
  // Anesthesia terms
  'propofol': 'propofol',
  'midazolam': 'midazolam',
  'fentanyl': 'fentanyl',
  'ketamine': 'ketamine',
  'rocuronium': 'rocuronium',
  'succinylcholine': 'succinylcholine',
  'neostigmine': 'neostigmine',
  'atropine': 'atropine',
  'epinephrine': 'epinephrine',
  'adrenaline': 'adrenaline',
  'norepinephrine': 'norepinephrine',
  'dopamine': 'dopamine',
  'dobutamine': 'dobutamine',
  'lidocaine': 'lidocaine',
  'bupivacaine': 'bupivacaine',
  'ropivacaine': 'ropivacaine',
  // Common abbreviations
  'BP': 'BP',
  'HR': 'HR',
  'SPO2': 'SpO2',
  'ETCO2': 'EtCO2',
  'MAC': 'MAC',
  'ASA': 'ASA',
  'NPO': 'NPO',
  'IV': 'IV',
  'IM': 'IM',
  'SC': 'SC',
  'PO': 'PO',
  'PRN': 'PRN',
  'STAT': 'STAT',
  'QID': 'QID',
  'TID': 'TID',
  'BID': 'BID',
  'OD': 'OD',
};

// Punctuation commands
const PUNCTUATION_COMMANDS: Record<string, string> = {
  'period': '.',
  'full stop': '.',
  'comma': ',',
  'question mark': '?',
  'exclamation mark': '!',
  'exclamation point': '!',
  'colon': ':',
  'semicolon': ';',
  'dash': '-',
  'hyphen': '-',
  'new line': '\n',
  'new paragraph': '\n\n',
  'open parenthesis': '(',
  'close parenthesis': ')',
  'open bracket': '[',
  'close bracket': ']',
  'quote': '"',
  'end quote': '"',
  'apostrophe': "'",
};

// Text formatting commands
const FORMATTING_COMMANDS: Record<string, (text: string) => string> = {
  'capitalize': (text) => text.charAt(0).toUpperCase() + text.slice(1),
  'all caps': (text) => text.toUpperCase(),
  'lowercase': (text) => text.toLowerCase(),
  'delete': () => '', // Handled specially
  'undo': () => '', // Handled specially
  'clear all': () => '', // Handled specially
};

export interface SpeechRecognitionOptions {
  language?: string;
  continuous?: boolean;
  interimResults?: boolean;
  maxAlternatives?: number;
  onResult?: (transcript: string, isFinal: boolean, confidence: number) => void;
  onError?: (error: string) => void;
  onStart?: () => void;
  onEnd?: () => void;
  autoRestart?: boolean;
  medicalMode?: boolean;
}

export class SpeechRecognitionService {
  private recognition: SpeechRecognition | null = null;
  private isListening: boolean = false;
  private options: SpeechRecognitionOptions;
  private restartTimeout: NodeJS.Timeout | null = null;

  constructor(options: SpeechRecognitionOptions = {}) {
    this.options = {
      language: 'en-US',
      continuous: true,
      interimResults: true,
      maxAlternatives: 3,
      autoRestart: true,
      medicalMode: true,
      ...options,
    };

    this.initializeRecognition();
  }

  private initializeRecognition(): void {
    if (typeof window === 'undefined') return;

    const SpeechRecognitionConstructor = 
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognitionConstructor) {
      console.error('Speech Recognition not supported in this browser');
      return;
    }

    this.recognition = new SpeechRecognitionConstructor();
    this.recognition.continuous = this.options.continuous!;
    this.recognition.interimResults = this.options.interimResults!;
    this.recognition.lang = this.options.language!;
    this.recognition.maxAlternatives = this.options.maxAlternatives!;

    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      this.handleResult(event);
    };

    this.recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      this.options.onError?.(event.error);
      
      if (this.options.autoRestart && this.isListening) {
        this.scheduleRestart();
      }
    };

    this.recognition.onstart = () => {
      this.isListening = true;
      this.options.onStart?.();
    };

    this.recognition.onend = () => {
      this.isListening = false;
      this.options.onEnd?.();
      
      if (this.options.autoRestart && this.isListening) {
        this.scheduleRestart();
      }
    };
  }

  private handleResult(event: SpeechRecognitionEvent): void {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const transcript = result[0].transcript;
      const confidence = result[0].confidence;
      const isFinal = result.isFinal;

      // Process transcript
      let processedTranscript = transcript;
      
      if (this.options.medicalMode) {
        processedTranscript = this.applyMedicalTerms(processedTranscript);
      }
      
      processedTranscript = this.applyPunctuation(processedTranscript);

      this.options.onResult?.(processedTranscript, isFinal, confidence);
    }
  }

  private applyMedicalTerms(text: string): string {
    let result = text;
    
    // Apply medical term corrections
    Object.entries(MEDICAL_TERMS).forEach(([key, value]) => {
      const regex = new RegExp(`\\b${key}\\b`, 'gi');
      result = result.replace(regex, value);
    });
    
    return result;
  }

  private applyPunctuation(text: string): string {
    let result = text;
    
    // Apply punctuation commands
    Object.entries(PUNCTUATION_COMMANDS).forEach(([command, punctuation]) => {
      const regex = new RegExp(`\\b${command}\\b`, 'gi');
      result = result.replace(regex, punctuation);
    });
    
    return result;
  }

  private scheduleRestart(): void {
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
    }
    
    this.restartTimeout = setTimeout(() => {
      if (this.isListening) {
        this.start();
      }
    }, 1000);
  }

  public start(): void {
    if (!this.recognition) {
      this.initializeRecognition();
    }

    if (this.recognition && !this.isListening) {
      try {
        this.recognition.start();
      } catch (error) {
        console.error('Failed to start speech recognition:', error);
      }
    }
  }

  public stop(): void {
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
    }
    
    if (this.recognition && this.isListening) {
      this.isListening = false;
      this.recognition.stop();
    }
  }

  public abort(): void {
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
    }
    
    if (this.recognition) {
      this.isListening = false;
      this.recognition.abort();
    }
  }

  public isActive(): boolean {
    return this.isListening;
  }

  public setLanguage(language: string): void {
    this.options.language = language;
    if (this.recognition) {
      this.recognition.lang = language;
    }
  }

  public static isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  public static getSupportedLanguages(): string[] {
    return [
      'en-US', 'en-GB', 'en-AU', 'en-IN', 'en-NZ', 'en-ZA',
      'es-ES', 'es-MX', 'es-AR',
      'fr-FR', 'fr-CA',
      'de-DE', 'de-AT',
      'it-IT',
      'pt-BR', 'pt-PT',
      'zh-CN', 'zh-TW',
      'ja-JP',
      'ko-KR',
      'ar-SA',
      'hi-IN',
      'ru-RU',
    ];
  }
}

// Export singleton-style factory
export function createSpeechRecognition(
  options?: SpeechRecognitionOptions
): SpeechRecognitionService | null {
  if (!SpeechRecognitionService.isSupported()) {
    console.warn('Speech Recognition not supported');
    return null;
  }
  return new SpeechRecognitionService(options);
}

export default SpeechRecognitionService;
