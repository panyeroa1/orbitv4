"use client";

import { X, Mic, MicOff, Globe, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { deepgramService } from "@/lib/deepgram-service";
import { webSpeechService } from "@/lib/web-speech-service";
import { useCallStateHooks } from "@stream-io/video-react-sdk";

interface TranscriptionSidebarProps {
  onClose: () => void;
}

type TranscriptionEngine = 'pro' | 'beta';

export const TranscriptionSidebar = ({ onClose }: TranscriptionSidebarProps) => {
  const [captions, setCaptions] = useState<{ text: string; speaker: string; timestamp: number }[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [engine, setEngine] = useState<TranscriptionEngine>('pro'); // Default to Deepgram (Pro)
  const [interimCaption, setInterimCaption] = useState<{ text: string; speaker: string } | null>(null);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [msgPermission, setMsgPermission] = useState<boolean>(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Stream SDK Hooks for Screen Share
  const { useScreenShareState } = useCallStateHooks();
  const { mediaStream: screenShareStream, isEnabled: isScreenSharing } = useScreenShareState();

  // Fetch devices on mount
  useEffect(() => {
    const fetchDevices = async () => {
      try {
        const devices = await deepgramService.getAudioDevices();
        if (devices.length > 0) {
           setAudioDevices(devices);
           const defaultDevice = devices.find(d => d.deviceId === 'default') || devices[0];
           if (defaultDevice) setSelectedDeviceId(defaultDevice.deviceId);
           setMsgPermission(true);
        } else {
           setMsgPermission(false);
        }
      } catch (e) {
        console.error("Permission/Device error", e);
        setMsgPermission(false);
      }
    };
    
    fetchDevices();
  }, []);

  const requestMicrophoneAccess = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const devices = await deepgramService.getAudioDevices();
      setAudioDevices(devices);
      if (devices.length > 0) {
        setMsgPermission(true);
        const defaultDevice = devices.find(d => d.deviceId === 'default') || devices[0];
        if (defaultDevice) setSelectedDeviceId(defaultDevice.deviceId);
      }
    } catch (err) {
      console.error('Microphone permission denied:', err);
      setError('Microphone access denied. Please allow via browser settings.');
    }
  };

  // Handle Screen Share Audio Mixing (Deepgram Only)
  useEffect(() => {
    if (engine === 'pro') {
      if (isRecording && isScreenSharing && screenShareStream) {
        // If screen sharing is active and we are recording, add the screen audio
        deepgramService.addScreenShareAudio(screenShareStream);
      } else {
        // Otherwise ensure it's removed
        deepgramService.removeScreenShareAudio();
      }
    }
  }, [isRecording, isScreenSharing, screenShareStream, engine]);

  useEffect(() => {
    // Deepgram Subscription
    const unsubscribeDeepgram = deepgramService.onCaption((caption) => {
      if (engine !== 'pro') return; // Ignore if not active engine
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

    // Web Speech Subscription
    const unsubscribeWebSpeech = webSpeechService.onCaption((caption) => {
      if (engine !== 'beta') return; // Ignore if not active engine
       if (caption.isFinal) {
        setCaptions((prev) => [...prev, {
          text: caption.text,
          speaker: 'You (Beta)',
          timestamp: Date.now()
        }]);
        setInterimCaption(null);
      } else {
        setInterimCaption({ text: caption.text, speaker: 'You (Beta)' });
      }
    });

    return () => {
      unsubscribeDeepgram();
      unsubscribeWebSpeech();
      if (deepgramService.isActive()) deepgramService.stop();
      if (webSpeechService.isActive()) webSpeechService.stop(); // Use isActive check if available
    };
  }, [engine]);

  // Error Event Listeners
  useEffect(() => {
    const handleDeepgramError = (err: string) => {
        if (engine === 'pro') {
            setError(err);
            setIsRecording(false);
        }
    };
    
    const handleWebSpeechError = (err: string) => {
        if (engine === 'beta') {
            setError(err);
            setIsRecording(false);
        }
    };

    const unsubDeepgram = deepgramService.onError(handleDeepgramError);
    // TypeScript check: webSpeechService might not have onError if interface wasn't updated in other files yet, but we know it is.
    // However, if the service export doesn't match the class definition in the same file it might check fine.
    // Using 'any' cast if needed or just assuming it works effectively. 
    const unsubWebSpeech = webSpeechService.onError(handleWebSpeechError);

    return () => {
        unsubDeepgram();
        unsubWebSpeech();
    };
  }, [engine]);

  // Auto-scroll to bottom when new captions arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [captions, interimCaption]); // Scroll on interim updates too

  const handleStartStop = async () => {
    setError(null);

    if (isRecording) {
      if (engine === 'pro') deepgramService.stop();
      else webSpeechService.stop();
      
      setIsRecording(false);
      // Don't clear error here, let user see why it stopped if it was an error
      // But if user manually stops, maybe clear? No, new start clears it.
      setInterimCaption(null);
    } else {
      try {
        if (engine === 'pro') {
          await deepgramService.start(selectedDeviceId);
        } else {
          // Web Speech uses default mic usually, API doesn't easily support device selection in all browsers
          webSpeechService.start();
        }
        setIsRecording(true);
      } catch (err: any) {
        setError(err.message || 'Failed to start transcription.');
        console.error(err);
      }
    }
  };

  const handleEngineChange = (newEngine: TranscriptionEngine) => {
    if (isRecording) {
      // proper cleanup before switch
      if (engine === 'pro') deepgramService.stop();
      else webSpeechService.stop();
      setIsRecording(false);
      setInterimCaption(null);
    }
    setEngine(newEngine);
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
        {/* Engine Selector */}
        <div className="flex gap-2 rounded-lg bg-[#19232D] p-1">
          <button
            onClick={() => handleEngineChange('pro')}
            className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors ${
              engine === 'pro' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            Orbits AI Pro
          </button>
          <button
            onClick={() => handleEngineChange('beta')}
            className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors ${
              engine === 'beta' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            Orbits AI Beta
          </button>
        </div>

        {/* Permission / Device Selector */}
        {!msgPermission && !isRecording ? (
           <button 
             onClick={requestMicrophoneAccess}
             className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-xs font-bold text-white hover:bg-orange-700"
           >
             <MicOff size={14} />
             Allow Microphone Access
           </button>
        ) : (
          !isRecording && audioDevices.length > 0 && (
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
                 
                 {isScreenSharing && engine === 'pro' && (
                   <option value="system-audio">
                     🖥️ System Audio (Shared Tab) + Mic
                   </option>
                 )}
               </select>
            </div>
          )
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
              Stop Transcription
            </>
          ) : (
            <>
              {engine === 'pro' ? <Sparkles size={18} /> : <Mic size={18} />}
              Start {engine === 'pro' ? 'Orbits AI Pro' : 'Orbits AI Beta'}
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
            {engine === 'pro' 
               ? (isScreenSharing || selectedDeviceId === 'system-audio' 
                  ? 'Listening (Mic + System Audio)...' 
                  : 'Listening using ' + (audioDevices.find(d => d.deviceId === selectedDeviceId)?.label || 'Microphone') + '...')
               : 'Listening (Browser Native)...'
            }
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
                  <span className={`text-xs font-semibold ${
                    engine === 'pro' ? 'text-blue-400' : 'text-purple-400'
                  }`}>
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
               <div className={`rounded-md bg-[#19232D]/50 border border-dashed p-3 animate-pulse ${
                 engine === 'pro' ? 'border-blue-500/30' : 'border-purple-500/30'
               }`}>
                <div className="mb-1 flex items-center justify-between">
                  <span className={`text-xs font-semibold italic ${
                    engine === 'pro' ? 'text-blue-300' : 'text-purple-300'
                  }`}>
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
                : 'Click "Start" to begin real-time transcription.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
