// Google Cloud Speech-to-Text Service
// Handles real-time audio transcription using Google Cloud API

export interface Caption {
  text: string;
  speaker: string;
  timestamp: number;
  language?: string;
  translatedText?: string;
}

export type CaptionCallback = (caption: Caption) => void;

export class GoogleSpeechService {
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private isRecording = false;
  private listeners: CaptionCallback[] = [];
  private currentLanguage = 'en-US';
  private translateTo: string | null = null;

  constructor() {
    // Initialize
  }

  async startTranscription(languageCode: string = 'en-US'): Promise<void> {
    if (this.isRecording) {
      console.warn('Transcription already running');
      return;
    }

    this.currentLanguage = languageCode;

    try {
      // Request microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      // Create audio context
      this.audioContext = new AudioContext({ sampleRate: 16000 });
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);

      // Create processor for audio chunks
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

      this.processor.onaudioprocess = async (e) => {
        if (!this.isRecording) return;

        const audioData = e.inputBuffer.getChannelData(0);
        await this.processAudioChunk(audioData);
      };

      source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

      this.isRecording = true;
      console.log('🎤 Transcription started with language:', languageCode);
    } catch (error) {
      console.error('Failed to start transcription:', error);
      throw error;
    }
  }

  stopTranscription(): void {
    if (!this.isRecording) return;

    this.isRecording = false;

    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    console.log('🎤 Transcription stopped');
  }

  private async processAudioChunk(audioData: Float32Array): Promise<void> {
    try {
      // Convert Float32Array to Int16Array (LINEAR16 format)
      const int16Data = new Int16Array(audioData.length);
      for (let i = 0; i < audioData.length; i++) {
        const s = Math.max(-1, Math.min(1, audioData[i]));
        int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }

      // Convert to base64
      const base64Audio = this.arrayBufferToBase64(int16Data.buffer);

      // Send to our API route
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audio: base64Audio,
          languageCode: this.currentLanguage,
          translateTo: this.translateTo,
        }),
      });

      if (!response.ok) {
        console.error('Transcription API error:', response.statusText);
        return;
      }

      const result = await response.json();

      if (result.transcript) {
        const caption: Caption = {
          text: result.transcript,
          speaker: 'You',
          timestamp: Date.now(),
          language: this.currentLanguage,
          translatedText: result.translatedText,
        };

        this.emitCaption(caption);
      }
    } catch (error) {
      console.error('Error processing audio chunk:', error);
    }
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  setTranslateLanguage(languageCode: string | null): void {
    this.translateTo = languageCode;
  }

  onCaption(callback: CaptionCallback): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  private emitCaption(caption: Caption): void {
    this.listeners.forEach((callback) => callback(caption));
  }

  isActive(): boolean {
    return this.isRecording;
  }
}

// Singleton instance
export const googleSpeechService = new GoogleSpeechService();
