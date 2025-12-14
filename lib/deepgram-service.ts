// Deepgram Speech Implementation
// Connects directly to Deepgram WebSocket API
// Uses Web Audio API to mix Microphone + System Audio (Screen Share)

export interface DeepgramCaption {
  text: string;
  speaker: number | string;
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
  
  // Streams
  private micStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null; // Keep track of this

  constructor() {}

  async getAudioDevices(): Promise<MediaDeviceInfo[]> {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(device => device.kind === 'audioinput');
    } catch (error) {
      console.error('Error listing audio devices:', error);
      return [];
    }
  }

  async start(deviceId?: string): Promise<void> {
    if (this.isConnected) return;

    try {
      const response = await fetch('/api/deepgram/token');
      const { key } = await response.json();

      if (!key) throw new Error('No Deepgram API key found');

      // 2. Open WebSocket
      // Updated with user-requested parameters: language detection, entities, sentiment, etc.
      const queryParams = new URLSearchParams({
        model: 'nova-3',
        smart_format: 'true',
        interim_results: 'true',
        diarize: 'true',
        endpointing: '300',
        // New features requested:
        detect_language: 'true',
        detect_entities: 'true',
        sentiment: 'true',
        punctuate: 'true',
        paragraphs: 'true',
        utterances: 'true', 
        utt_split: '0.8'
      });

      const url = `wss://api.deepgram.com/v1/listen?${queryParams.toString()}`;
      this.socket = new WebSocket(url, ['token', key]);

      this.socket.onopen = () => {
        console.log('🟢 Deepgram WebSocket connected');
        this.isConnected = true;
        this.startAudioProcessing(deviceId);
      };

      this.socket.onmessage = (message) => {
        const received = JSON.parse(message.data);
        const alt = received.channel?.alternatives?.[0];
        const transcript = alt?.transcript;
        
        if (transcript && transcript.length > 0) {
          const speaker = alt.words?.[0]?.speaker ?? 0;
          this.emit({
            text: transcript,
            speaker: `Speaker ${speaker}`, 
            timestamp: Date.now(),
            isFinal: received.is_final
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

  private async startAudioProcessing(deviceId?: string) {
    try {
      this.audioContext = new AudioContext();
      this.destination = this.audioContext.createMediaStreamDestination();

      // If user specifically requested 'system-audio' (our custom ID for just tab audio), 
      // we might skip mic, OR we just mix mic as usual.
      // Usually users want Mic + System.
      
      const constraints: MediaStreamConstraints = {
        audio: deviceId && deviceId !== 'system-audio' ? { deviceId: { exact: deviceId } } : true
      };

      this.micStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.micSource = this.audioContext.createMediaStreamSource(this.micStream);
      this.micSource.connect(this.destination);

      // If Screen Stream was added BEFORE start (e.g. user shared screen then started transcription)
      if (this.screenStream) {
        this.addScreenShareAudio(this.screenStream);
      }

      this.startRecording(this.destination.stream);

    } catch (error) {
      console.error('Error starting audio processing:', error);
    }
  }

  async addScreenShareAudio(stream: MediaStream) {
    this.screenStream = stream; // Store it

    if (!this.audioContext || !this.destination) {
      console.log('Audio context not ready, stored stream for later mix.');
      return;
    }

    const audioTracks = stream.getAudioTracks();
    console.log('🖥️ Screen Share Stream Tracks:', stream.getTracks().map(t => `${t.kind} (enabled: ${t.enabled})`));
    
    if (audioTracks.length === 0) {
      console.warn('⚠️ Screen share stream has NO audio tracks.');
      return;
    }

    try {
      console.log('monitor: Adding screen share audio track:', audioTracks[0].label);
      
      if (this.screenSource) {
         this.screenSource.disconnect();
      }

      this.screenSource = this.audioContext.createMediaStreamSource(stream);
      this.screenSource.connect(this.destination);
      console.log('✅ Screen share audio successfully mixed!');
      
    } catch (error) {
      console.error('❌ Failed to add screen share audio:', error);
    }
  }

  removeScreenShareAudio() {
    this.screenStream = null;
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

      this.mediaRecorder.start(250); 
      console.log('🎙️ Audio recording started (Mixed source)');

    } catch (error) {
      console.error('Error starting MediaRecorder:', error);
    }
  }

  stop() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
      this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }

    if (this.micStream) {
      this.micStream.getTracks().forEach(track => track.stop());
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.micSource = null;
    this.screenSource = null;
    this.destination = null;

    if (this.socket && this.socket.readyState === 1) {
      this.socket.close();
    }

    this.isConnected = false;
    this.mediaRecorder = null;
    this.socket = null;
    this.screenStream = null;
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
