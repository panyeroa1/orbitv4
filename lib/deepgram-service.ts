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
      
      if (!response.ok) {
        throw new Error(`Failed to fetch Deepgram token: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const key = data.key;

      if (!key) throw new Error('No Deepgram API key returned from server (check .env.local)');

      // 2. Open WebSocket
      // Updated with user-requested parameters: language detection, entities, sentiment, etc.
      // DEBUG: Using minimal params to isolate 1006 error
      const queryParams = new URLSearchParams({
        model: 'nova-2',
        smart_format: 'true',
        interim_results: 'true',
        // diarize: 'true',
        // endpointing: '300',
        // // New features requested:
        // detect_language: 'true',
        // detect_entities: 'true',
        // sentiment: 'true',
        // punctuate: 'true',
        // paragraphs: 'true',
        // utterances: 'true', 
        // utt_split: '0.8'
      });

      const url = `wss://api.deepgram.com/v1/listen?${queryParams.toString()}`;
      console.log('Connecting to Deepgram WebSocket...', url);
      this.socket = new WebSocket(url, ['token', key]);

      this.socket.onopen = () => {
        console.log('🟢 Deepgram WebSocket connected');
        this.isConnected = true;
        this.startAudioProcessing(deviceId).catch(err => {
            console.error('Audio processing failed:', err);
            this.emitError('Audio Error: ' + err.message);
        });
      };

      this.socket.onmessage = (message) => {
        const received = JSON.parse(message.data);
        
        if (received.error) {
            console.error('Deepgram received error:', received.error);
            this.emitError(`API Error: ${received.error}`);
            return;
        }

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

      this.socket.onclose = (event) => {
        console.log('🔴 Deepgram WebSocket closed', event.code, event.reason);
        this.isConnected = false;
        
        // Treat normal closures differently if needed, but for now report everything that isn't clean
        if (event.code !== 1000) {
            let msg = `Connection closed (${event.code})`;
            if (event.code === 4001) msg = 'Authentication Failed (Check API Key)';
            if (event.code === 4000) msg = 'Bad Request format';
            if (event.reason) msg += `: ${event.reason}`;
            this.emitError(msg);
        }
        
        this.stop();
      };

      this.socket.onerror = (error) => {
        console.error('Deepgram WebSocket error:', error);
        this.emitError('Connection Error');
      };

    } catch (error: any) {
      console.error('Failed to start Deepgram service:', error);
      let errMsg = error.message || 'Unknown error starting service';
      if (errMsg.includes('API key')) {
        errMsg = 'Invalid or missing API Key';
      }
      this.emitError(errMsg);
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
  
  // Error handling
  private errorListeners: ((error: string) => void)[] = [];
  
  onError(callback: (error: string) => void): () => void {
    this.errorListeners.push(callback);
    return () => {
        this.errorListeners = this.errorListeners.filter(cb => cb !== callback);
    };
  }

  private emit(caption: DeepgramCaption) {
    this.listeners.forEach(cb => cb(caption));
  }
  
  private emitError(error: string) {
    this.errorListeners.forEach(cb => cb(error));
  }

  isActive() {
    return this.isConnected;
  }
}

export const deepgramService = new DeepgramService();
