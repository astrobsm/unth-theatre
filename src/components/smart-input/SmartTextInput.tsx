'use client';

import React, { useState, useRef, useCallback } from 'react';

export interface SmartTextInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  multiline?: boolean;
  rows?: number;
  className?: string;
  enableVoice?: boolean;
  enableOCR?: boolean;
  onVoiceStart?: () => void;
  onVoiceEnd?: () => void;
  onOCRStart?: () => void;
  onOCREnd?: () => void;
}

/**
 * SmartTextInput Component
 * 
 * A text input component with optional voice and OCR capabilities.
 * Provides a standard input with accessibility features.
 */
export function SmartTextInput({
  value,
  onChange,
  placeholder = '',
  label,
  disabled = false,
  multiline = false,
  rows = 3,
  className = '',
  enableVoice = false,
  enableOCR = false,
  onVoiceStart,
  onVoiceEnd,
  onOCRStart,
  onOCREnd,
}: SmartTextInputProps) {
  const [isListening, setIsListening] = useState(false);
  const [isProcessingOCR, setIsProcessingOCR] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleVoiceToggle = useCallback(() => {
    if (isListening) {
      setIsListening(false);
      onVoiceEnd?.();
    } else {
      setIsListening(true);
      onVoiceStart?.();
      // Voice recognition would be implemented here
      // For now, just simulate stopping after 3 seconds
      setTimeout(() => {
        setIsListening(false);
        onVoiceEnd?.();
      }, 3000);
    }
  }, [isListening, onVoiceStart, onVoiceEnd]);

  const handleOCRClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingOCR(true);
    onOCRStart?.();

    try {
      // OCR processing would be implemented here
      // For now, just simulate processing
      await new Promise(resolve => setTimeout(resolve, 1000));
      // Simulated OCR result
      onChange(value + ' [OCR text would appear here]');
    } catch (error) {
      console.error('OCR processing error:', error);
    } finally {
      setIsProcessingOCR(false);
      onOCREnd?.();
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [value, onChange, onOCRStart, onOCREnd]);

  const baseInputClasses = `
    w-full px-4 py-2 
    border border-gray-300 rounded-lg 
    focus:ring-2 focus:ring-blue-500 focus:border-blue-500 
    disabled:bg-gray-100 disabled:cursor-not-allowed
    transition-colors duration-200
  `;

  const InputComponent = multiline ? 'textarea' : 'input';

  return (
    <div className={`smart-text-input ${className}`}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
        </label>
      )}
      
      <div className="relative flex items-center gap-2">
        {multiline ? (
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            disabled={disabled || isProcessingOCR}
            rows={rows}
            className={baseInputClasses}
          />
        ) : (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            disabled={disabled || isProcessingOCR}
            className={baseInputClasses}
          />
        )}

        {/* Voice Button */}
        {enableVoice && (
          <button
            type="button"
            onClick={handleVoiceToggle}
            disabled={disabled || isProcessingOCR}
            className={`
              p-2 rounded-lg transition-colors duration-200
              ${isListening 
                ? 'bg-red-500 text-white animate-pulse' 
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }
              disabled:opacity-50 disabled:cursor-not-allowed
            `}
            title={isListening ? 'Stop listening' : 'Start voice input'}
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              className="h-5 w-5" 
              viewBox="0 0 20 20" 
              fill="currentColor"
            >
              <path 
                fillRule="evenodd" 
                d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" 
                clipRule="evenodd" 
              />
            </svg>
          </button>
        )}

        {/* OCR Button */}
        {enableOCR && (
          <>
            <button
              type="button"
              onClick={handleOCRClick}
              disabled={disabled || isProcessingOCR || isListening}
              className={`
                p-2 rounded-lg transition-colors duration-200
                ${isProcessingOCR 
                  ? 'bg-blue-500 text-white animate-pulse' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }
                disabled:opacity-50 disabled:cursor-not-allowed
              `}
              title="Scan image for text (OCR)"
            >
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                className="h-5 w-5" 
                viewBox="0 0 20 20" 
                fill="currentColor"
              >
                <path 
                  fillRule="evenodd" 
                  d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" 
                  clipRule="evenodd" 
                />
              </svg>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
          </>
        )}
      </div>

      {/* Status indicators */}
      {isListening && (
        <p className="mt-1 text-sm text-red-600 animate-pulse">
          🎤 Listening...
        </p>
      )}
      {isProcessingOCR && (
        <p className="mt-1 text-sm text-blue-600 animate-pulse">
          📷 Processing image...
        </p>
      )}
    </div>
  );
}

export default SmartTextInput;
