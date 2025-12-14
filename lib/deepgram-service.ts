// Deepgram Speech Implementation
// Connects directly to Deepgram WebSocket API

export interface DeepgramCaption {
  text: string;
  speaker: string;
  timestamp: number;
  isFinal: boolean;
}

type CaptionCallback = (caption: DeepgramCaption) => void;

export class DeepgramService {
  private socket: WebSocket | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private listeners: CaptionCallback[] = [];
  private isConnected = false;
  private keepAliveInterval: NodeJS.Timeout | null = null;

  constructor() {}

  async start(): Promise<void> {
    if (this.isConnected) return;

    try {
      // 1. Get API Key
      const response = await fetch('/api/deepgram/token');
      const { key } = await response.json();

      if (!key) throw new Error('No Deepgram API key found');

      // 2. Open WebSocket
      // nova-3 is the model requested
      const url = `wss://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&interim_results=true&endpointing=300`;
      this.socket = new WebSocket(url, ['token', key]);

      this.socket.onopen = () => {
        console.log('🟢 Deepgram WebSocket connected');
        this.isConnected = true;
        this.startMicrophone();
      };

      this.socket.onmessage = (message) => {
        const received = JSON.parse(message.data);
        const transcript = received.channel?.alternatives?.[0]?.transcript;
        
        if (transcript && transcript.length > 0) {
          const isFinal = received.is_final;
          
          this.emit({
            text: transcript,
            speaker: 'You', // Deepgram diarization is extra config, keeping simple for now
            timestamp: Date.now(),
            isFinal
          });
        }
      };

      this.socket.onclose = () => {
        console.log('🔴 Deepgram WebSocket closed');
        this.isConnected = false;
        this.stop();
      };

      this.socket.onerror = (error) => {
        console.error('Deepgram WebSocket error:', error);
      };

    } catch (error) {
      console.error('Failed to start Deepgram service:', error);
      throw error;
    }
  }

  private async startMicrophone() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm',
      });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && this.socket?.readyState === 1) {
          this.socket.send(event.data);
        }
      };

      this.mediaRecorder.start(250); // Send chunk every 250ms

    } catch (error) {
      console.error('Error accessing microphone:', error);
    }
  }

  stop() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
      this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }

    if (this.socket && this.socket.readyState === 1) {
      this.socket.close();
    }

    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
    }

    this.isConnected = false;
    this.mediaRecorder = null;
    this.socket = null;
  }

  onCaption(callback: CaptionCallback): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  private emit(caption: DeepgramCaption) {
    this.listeners.forEach(cb => cb(caption));
  }

  isActive() {
    return this.isConnected;
  }
}

export const deepgramService = new DeepgramService();
