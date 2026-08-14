'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { acceptUtterance, stripTrailing } from '@/lib/speech-dedupe';
import { 
  Mic, 
  MicOff, 
  Camera, 
  Upload, 
  X, 
  Loader2, 
  FileText, 
  Image as ImageIcon,
  Wand2,
  Check,
  AlertCircle,
  Volume2,
  VolumeX,
  Settings,
  Trash2,
  RotateCcw
} from 'lucide-react';
// Dynamic import — tesseract.js is ~10 MB; loaded only when user triggers OCR
type TesseractWorker = import('tesseract.js').Worker;
const createWorkerLazy = async () => {
  const { createWorker } = await import('tesseract.js');
  return createWorker;
};
import { SpeechRecognitionService, createSpeechRecognition } from '@/lib/speech-recognition';
import { applyHumanVoice } from '@/lib/humanVoice';
import { applyImageEnhancements, initializeTensorFlow } from '@/lib/tensorflow-ocr';
import { 
  AdvancedImagePreprocessor, 
  applyMedicalCorrections, 
  fuseOCRResults,
  OCR_CONFIG,
  AdvancedOCRResult 
} from '@/lib/advanced-ocr';

export interface SmartTextInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  name?: string;
  rows?: number;
  className?: string;
  required?: boolean;
  disabled?: boolean;
  maxLength?: number;
  /** Enable speech-to-text functionality */
  enableSpeech?: boolean;
  /** Enable OCR functionality */
  enableOCR?: boolean;
  /** Enable text-to-speech for read back */
  enableReadBack?: boolean;
  /** Medical terminology mode for better recognition */
  medicalMode?: boolean;
  /** Language for speech recognition */
  language?: string;
  /** Show character count */
  showCharCount?: boolean;
  /** Auto-save interval in ms (0 to disable) */
  autoSaveInterval?: number;
  /** Callback when auto-saved */
  onAutoSave?: (value: string) => void;
  /** Help text to display below input */
  helpText?: string;
  /** Error message */
  error?: string;
}

type InputMode = 'text' | 'speech' | 'ocr';

