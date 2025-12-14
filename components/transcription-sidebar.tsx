"use client";

import { X, Mic, MicOff, Globe } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { deepgramService } from "@/lib/deepgram-service";

interface TranscriptionSidebarProps {
  onClose: () => void;
}

export const TranscriptionSidebar = ({ onClose }: TranscriptionSidebarProps) => {
  const [captions, setCaptions] = useState<{ text: string; speaker: string; timestamp: number }[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Subscribe to captions
    const unsubscribe = deepgramService.onCaption((caption) => {
      // Only add final captions to avoid flickering, or handle interim logic if desired
      // For this simple UI, we'll append final results
      if (caption.isFinal) {
        setCaptions((prev) => [...prev, caption]);
      }
    });

    return () => {
      unsubscribe();
      if (deepgramService.isActive()) {
        deepgramService.stop();
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
      deepgramService.stop();
      setIsRecording(false);
    } else {
      try {
        setError(null);
        await deepgramService.start();
        setIsRecording(true);
      } catch (err) {
        setError(
          'Failed to start Deepgram transcription. Check API key and microphone.'
        );
        console.error(err);
      }
    }
  };

// Removed unused handlers

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
              : 'bg-green-600 hover:bg-green-700 text-white'
          }`}
        >
          {isRecording ? (
            <>
              <MicOff size={18} />
              Stop Deepgram
            </>
          ) : (
            <>
              <Mic size={18} />
              Start Deepgram (Nova-3)
            </>
          )}
        </button>

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
            Listening to microphone...
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
            </div>
          ))
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-center text-sm text-gray-500">
              {isRecording
                ? 'Listening... Speak to see transcriptions appear here.'
                : 'Click "Start Deepgram" to begin real-time transcription.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
