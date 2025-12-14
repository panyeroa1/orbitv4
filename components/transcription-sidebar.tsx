"use client";

import { X, Mic, MicOff, Globe } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { googleSpeechService, type Caption } from "@/lib/google-speech";

interface TranscriptionSidebarProps {
  onClose: () => void;
}

const LANGUAGES = [
  { code: 'en-US', name: 'English' },
  { code: 'es-ES', name: 'Spanish' },
  { code: 'fr-FR', name: 'French' },
  { code: 'de-DE', name: 'German' },
  { code: 'zh-CN', name: 'Chinese' },
  { code: 'ja-JP', name: 'Japanese' },
  { code: 'ko-KR', name: 'Korean' },
  { code: 'pt-BR', name: 'Portuguese' },
  { code: 'ar-SA', name: 'Arabic' },
  { code: 'hi-IN', name: 'Hindi' },
];

export const TranscriptionSidebar = ({ onClose }: TranscriptionSidebarProps) => {
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('en-US');
  const [translateTo, setTranslateTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Subscribe to captions
    const unsubscribe = googleSpeechService.onCaption((caption) => {
      setCaptions((prev) => [...prev, caption]);
    });

    return () => {
      unsubscribe();
      if (googleSpeechService.isActive()) {
        googleSpeechService.stopTranscription();
      }
    };
  }, []);

  // Auto-scroll to bottom when new captions arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [captions]);

  const handleStartStop = async () => {
    if (isRecording) {
      googleSpeechService.stopTranscription();
      setIsRecording(false);
    } else {
      try {
        setError(null);
        await googleSpeechService.startTranscription(selectedLanguage);
        googleSpeechService.setTranslateLanguage(translateTo);
        setIsRecording(true);
      } catch (err) {
        setError(
          'Failed to start transcription. Please check microphone permissions.'
        );
        console.error(err);
      }
    }
  };

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLang = e.target.value;
    setSelectedLanguage(newLang);

    if (isRecording) {
      // Restart with new language
      googleSpeechService.stopTranscription();
      setTimeout(async () => {
        await googleSpeechService.startTranscription(newLang);
        googleSpeechService.setTranslateLanguage(translateTo);
      }, 100);
    }
  };

  const handleTranslateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newTranslate = e.target.value || null;
    setTranslateTo(newTranslate);
    googleSpeechService.setTranslateLanguage(newTranslate);
  };

  return (
    <div className="ml-2 flex h-[calc(100vh_-_86px)] w-80 flex-col rounded-lg border border-dark-1 bg-dark-1 p-4">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Live Transcription</h2>
        <button
          onClick={onClose}
          className="rounded-md p-1 hover:bg-[#4C535B]"
          title="Close transcription"
        >
          <X size={20} className="text-white" />
        </button>
      </div>

      {/* Controls */}
      <div className="mb-4 space-y-3">
        {/* Start/Stop Button */}
        <button
          onClick={handleStartStop}
          className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 font-semibold transition-colors ${
            isRecording
              ? 'bg-red-500 hover:bg-red-600 text-white'
              : 'bg-blue-500 hover:bg-blue-600 text-white'
          }`}
        >
          {isRecording ? (
            <>
              <MicOff size={18} />
              Stop Transcription
            </>
          ) : (
            <>
              <Mic size={18} />
              Start Transcription
            </>
          )}
        </button>

        {/* Language Selector */}
        <div>
          <label className="mb-1 block text-xs text-gray-400">
            Speech Language
          </label>
          <select
            value={selectedLanguage}
            onChange={handleLanguageChange}
            className="w-full rounded-md bg-[#19232D] px-3 py-2 text-sm text-white"
            disabled={isRecording}
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.name}
              </option>
            ))}
          </select>
        </div>

        {/* Auto-Translate Selector */}
        <div>
          <label className="mb-1 flex items-center gap-1 text-xs text-gray-400">
            <Globe size={14} />
            Auto-Translate To
          </label>
          <select
            value={translateTo || ''}
            onChange={handleTranslateChange}
            className="w-full rounded-md bg-[#19232D] px-3 py-2 text-sm text-white"
          >
            <option value="">No translation</option>
            {LANGUAGES.filter((l) => l.code !== selectedLanguage).map(
              (lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.name}
                </option>
              )
            )}
          </select>
        </div>

        {/* Error Message */}
        {error && (
          <div className="rounded-md bg-red-500/10 p-2 text-xs text-red-400">
            {error}
          </div>
        )}

        {/* Status */}
        {isRecording && (
          <div className="flex items-center gap-2 text-xs text-green-400">
            <div className="h-2 w-2 animate-pulse rounded-full bg-green-400" />
            Recording...
          </div>
        )}
      </div>

      {/* Captions List */}
      <div
        ref={scrollRef}
        className="flex-1 space-y-3 overflow-y-auto overflow-x-hidden pr-2"
      >
        {captions.length > 0 ? (
          captions.map((caption, index) => (
            <div
              key={`${caption.timestamp}-${index}`}
              className="rounded-md bg-[#19232D] p-3"
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-semibold text-blue-400">
                  {caption.speaker}
                </span>
                <span className="text-xs text-gray-500">
                  {new Date(caption.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </span>
              </div>
              <p className="text-sm text-white">{caption.text}</p>
              {caption.translatedText && (
                <p className="mt-2 border-t border-gray-700 pt-2 text-sm text-gray-300">
                  <Globe size={12} className="mr-1 inline" />
                  {caption.translatedText}
                </p>
              )}
            </div>
          ))
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-center text-sm text-gray-500">
              {isRecording
                ? 'Listening... Speak to see transcriptions appear here.'
                : 'Click "Start Transcription" to begin capturing speech.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