export function SmartTextInput({
  value,
  onChange,
  placeholder = 'Enter text or use voice/camera...',
  label,
  name,
  rows = 4,
  className = '',
  required = false,
  disabled = false,
  maxLength,
  enableSpeech = true,
  enableOCR = true,
  enableReadBack = true,
  medicalMode = true,
  language = 'en-US',
  showCharCount = true,
  autoSaveInterval = 0,
  onAutoSave,
  helpText,
  error,
}: SmartTextInputProps) {
  // State
  const [mode, setMode] = useState<InputMode>('text');
  const [isListening, setIsListening] = useState(false);
  const [isProcessingOCR, setIsProcessingOCR] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [confidence, setConfidence] = useState<number | null>(null);
  const [ocrProgress, setOcrProgress] = useState(0);
  // What the recogniser is actually doing. "Processing image... 5%" with no stage
  // is indistinguishable from a hang, which is how this was reported.
  const [ocrStage, setOcrStage] = useState<string>('');
  // When the recogniser last reported movement, for the stall watchdog.
  const lastOcrProgressRef = useRef<number>(Date.now());
  const [showSettings, setShowSettings] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState(language);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [tfInitialized, setTfInitialized] = useState(false);
  
  // Refs
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const speechServiceRef = useRef<SpeechRecognitionService | null>(null);
  // Last accepted utterance, for the echo/containment check above.
  const dedupeRef = useRef<{ lastText: string; lastAt: number } | null>(null);
  // The raw text of that utterance, so a replacement can strip exactly what it
  // appended rather than guessing at the end of the field.
  const lastAppendedRef = useRef<string>('');
  const ocrWorkerRef = useRef<TesseractWorker | null>(null);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Keep refs to the latest value/onChange so the speech service callbacks
  // always see fresh state without re-initialising the service on every keystroke.
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  useEffect(() => { valueRef.current = value; }, [value]);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  // Initialize TensorFlow
  useEffect(() => {
    if (enableOCR && !tfInitialized) {
      initializeTensorFlow().then((success) => {
        setTfInitialized(success);
        if (success) {
          console.log('TensorFlow.js initialized for OCR enhancement');
        }
      });
    }
  }, [enableOCR, tfInitialized]);

  // Initialize speech recognition (only when language/medicalMode/enableSpeech change,
  // NOT on every keystroke — we use refs to read the latest value/onChange instead).
  useEffect(() => {
    if (enableSpeech && SpeechRecognitionService.isSupported()) {
      speechServiceRef.current = createSpeechRecognition({
        language: selectedLanguage,
        continuous: true,
        interimResults: true,
        medicalMode,
        onResult: (transcript, isFinal, conf) => {
          if (isFinal) {
            // Continuous recognition restarts itself every few seconds, and when
            // the new session starts before the old one has finished delivering,
            // BOTH emit the same final phrase — the reported
            // "25 year old woman 25 year old woman 25 year old woman".
            //
            // Deduplicated on the text rather than by chasing each browser's
            // timing: the same phrase inside a short window is one utterance, and
            // a longer version of what was just appended REPLACES it so nothing
            // spoken is lost.
            const decision = acceptUtterance(transcript, dedupeRef.current, Date.now());
            dedupeRef.current = decision.state;
            if (!decision.accept) {
              setInterimTranscript('');
              return;
            }

            const current = valueRef.current;
            const base = decision.replacePrevious
              ? stripTrailing(current, lastAppendedRef.current)
              : current;
            const newValue = base + (base ? ' ' : '') + transcript;
            lastAppendedRef.current = transcript;

            onChangeRef.current(newValue);
            setInterimTranscript('');
            setConfidence(conf);
            setHistory(prev => [...prev, current]);
          } else {
            setInterimTranscript(transcript);
          }
        },
        onError: (err) => {
          setErrorMessage(err.length > 60 ? err : `Speech: ${err}`);
          setIsListening(false);
          setTimeout(() => setErrorMessage(null), 4000);
        },
        onStart: () => setIsListening(true),
        onEnd: () => setIsListening(false),
      });
    }

    return () => {
      speechServiceRef.current?.abort();
    };
  }, [enableSpeech, selectedLanguage, medicalMode]);

  /**
   * Build the OCR worker, on demand and with a deadline.
   *
   * Reported: "Processing image... 5%" that never finishes. Tesseract downloads
   * its WASM core and ~10 MB of English training data from a CDN on first use.
   * On a hospital connection that is slow, and behind the captive portal it can
   * be blocked outright — with no timeout anywhere, the promise simply never
   * settled and the bar sat at 5% for ever.
   *
   * Three changes:
   *   - built when the user actually asks for OCR, not on page load, so a page
   *     with a photo button no longer pulls 10 MB from everybody who opens it
   *   - a hard deadline, so a stalled download becomes a sentence the user can
   *     act on instead of an eternal spinner
   *   - the real progress reported, including the download phase, so "5%" means
   *     something rather than being a fixed guess
   */
  /**
   * How long with NO PROGRESS before giving up.
   *
   * Not a total time limit. The first use downloads the recogniser — several
   * megabytes — and on a theatre connection that legitimately takes minutes. A
   * total deadline killed work that was moving perfectly well and then blamed the
   * network, which is precisely what was reported: "Reading the image… 11%"
   * beside "could not be downloaded".
   *
   * A stall timer instead: as long as the percentage keeps changing, it waits.
   */
  const OCR_STALL_TIMEOUT_MS = 60_000;

  const getOcrWorker = useCallback(async (): Promise<TesseractWorker> => {
    if (ocrWorkerRef.current) return ocrWorkerRef.current;

    const build = (async () => {
      const createWorkerFn = await createWorkerLazy();
      const worker = await createWorkerFn('eng', 1, {
        // Served by THIS app, not a public CDN. tesseract.js otherwise fetches
        // its core and language data from tessdata.projectnaptha.com on first
        // use — slow on a hospital connection, blocked behind the captive
        // portal, and impossible offline. These files are placed in
        // public/tesseract at build time by
        // scripts/maintenance/fetch-tesseract-assets.js.
        //
        // Relative paths, so this works identically on unth-theatre.link whether
        // that resolves to Vercel or to the theatre server.
        workerPath: '/tesseract/worker.min.js',
        corePath: '/tesseract',
        langPath: '/tesseract',
        // The files are already gzipped; without this the loader appends its own
        // .gz and asks for eng.traineddata.gz.gz.
        gzip: true,
        logger: (m) => {
          // The DOWNLOAD is the slow part, so it is shown. Previously only
          // "recognizing text" was reported, which is why the bar appeared stuck
          // before recognition had even begun.
          if (m.status && typeof m.progress === 'number') {
            // Any movement at all resets the stall timer.
            lastOcrProgressRef.current = Date.now();
            const pct = Math.round(m.progress * 100);
            if (m.status.includes('loading') || m.status.includes('download')) {
              setOcrProgress(Math.min(40, pct));
              // Says it happens ONCE. Several megabytes on a theatre connection
              // is a long wait, and a bar creeping up with no explanation reads
              // as a fault rather than a one-time setup.
              setOcrStage('Setting up text reading (one time only)…');
            } else if (m.status === 'recognizing text') {
              setOcrProgress(40 + Math.round(pct * 0.6));
              setOcrStage('Reading the image…');
            }
          }
        },
      });
      await worker.setParameters({
        preserve_interword_spaces: '1',
        // A photograph carries no DPI, so tesseract guesses from pixel
        // dimensions — and its guess is what produced the one-pixel-wide
        // "lines" it then refused to recognise. Stating 300 removes the guess.
        user_defined_dpi: '300',
      });
      return worker;
    })();

    // Watchdog: gives up only when nothing has moved for a minute. Every progress
    // report pushes the deadline out, so a slow download finishes rather than
    // being killed at an arbitrary moment.
    const worker = await Promise.race([
      build,
      new Promise<never>((_, reject) => {
        const tick = setInterval(() => {
          if (Date.now() - lastOcrProgressRef.current > OCR_STALL_TIMEOUT_MS) {
            clearInterval(tick);
            reject(new Error(
              'The recogniser stopped downloading. It needs internet the first time it is used — try again on a better connection, or type the notes instead.'
            ));
          }
        }, 5_000);
        // Stops the interval once the build settles either way, so a finished
        // download does not leave a timer running for the life of the page.
        void build.finally(() => clearInterval(tick)).catch(() => {});
      }),
    ]);

    ocrWorkerRef.current = worker;
    return worker;
  }, []);

  // Kept only to tear the worker down; it is no longer created on mount.
  useEffect(() => {
    const initOCRWorker = async () => {
      // Deliberately empty: see getOcrWorker. Building a 10 MB worker for every
      // page that merely OFFERS a photo button is what made this feel broken.
      return;
    };

    initOCRWorker();

    return () => {
      ocrWorkerRef.current?.terminate();
    };
  }, [enableOCR]);

  // Auto-save functionality
  useEffect(() => {
    if (autoSaveInterval > 0 && onAutoSave) {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }

      autoSaveTimerRef.current = setTimeout(() => {
        onAutoSave(value);
      }, autoSaveInterval);

      return () => {
        if (autoSaveTimerRef.current) {
          clearTimeout(autoSaveTimerRef.current);
        }
      };
    }
  }, [value, autoSaveInterval, onAutoSave]);

  // Toggle speech recognition
  const toggleSpeech = useCallback(() => {
    if (!speechServiceRef.current) {
      setErrorMessage('Speech recognition not available');
      return;
    }

    if (isListening) {
      speechServiceRef.current.stop();
      setMode('text');
    } else {
      speechServiceRef.current.start();
      setMode('speech');
    }
  }, [isListening]);

  // Advanced Multi-Pass OCR for 99% confidence on poor handwriting
  const processImageForOCR = async (file: File | Blob) => {
    // No "is it initialised" guard. The worker is now built ON DEMAND, so this
    // check was refusing the very first use — the one time it is guaranteed not
    // to exist yet. That was my own regression from making it lazy, and it is
    // exactly the kind of guard that outlives the assumption behind it.
    //
    // getOcrWorker() builds it, reuses it afterwards, and fails with a sentence
    // the user can act on if the download stalls.
    setIsProcessingOCR(true);
    setOcrProgress(0);
    setOcrStage('Reading…');
    lastOcrProgressRef.current = Date.now();
    setMode('ocr');

    // ── Server first ────────────────────────────────────────────────────────
    // The phone uploads a couple of hundred kilobytes; the server holds the
    // recogniser in memory and does the work. That removes the 22 MB per-device
    // download that made this fail three times, and it works on a handset that
    // could never have run the recogniser itself.
    //
    // The browser path below remains as a fallback for a phone that is offline
    // with the recogniser already cached — the one case where the server cannot
    // help and the device can.
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Could not read the photograph.'));
        reader.readAsDataURL(file);
      });

      setOcrProgress(35);
      const res = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl }),
      });

      if (res.ok) {
        const body = await res.json();
        setOcrProgress(100);
        if (body.text) {
          const current = valueRef.current;
          onChangeRef.current(current + (current ? '\n' : '') + body.text);
          if (typeof body.confidence === 'number') setConfidence(body.confidence / 100);
        } else {
          setErrorMessage(body.message ?? 'No text could be made out.');
        }
        setIsProcessingOCR(false);
        setOcrStage('');
        return;
      }

      // A 4xx is a real answer about this image — too large, not an image — so
      // it is shown rather than silently retried in the browser, which would
      // fail the same way after a long wait.
      if (res.status >= 400 && res.status < 500) {
        const body = await res.json().catch(() => ({}));
        setErrorMessage(body.error ?? 'The server could not read that image.');
        setIsProcessingOCR(false);
        setOcrStage('');
        return;
      }
      console.warn('[OCR] server unavailable, falling back to the browser');
    } catch (serverErr) {
      // Offline, or the server is unreachable. Fall through to the browser.
      console.warn('[OCR] could not reach the server, falling back', serverErr);
    }

    setOcrStage('Reading on this device…');
    lastOcrProgressRef.current = Date.now();

    try {
      await getOcrWorker();
      // Create image element
      const img = document.createElement('img');
      const imageUrl = URL.createObjectURL(file);
      
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = imageUrl;
      });

      // ── One clean pass ──────────────────────────────────────────────────
      // The multi-pass pipeline below was chasing "99% confidence" by trying a
      // dozen combinations of thresholds and scale factors. In practice it turned
      // a photograph into noise: the console showed Tesseract segmenting
      // 1-pixel-wide slivers as text lines — "Image too small to scale!!
      // (1x36 vs min width of 3)" — and then failing to read any of them.
      //
      // A photograph of a page needs very little help. Greyscale, a modest
      // upscale when the image is small, and nothing else. Aggressive
      // thresholding destroys the strokes it is supposed to sharpen, and on
      // handwriting it is worse than doing nothing.
      //
      // naturalWidth/naturalHeight, not width/height: the latter are the
      // RENDERED size and can be 0 or 1 for an image that was never laid out,
      // which is one way a degenerate canvas gets built.
      const srcW = img.naturalWidth || img.width;
      const srcH = img.naturalHeight || img.height;

      if (!srcW || !srcH || srcW < 8 || srcH < 8) {
        throw new Error('That photograph is too small to read.');
      }

      // Tesseract wants roughly 300 dpi. A phone photo of a page is usually
      // plenty; a small crop is not, so it is scaled up rather than left tiny.
      // Capped, because a very large canvas is slow and adds nothing.
      const targetMin = 1000;
      const upscale = Math.min(3, Math.max(1, targetMin / Math.min(srcW, srcH)));
      const outW = Math.round(srcW * upscale);
      const outH = Math.round(srcH * upscale);

      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      // willReadFrequently: this canvas is read back pixel by pixel below, and
      // without the hint the browser keeps it on the GPU and every read stalls.
      // The console was full of exactly that warning.
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      if (!ctx) {
        throw new Error('Cannot create canvas context');
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, outW, outH);

      // Greyscale only. Luminance weights, so coloured ink and highlighter do
      // not vanish the way a plain average makes them.
      const px = ctx.getImageData(0, 0, outW, outH);
      const d = px.data;
      for (let i = 0; i < d.length; i += 4) {
        const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        d[i] = d[i + 1] = d[i + 2] = g;
      }
      ctx.putImageData(px, 0, 0);

      // Straight to the recogniser. No thresholding, no rotation sweep, no
      // scale ladder — the pipeline that produced the 1-pixel lines.
      const worker = await getOcrWorker();
      const { data } = await worker.recognize(canvas);
      const singlePassText = (data.text ?? '').trim();

      setOcrProgress(100);
      if (singlePassText) {
        const current = valueRef.current;
        onChangeRef.current(current + (current ? '\n' : '') + singlePassText);
        setConfidence((data.confidence ?? 0) / 100);
      } else {
        setErrorMessage('No text could be made out. Try a straighter, better-lit photograph.');
      }
      setIsProcessingOCR(false);
      setOcrStage('');
      return;

    } catch (error) {
      console.error('OCR error:', error);
      // The recogniser's own message when there is one — "could not be
      // downloaded, this needs internet the first time" is actionable, whereas
      // "try a clearer image" sends somebody to photograph the page again for a
      // fault that has nothing to do with the photograph.
      // The recogniser's own message, whenever there is one. The previous
      // version only used it when longer than 20 characters, so a short but
      // precise failure — a 404 for a missing core file, say — was replaced by
      // "try a clearer photograph" and sent somebody to re-photograph a page for
      // a fault that had nothing to do with the photograph. That is exactly how
      // the missing .wasm binaries stayed hidden.
      const detail = error instanceof Error ? error.message.trim() : '';
      setErrorMessage(
        detail
          ? `Could not read that image: ${detail}`
          : 'Could not read that image. Try a clearer photograph, or type the notes instead.'
      );
      // Always logged in full, so a fault that is awkward to reproduce on a
      // phone can still be diagnosed from the console.
      console.error('[OCR] failed', error);
    } finally {
      setOcrStage('');
      setIsProcessingOCR(false);
      setOcrProgress(0);
      setMode('text');
    }
  };

  // Handle file upload
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      processImageForOCR(file);
    }
    // Reset input so same file can be selected again
    event.target.value = '';
  };

  // Handle camera capture
  const handleCameraCapture = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      processImageForOCR(file);
    }
    event.target.value = '';
  };

  // Text-to-speech read back
  const speakText = useCallback(() => {
    if (!enableReadBack || !value) return;

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(value);
    if (/^en/i.test(selectedLanguage)) {
      // English read-back gets the device's most humanoid voice, same as every
      // other spoken surface. Other languages keep the engine's own default —
      // an English voice reading e.g. Igbo would be worse, not better.
      applyHumanVoice(utterance, { lang: selectedLanguage, rate: 0.9 });
    } else {
      utterance.lang = selectedLanguage;
      utterance.rate = 0.9;
    }


    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }, [enableReadBack, value, selectedLanguage, isSpeaking]);

  // Undo last change
  const handleUndo = useCallback(() => {
    if (history.length > 0) {
      const previousValue = history[history.length - 1];
      setHistory(prev => prev.slice(0, -1));
      onChange(previousValue);
    }
  }, [history, onChange]);

  // Clear all text
  const handleClear = useCallback(() => {
    if (value) {
      setHistory(prev => [...prev, value]);
      onChange('');
    }
  }, [value, onChange]);

  // Language options
  const languageOptions = [
    { code: 'en-US', label: 'English (US)' },
    { code: 'en-GB', label: 'English (UK)' },
    { code: 'fr-FR', label: 'French' },
    { code: 'de-DE', label: 'German' },
    { code: 'es-ES', label: 'Spanish' },
    { code: 'pt-BR', label: 'Portuguese' },
    { code: 'it-IT', label: 'Italian' },
    { code: 'ar-SA', label: 'Arabic' },
    { code: 'zh-CN', label: 'Chinese' },
    { code: 'hi-IN', label: 'Hindi' },
  ];

  const speechSupported = SpeechRecognitionService.isSupported();

  return (
    <div className={`smart-text-input ${className}`}>
      {/* Label */}
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      {/* Main input container */}
      <div className={`relative border rounded-lg ${
        error ? 'border-red-300' : isListening ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-300'
      } ${disabled ? 'bg-gray-100' : 'bg-white'}`}>
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          required={required}
          disabled={disabled || isListening}
          maxLength={maxLength}
          className={`w-full px-4 py-3 rounded-t-lg resize-none focus:outline-none ${
            disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-transparent'
          }`}
        />

        {/* Interim transcript display */}
        {isListening && interimTranscript && (
          <div className="px-4 py-2 bg-blue-50 border-t border-blue-100 text-blue-700 text-sm italic">
            {interimTranscript}...
          </div>
        )}

        {/* OCR progress bar */}
        {isProcessingOCR && (
          <div className="px-4 py-2 bg-purple-50 border-t border-purple-100">
            <div className="flex items-center gap-2 text-purple-700 text-sm mb-1">
              <Loader2 className="w-4 h-4 animate-spin" />
              {/* Names the stage. A bare percentage that stops moving is
                  indistinguishable from a hang; "Loading recogniser" tells the
                  user it is a download and that it only happens once. */}
              <span>{ocrStage || 'Processing image'}… {ocrProgress}%</span>
            </div>
            <div className="w-full bg-purple-200 rounded-full h-1.5">
              <div 
                className="bg-purple-600 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${ocrProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-t rounded-b-lg">
          {/* Left side - Input mode buttons */}
          <div className="flex items-center gap-1">
            {/* Speech button */}
            {enableSpeech && (
              <button
                type="button"
                onClick={toggleSpeech}
                disabled={disabled || !speechSupported || isProcessingOCR}
                className={`p-2 rounded-lg transition-all ${
                  isListening
                    ? 'bg-red-100 text-red-600 hover:bg-red-200'
                    : 'hover:bg-gray-200 text-gray-600'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                title={isListening ? 'Stop dictation' : 'Start dictation'}
              >
                {isListening ? (
                  <MicOff className="w-5 h-5" />
                ) : (
                  <Mic className="w-5 h-5" />
                )}
              </button>
            )}

            {/* Camera button */}
            {enableOCR && (
              <>
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={disabled || isListening || isProcessingOCR}
                  className="p-2 rounded-lg hover:bg-gray-200 text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  title="Capture from camera"
                >
                  <Camera className="w-5 h-5" />
                </button>
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleCameraCapture}
                  className="hidden"
                />
              </>
            )}

            {/* Upload button */}
            {enableOCR && (
              <>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={disabled || isListening || isProcessingOCR}
                  className="p-2 rounded-lg hover:bg-gray-200 text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  title="Upload image for OCR"
                >
                  <Upload className="w-5 h-5" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </>
            )}

            {/* Divider */}
            {(enableSpeech || enableOCR) && (
              <div className="w-px h-6 bg-gray-300 mx-1" />
            )}

            {/* Read back button */}
            {enableReadBack && value && (
              <button
                type="button"
                onClick={speakText}
                disabled={disabled}
                className={`p-2 rounded-lg transition-all ${
                  isSpeaking
                    ? 'bg-green-100 text-green-600 hover:bg-green-200'
                    : 'hover:bg-gray-200 text-gray-600'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                title={isSpeaking ? 'Stop reading' : 'Read text aloud'}
              >
                {isSpeaking ? (
                  <VolumeX className="w-5 h-5" />
                ) : (
                  <Volume2 className="w-5 h-5" />
                )}
              </button>
            )}

            {/* Undo button */}
            {history.length > 0 && (
              <button
                type="button"
                onClick={handleUndo}
                disabled={disabled}
                className="p-2 rounded-lg hover:bg-gray-200 text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                title="Undo"
              >
                <RotateCcw className="w-5 h-5" />
              </button>
            )}

            {/* Clear button */}
            {value && (
              <button
                type="button"
                onClick={handleClear}
                disabled={disabled}
                className="p-2 rounded-lg hover:bg-red-100 text-gray-600 hover:text-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                title="Clear all"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Right side - Status and settings.
              min-w-0 lets this shrink instead of forcing the row wider than the
              phone. Without it the toolbar overflowed and "0% confidence" wrapped
              to one letter per line down the edge of the field, which is what the
              reported screenshot shows. */}
          <div className="flex min-w-0 items-center gap-2">
            {/* Confidence indicator.
                Hidden below sm: on a phone the toolbar has no room for it, and a
                recogniser's self-reported confidence is not what a clinician is
                looking at while dictating. */}
            {confidence !== null && confidence > 0 && (
              <div className="hidden shrink-0 items-center gap-1 whitespace-nowrap text-xs text-gray-500 sm:flex">
                <span>{Math.round(confidence * 100)}% confidence</span>
              </div>
            )}

            {/* Character count */}
            {showCharCount && (
              <span className={`text-xs ${
                maxLength && value.length >= maxLength ? 'text-red-500' : 'text-gray-500'
              }`}>
                {value.length}{maxLength ? `/${maxLength}` : ''}
              </span>
            )}

            {/* Settings button */}
            <button
              type="button"
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 rounded-lg hover:bg-gray-200 text-gray-600 transition-all"
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Settings panel */}
        {showSettings && (
          <div className="absolute right-0 mt-1 w-64 bg-white border rounded-lg shadow-lg z-10 p-4">
            <h4 className="text-sm font-medium text-gray-900 mb-3">Input Settings</h4>
            
            <div className="space-y-3">
              {/* Language selection */}
              <div>
                <label className="block text-xs text-gray-600 mb-1">Language</label>
                <select
                  value={selectedLanguage}
                  onChange={(e) => {
                    setSelectedLanguage(e.target.value);
                    speechServiceRef.current?.setLanguage(e.target.value);
                  }}
                  className="w-full text-sm border rounded px-2 py-1"
                >
                  {languageOptions.map(({ code, label }) => (
                    <option key={code} value={code}>{label}</option>
                  ))}
                </select>
              </div>

              {/* Status indicators */}
              <div className="pt-2 border-t">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-600">Speech Recognition</span>
                  {speechSupported ? (
                    <span className="text-green-600 flex items-center gap-1">
                      <Check className="w-3 h-3" /> Available
                    </span>
                  ) : (
                    <span className="text-red-600 flex items-center gap-1">
                      <X className="w-3 h-3" /> Not supported
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between text-xs mt-1">
                  <span className="text-gray-600">OCR (Tesseract)</span>
                  <span className="text-green-600 flex items-center gap-1">
                    <Check className="w-3 h-3" /> Ready
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs mt-1">
                  <span className="text-gray-600">TensorFlow.js</span>
                  {tfInitialized ? (
                    <span className="text-green-600 flex items-center gap-1">
                      <Check className="w-3 h-3" /> Active
                    </span>
                  ) : (
                    <span className="text-yellow-600 flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" /> Loading
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Help text */}
      {helpText && !error && (
        <p className="mt-1 text-sm text-gray-500">{helpText}</p>
      )}

      {/* Error message */}
      {(error || errorMessage) && (
        <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
          <AlertCircle className="w-4 h-4" />
          {error || errorMessage}
        </p>
      )}

      {/* Listening indicator */}
      {isListening && (
        <div className="mt-2 flex items-center gap-2 text-sm text-blue-600 animate-pulse">
          <div className="flex gap-0.5">
            <span className="w-1 h-4 bg-blue-500 rounded animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1 h-4 bg-blue-500 rounded animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1 h-4 bg-blue-500 rounded animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
          <span>Listening... Speak now</span>
        </div>
      )}

      {/* Voice commands help */}
      {isListening && (
        <div className="mt-2 p-2 bg-blue-50 rounded text-xs text-blue-700">
          <strong>Voice commands:</strong> Say &quot;period&quot;, &quot;comma&quot;, &quot;new line&quot;, &quot;new paragraph&quot; for punctuation
        </div>
      )}
    </div>
  );
}

export default SmartTextInput;
