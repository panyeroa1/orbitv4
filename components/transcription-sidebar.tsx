"use client";

import { X, Mic, MicOff, Globe } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { deepgramService } from "@/lib/deepgram-service";
import { useCallStateHooks } from "@stream-io/video-react-sdk";

interface TranscriptionSidebarProps {
  onClose: () => void;
}

export const TranscriptionSidebar = ({ onClose }: TranscriptionSidebarProps) => {
  const [captions, setCaptions] = useState<{ text: string; speaker: string; timestamp: number }[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Stream SDK Hooks for Screen Share
  const { useScreenShareState } = useCallStateHooks();
  const { mediaStream: screenShareStream, isEnabled: isScreenSharing } = useScreenShareState();

  // State for interim results and devices
  const [interimCaption, setInterimCaption] = useState<{ text: string; speaker: string } | null>(null);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');

  // Fetch devices on mount
  useEffect(() => {
    deepgramService.getAudioDevices().then((devices) => {
      setAudioDevices(devices);
      // Select default device if available
      const defaultDevice = devices.find(d => d.deviceId === 'default') || devices[0];
      if (defaultDevice) setSelectedDeviceId(defaultDevice.deviceId);
    });
  }, []);

  // Handle Screen Share Audio Mixing
  useEffect(() => {
    if (isRecording && isScreenSharing && screenShareStream) {
      // If screen sharing is active and we are recording, add the screen audio
      deepgramService.addScreenShareAudio(screenShareStream);
    } else {
      // Otherwise ensure it's removed
      deepgramService.removeScreenShareAudio();
    }
  }, [isRecording, isScreenSharing, screenShareStream]);

  useEffect(() => {
    // Subscribe to captions
    const unsubscribe = deepgramService.onCaption((caption) => {
      // Only add final captions to avoid flickering
      if (caption.isFinal) {
        setCaptions((prev) => [...prev, {
          text: caption.text,
          speaker: String(caption.speaker),
          timestamp: caption.timestamp
        }]);
        setInterimCaption(null); // Clear interim when final arrives
      } else {
        setInterimCaption({ text: caption.text, speaker: String(caption.speaker) });
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
  }, [captions, interimCaption]); // Scroll on interim updates too

  const handleStartStop = async () => {
    if (isRecording) {
      deepgramService.stop();
      setIsRecording(false);
      setInterimCaption(null);
    } else {
      try {
        setError(null);
        await deepgramService.start(selectedDeviceId);
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
        {/* Device Selector */}
        {!isRecording && audioDevices.length > 0 && (
          <div className="space-y-1">
             <label className="text-xs text-gray-400">Microphone Source</label>
             <select
               aria-label="Select microphone source"
               value={selectedDeviceId}
               onChange={(e) => setSelectedDeviceId(e.target.value)}
               className="w-full rounded-md bg-[#19232D] px-2 py-1.5 text-xs text-white"
             >
               {audioDevices.map((device) => (
                 <option key={device.deviceId} value={device.deviceId}>
                   {device.label || `Microphone ${device.deviceId.slice(0, 5)}...`}
                 </option>
               ))}
             </select>
          </div>
        )}

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
            {isScreenSharing ? 'Listening (Mic + System Audio)...' : 'Listening...'}
          </div>
        )}
      </div>

      {/* Captions List */}
      <div
        ref={scrollRef}
        className="flex-1 space-y-3 overflow-y-auto overflow-x-hidden pr-2"
      >
        {captions.length > 0 || interimCaption ? (
          <>
            {/* Final Captions */}
            {captions.map((caption, index) => (
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
            ))}
            
            {/* Interim (Streaming) Caption */}
            {interimCaption && (
               <div className="rounded-md bg-[#19232D]/50 border border-dashed border-blue-500/30 p-3 animate-pulse">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-semibold text-blue-300 italic">
                    {interimCaption.speaker} (Speaking...)
                  </span>
                </div>
                <p className="text-sm text-gray-300 italic">{interimCaption.text}</p>
              </div>
            )}
          </>
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-center text-sm text-gray-500">
              {isRecording
                ? 'Listening...'
                : 'Click "Start Deepgram" to begin real-time transcription.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
