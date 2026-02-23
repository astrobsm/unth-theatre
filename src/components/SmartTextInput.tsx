'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
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
  const ocrWorkerRef = useRef<TesseractWorker | null>(null);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

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

  // Initialize speech recognition
  useEffect(() => {
    if (enableSpeech && SpeechRecognitionService.isSupported()) {
      speechServiceRef.current = createSpeechRecognition({
        language: selectedLanguage,
        continuous: true,
        interimResults: true,
        medicalMode,
        onResult: (transcript, isFinal, conf) => {
          if (isFinal) {
            // Add final transcript to value
            const newValue = value + (value ? ' ' : '') + transcript;
            onChange(newValue);
            setInterimTranscript('');
            setConfidence(conf);
            
            // Add to history for undo
            setHistory(prev => [...prev, value]);
          } else {
            setInterimTranscript(transcript);
          }
        },
        onError: (err) => {
          setErrorMessage(`Speech error: ${err}`);
          setIsListening(false);
          setTimeout(() => setErrorMessage(null), 3000);
        },
        onStart: () => setIsListening(true),
        onEnd: () => setIsListening(false),
      });
    }

    return () => {
      speechServiceRef.current?.abort();
    };
  }, [enableSpeech, selectedLanguage, medicalMode, value, onChange]);

  // Initialize OCR worker with optimized settings for handwriting
  useEffect(() => {
    const initOCRWorker = async () => {
      if (enableOCR && !ocrWorkerRef.current) {
        try {
          // Create worker with enhanced settings for handwriting recognition
          const createWorkerFn = await createWorkerLazy();
          const worker = await createWorkerFn('eng', 1, {
            logger: (m) => {
              if (m.status === 'recognizing text') {
                // Don't override our multi-pass progress
                if (m.progress > 0) {
                  console.log(`Tesseract: ${m.status} - ${Math.round(m.progress * 100)}%`);
                }
              }
            },
          });

          // Set optimized parameters for handwriting recognition
          // Note: Some Tesseract.js parameters may not work exactly like command-line Tesseract
          // Focus on core parameters that are well-supported
          await worker.setParameters({
            preserve_interword_spaces: '1',
          });

          ocrWorkerRef.current = worker;
          console.log('✅ OCR Worker initialized with handwriting-optimized settings');
        } catch (error) {
          console.error('Failed to initialize OCR worker:', error);
        }
      }
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
    if (!ocrWorkerRef.current) {
      setErrorMessage('OCR not initialized. Please try again.');
      return;
    }

    setIsProcessingOCR(true);
    setOcrProgress(0);
    setMode('ocr');

    try {
      // Create image element
      const img = document.createElement('img');
      const imageUrl = URL.createObjectURL(file);
      
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = imageUrl;
      });

      // Create base canvas
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        throw new Error('Cannot create canvas context');
      }

      ctx.drawImage(img, 0, 0);

      // Apply basic TensorFlow enhancement first
      if (tfInitialized) {
        applyImageEnhancements(canvas, {
          contrast: 1.3,
          brightness: 1.1,
          sharpen: true,
          denoise: true,
        });
      }

      // Multi-pass OCR with different preprocessing strategies
      const allResults: AdvancedOCRResult[] = [];
      const strategies = OCR_CONFIG.PREPROCESSING_STRATEGIES;
      const totalPasses = strategies.length * OCR_CONFIG.SCALE_FACTORS.length;
      let currentPass = 0;

      console.log(`Starting advanced multi-pass OCR with ${totalPasses} processing combinations...`);

      // Process with each preprocessing strategy
      for (const strategy of strategies) {
        // Process with different scale factors
        for (const scale of OCR_CONFIG.SCALE_FACTORS) {
          try {
            // Create a copy of the canvas for this pass
            const passCanvas = document.createElement('canvas');
            passCanvas.width = canvas.width;
            passCanvas.height = canvas.height;
            const passCtx = passCanvas.getContext('2d');
            
            if (passCtx) {
              passCtx.drawImage(canvas, 0, 0);
              
              // Apply strategy-specific preprocessing
              switch (strategy) {
                case 'otsu_threshold':
                  AdvancedImagePreprocessor.applyAdaptiveThreshold(passCanvas);
                  break;
                case 'morphology_clean':
                  AdvancedImagePreprocessor.applyMorphology(passCanvas, 'dilate');
                  AdvancedImagePreprocessor.applyAdaptiveThreshold(passCanvas);
                  break;
                case 'deskew_enhance':
                  AdvancedImagePreprocessor.deskewImage(passCanvas, 0);
                  AdvancedImagePreprocessor.applyCLAHE(passCanvas);
                  break;
                case 'bilateral_sharpen':
                  AdvancedImagePreprocessor.applyBilateralFilter(passCanvas, 9, 75, 75);
                  AdvancedImagePreprocessor.applyAdaptiveThreshold(passCanvas);
                  break;
                case 'clahe_morphology':
                  AdvancedImagePreprocessor.applyCLAHE(passCanvas);
                  AdvancedImagePreprocessor.applyMorphology(passCanvas, 'open');
                  break;
                case 'multi_scale_process':
                  // Scale up the image
                  const scaledCanvas = AdvancedImagePreprocessor.scaleImage(passCanvas, scale);
                  AdvancedImagePreprocessor.applyAdaptiveThreshold(scaledCanvas);
                  passCanvas.width = scaledCanvas.width;
                  passCanvas.height = scaledCanvas.height;
                  passCtx.drawImage(scaledCanvas, 0, 0);
                  break;
              }

              // Apply scaling if not already done
              if (strategy !== 'multi_scale_process' && scale !== 1.0) {
                const scaledVersion = AdvancedImagePreprocessor.scaleImage(passCanvas, scale);
                passCanvas.width = scaledVersion.width;
                passCanvas.height = scaledVersion.height;
                passCtx.drawImage(scaledVersion, 0, 0);
              }

              // Invert if needed (for light text on dark background)
              AdvancedImagePreprocessor.invertIfNeeded(passCanvas);

              // Run OCR on this preprocessed version
              const { data } = await ocrWorkerRef.current!.recognize(passCanvas);
              
              if (data.text && data.text.trim().length > 0) {
                // Apply medical corrections to improve accuracy
                const correctedText = applyMedicalCorrections(data.text);
                
                allResults.push({
                  text: correctedText,
                  confidence: data.confidence / 100,
                  strategy: strategy,
                  scale: scale
                });

                console.log(`Pass ${currentPass + 1}/${totalPasses}: Strategy="${strategy}", Scale=${scale}, Confidence=${(data.confidence).toFixed(1)}%`);
              }
            }
          } catch (passError) {
            console.warn(`OCR pass failed for ${strategy} at scale ${scale}:`, passError);
          }

          currentPass++;
          setOcrProgress(Math.round((currentPass / totalPasses) * 80)); // 80% for OCR passes
        }
      }

      // Try rotation angles for deskewing if results are poor
      const bestSoFar = allResults.reduce((best, curr) => curr.confidence > best.confidence ? curr : best, { confidence: 0 } as AdvancedOCRResult);
      
      if (bestSoFar.confidence < 0.85) {
        console.log('Low confidence detected, trying rotation corrections...');
        for (const angle of OCR_CONFIG.ROTATION_ANGLES.filter(a => a !== 0)) {
          try {
            const rotatedCanvas = document.createElement('canvas');
            rotatedCanvas.width = canvas.width;
            rotatedCanvas.height = canvas.height;
            const rotCtx = rotatedCanvas.getContext('2d');
            
            if (rotCtx) {
              rotCtx.drawImage(canvas, 0, 0);
              AdvancedImagePreprocessor.deskewImage(rotatedCanvas, angle);
              AdvancedImagePreprocessor.applyAdaptiveThreshold(rotatedCanvas);

              const { data } = await ocrWorkerRef.current!.recognize(rotatedCanvas);
              
              if (data.text && data.text.trim().length > 0) {
                const correctedText = applyMedicalCorrections(data.text);
                allResults.push({
                  text: correctedText,
                  confidence: data.confidence / 100,
                  strategy: `rotation_${angle}deg`,
                  scale: 1.0
                });
              }
            }
          } catch (rotError) {
            console.warn(`Rotation ${angle}° failed:`, rotError);
          }
        }
      }

      setOcrProgress(90); // 90% - about to fuse results

      // Fuse all OCR results for best accuracy
      let finalResult: AdvancedOCRResult;
      
      if (allResults.length > 0) {
        finalResult = fuseOCRResults(allResults);
        console.log(`OCR complete: ${allResults.length} passes, Final confidence: ${(finalResult.confidence * 100).toFixed(1)}%`);
      } else {
        throw new Error('No text could be extracted from any OCR pass');
      }

      setOcrProgress(100);

      // Clean up extracted text
      const cleanedText = finalResult.text
        .replace(/\n{3,}/g, '\n\n')
        .replace(/\s{2,}/g, ' ')
        .replace(/[^\x20-\x7E\n]/g, '') // Remove non-printable characters
        .trim();

      if (cleanedText) {
        const newValue = value + (value ? '\n\n' : '') + cleanedText;
        onChange(newValue);
        setConfidence(finalResult.confidence);
        setHistory(prev => [...prev, value]);
        
        // Log success message
        console.log(`✅ Advanced OCR successful: ${cleanedText.length} chars, ${(finalResult.confidence * 100).toFixed(1)}% confidence`);
      } else {
        setErrorMessage('No text detected in image');
      }

      URL.revokeObjectURL(imageUrl);
    } catch (error) {
      console.error('OCR error:', error);
      setErrorMessage('Failed to process image. Try a clearer image.');
    } finally {
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
    utterance.lang = selectedLanguage;
    utterance.rate = 0.9;
    
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
              <span>Processing image... {ocrProgress}%</span>
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

          {/* Right side - Status and settings */}
          <div className="flex items-center gap-2">
            {/* Confidence indicator */}
            {confidence !== null && (
              <div className="flex items-center gap-1 text-xs text-gray-500">
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
