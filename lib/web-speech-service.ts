// Web Speech API Implementation (Orbits AI Beta)
// Uses browser built-in SpeechRecognition

export interface WebSpeechCaption {
  text: string;
  isFinal: boolean;
}

type CaptionCallback = (caption: WebSpeechCaption) => void;

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
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
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
  onend: () => void;
}

// Global declaration for TypeScript
declare global {
  interface Window {
    SpeechRecognition: { new(): SpeechRecognition };
    webkitSpeechRecognition: { new(): SpeechRecognition };
  }
}

export class WebSpeechService {
  private recognition: SpeechRecognition | null = null;
  private listeners: CaptionCallback[] = [];
  private isListening = false;

  constructor() {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US'; // Default

        this.recognition.onresult = (event) => {
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              this.emit({ text: transcript, isFinal: true });
            } else {
              this.emit({ text: transcript, isFinal: false });
            }
          }
        };

        this.recognition.onerror = (event) => {
          console.error('Web Speech API error:', event.error);
        };

        this.recognition.onend = () => {
          if (this.isListening) {
             // Restart if it stopped unexpectedly but we want it running
             try {
               this.recognition?.start();
             } catch (e) {
               console.warn('Failed to restart speech recognition', e);
             }
          }
        };
      } else {
        console.warn('Web Speech API not supported in this browser.');
      }
    }
  }

  start() {
    if (!this.recognition) return;
    if (this.isListening) return;

    try {
      this.recognition.start();
      this.isListening = true;
      console.log('🟢 Web Speech API (Beta) started');
    } catch (error) {
      console.error('Failed to start Web Speech API:', error);
    }
  }

  stop() {
    if (!this.recognition) return;
    this.isListening = false;
    this.recognition.stop();
    console.log('🔴 Web Speech API (Beta) stopped');
  }

  onCaption(callback: CaptionCallback): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  private emit(caption: WebSpeechCaption) {
    this.listeners.forEach(cb => cb(caption));
  }
}

export const webSpeechService = new WebSpeechService();
