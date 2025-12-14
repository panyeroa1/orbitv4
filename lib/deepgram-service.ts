// Deepgram Speech Implementation
// Connects directly to Deepgram WebSocket API
// Uses Web Audio API to mix Microphone + System Audio (Screen Share)

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
  
  // Audio Mixing Context
  private audioContext: AudioContext | null = null;
  private destination: MediaStreamAudioDestinationNode | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private screenSource: MediaStreamAudioSourceNode | null = null;
  private micStream: MediaStream | null = null;

  constructor() {}

  async start(): Promise<void> {
    if (this.isConnected) return;

    try {
      // 1. Get API Key
      const response = await fetch('/api/deepgram/token');
      const { key } = await response.json();

      if (!key) throw new Error('No Deepgram API key found');

      // 2. Open WebSocket
      const url = `wss://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&interim_results=true&endpointing=300`;
      this.socket = new WebSocket(url, ['token', key]);

      this.socket.onopen = () => {
        console.log('🟢 Deepgram WebSocket connected');
        this.isConnected = true;
        this.startAudioProcessing(); // Renamed from startMicrophone
      };

      this.socket.onmessage = (message) => {
        const received = JSON.parse(message.data);
        const transcript = received.channel?.alternatives?.[0]?.transcript;
        
        if (transcript && transcript.length > 0) {
          const isFinal = received.is_final;
          
          this.emit({
            text: transcript,
            speaker: 'You', 
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

  private async startAudioProcessing() {
    try {
      // Initialize Audio Context
      this.audioContext = new AudioContext();
      this.destination = this.audioContext.createMediaStreamDestination();

      // Get Microphone Stream
      this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.micSource = this.audioContext.createMediaStreamSource(this.micStream);
      
      // Connect Mic to Destination
      this.micSource.connect(this.destination);

      // Start Recording from the Mixed Destination Stream
      this.startRecording(this.destination.stream);

    } catch (error) {
      console.error('Error starting audio processing:', error);
    }
  }

  // Method to add Screen Share Audio
  async addScreenShareAudio(stream: MediaStream) {
    if (!this.audioContext || !this.destination) {
      console.warn('Audio context not initialized. Cannot add screen share audio.');
      return;
    }

    // Check if stream has audio tracks
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      console.warn('Screen share stream has no audio tracks.');
      return;
    }

    try {
      console.log('🖥️ Adding screen share audio to transcription mix');
      
      // Create source from screen share stream
      // Important: Clone the stream to avoid interfering with the original stream (e.g. storage/display)
      this.screenSource = this.audioContext.createMediaStreamSource(stream);
      
      // Connect Screen Audio to Destination
      this.screenSource.connect(this.destination);
      
    } catch (error) {
      console.error('Failed to add screen share audio:', error);
    }
  }

  removeScreenShareAudio() {
    if (this.screenSource) {
      console.log('🖥️ Removing screen share audio from mix');
      this.screenSource.disconnect();
      this.screenSource = null;
    }
  }

  private startRecording(stream: MediaStream) {
    try {
      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm',
      });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && this.socket?.readyState === 1) {
          this.socket.send(event.data);
        }
      };

      this.mediaRecorder.start(250); // Send chunk every 250ms
      console.log('🎙️ Audio recording started (Mixed source)');

    } catch (error) {
      console.error('Error starting MediaRecorder:', error);
    }
  }

  stop() {
    // Stop Recorder
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
      this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }

    // Stop Mic Stream
    if (this.micStream) {
      this.micStream.getTracks().forEach(track => track.stop());
    }

    // Close Audio Context
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.micSource = null;
    this.screenSource = null;
    this.destination = null;

    // Close Socket
    if (this.socket && this.socket.readyState === 1) {
      this.socket.close();
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
