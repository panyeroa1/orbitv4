"use client";

import { useCallStateHooks } from "@stream-io/video-react-sdk";
import { X } from "lucide-react";
import { useEffect, useRef } from "react";

interface TranscriptionSidebarProps {
  onClose: () => void;
}

export const TranscriptionSidebar = ({ onClose }: TranscriptionSidebarProps) => {
  const { useCallClosedCaptions } = useCallStateHooks();
  const captions = useCallClosedCaptions();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Debug logging
  useEffect(() => {
    console.log('🎤 Captions data:', captions);
    console.log('🎤 Captions length:', captions?.length || 0);
    if (captions && captions.length > 0) {
      console.log('🎤 Latest caption:', captions[captions.length - 1]);
    }
  }, [captions]);

  // Auto-scroll to bottom when new captions arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [captions]);

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

      {/* Captions List */}
      <div
        ref={scrollRef}
        className="flex-1 space-y-3 overflow-y-auto overflow-x-hidden pr-2"
      >
        {captions && captions.length > 0 ? (
          captions.map((caption, index) => (
            <div
              key={`${caption.start_time}-${index}`}
              className="rounded-md bg-[#19232D] p-3"
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-semibold text-blue-400">
                  {caption.user?.name || caption.user?.id || "Unknown"}
                </span>
                <span className="text-xs text-gray-500">
                  {new Date(caption.start_time).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>
              </div>
              <p className="text-sm text-white">{caption.text}</p>
            </div>
          ))
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-center text-sm text-gray-500">
              {captions
                ? "No captions yet. Start speaking to see transcriptions appear here."
                : "Captions not available. Make sure closed captions are enabled in your Stream Dashboard."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
