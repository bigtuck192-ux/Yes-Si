import { Component, ChangeDetectionStrategy, signal, viewChild, ElementRef, OnDestroy, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AiService, LiveSession, LiveServerMessage } from '../../services/ai.service';
import { AppTheme } from '../../services/user-context.service';

@Component({
  selector: 'app-live-session',
  template: `
    <div class="flex flex-col h-full w-full p-4 gap-4 relative overflow-hidden" [class]="'text-' + theme().neutral + '-200'">
      
      <!-- Header -->
      <div class="flex justify-between items-center z-10">
        <h2 class="text-xl font-bold tracking-widest" [class]="'text-' + theme().blue + '-400'">[ LIVE JAM SESSION ]</h2>
        <div class="flex items-center gap-2">
            <span class="text-xs" [class]="connected() ? 'text-green-500' : 'text-red-500'">
                {{ connected() ? '● CONNECTED' : '○ DISCONNECTED' }}
            </span>
        </div>
      </div>

      <!-- Main Visual Area -->
      <div class="flex-grow flex items-center justify-center relative">
        <!-- Ambient Glow -->
        <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
             <div class="w-64 h-64 rounded-full blur-[80px] transition-all duration-300" 
                  [class.scale-150]="isSpeaking()"
                  [style.background-color]="connected() ? 'rgba(59, 130, 246, 0.2)' : 'transparent'"></div>
        </div>

        <!-- Video/Visualizer -->
        <div class="relative z-10 rounded-2xl overflow-hidden border-2 w-full max-w-2xl aspect-video bg-black/50 backdrop-blur-md shadow-2xl" 
             [class]="'border-' + theme().blue + '-500/30'">
            <video #videoPreview class="w-full h-full object-cover transform scale-x-[-1]" [class.hidden]="!isVideoEnabled()" muted playsInline></video>
            
            @if (!isVideoEnabled()) {
                <div class="absolute inset-0 flex items-center justify-center">
                    <div class="relative w-32 h-32 flex items-center justify-center">
                         <div class="absolute inset-0 border-4 border-t-transparent rounded-full animate-spin" [class]="'border-' + theme().blue + '-500'"></div>
                         <i class="text-4xl" [class]="connected() ? 'fa-solid fa-microphone text-white' : 'fa-solid fa-microphone-slash text-gray-500'"></i>
                    </div>
                </div>
            }
        </div>
      </div>

      <!-- Transcription Log -->
      <div class="h-48 overflow-y-auto p-4 rounded-xl border bg-black/40 backdrop-blur-sm space-y-2 font-mono text-sm z-10"
           [class]="'border-' + theme().blue + '-500/20'">
          @if (logs().length === 0) { <div class="opacity-50 italic text-center">Start the session to jam with Gemini...</div> }
          @for (log of logs(); track $index) {
              <div [class]="log.source === 'user' ? 'text-right opacity-70' : 'text-left font-bold text-' + theme().blue + '-300'">
                  <span class="text-[10px] uppercase opacity-50 block">{{ log.source }}</span>
                  {{ log.text }}
              </div>
          }
      </div>

      <!-- Controls -->
      <div class="flex justify-center gap-4 z-10">
        <button (click)="toggleConnection()" 
                class="px-8 py-4 rounded-full font-bold text-lg border transition-all shadow-lg hover:scale-105 active:scale-95"
                [class]="connected() ? 'bg-red-500/20 border-red-500 text-red-400 hover:bg-red-500/40' : 'bg-green-500/20 border-green-500 text-green-400 hover:bg-green-500/40'">
            {{ connected() ? 'END SESSION' : 'START LIVE' }}
        </button>

        @if (connected()) {
            <button (click)="toggleVideo()" class="w-14 h-14 rounded-full border flex items-center justify-center transition-all hover:bg-white/10"
                [class]="isVideoEnabled() ? 'bg-blue-500/20 border-blue-400 text-blue-300' : 'border-gray-600 text-gray-500'">
                VID
            </button>
        }
      </div>

      <!-- Hidden Canvas for Video Processing -->
      <canvas #videoCanvas class="hidden"></canvas>
    </div>
  `,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LiveSessionComponent implements OnDestroy {
  theme = input.required<AppTheme>();
  
  connected = signal(false);
  isSpeaking = signal(false);
  isVideoEnabled = signal(false);
  logs = signal<{source: 'user' | 'model', text: string}[]>([]);

  private aiService = inject(AiService);
  private session: LiveSession | null = null;
  private audioContext: AudioContext | null = null;
  private audioStream: MediaStream | null = null;
  private videoStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private nextStartTime = 0;
  private videoInterval: any;

  videoPreviewRef = viewChild<ElementRef<HTMLVideoElement>>('videoPreview');
  canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('videoCanvas');

  // Transcription buffer
  private currentInputTrans = '';
  private currentOutputTrans = '';

  ngOnDestroy() {
    this.disconnect();
  }

  async toggleConnection() {
    if (this.connected()) {
        this.disconnect();
    } else {
        await this.connect();
    }
  }

  async connect() {
    if (!this.aiService.genAI) return;
    
    try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        this.audioContext = new AudioContextClass({ sampleRate: 24000 }); // Output rate
        this.nextStartTime = this.audioContext.currentTime;

        // Input Stream (Mic) - 16kHz required by Gemini Live
        const inputCtx = new AudioContextClass({ sampleRate: 16000 });
        this.audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        const source = inputCtx.createMediaStreamSource(this.audioStream);
        this.processor = inputCtx.createScriptProcessor(4096, 1, 1);
        
        this.processor.onaudioprocess = (e) => {
            if (!this.session) return;
            const inputData = e.inputBuffer.getChannelData(0);
            const pcm16 = this.float32ToPCM16(inputData);
            const base64 = this.arrayBufferToBase64(pcm16.buffer);
            this.session.sendRealtimeInput({ media: { mimeType: 'audio/pcm;rate=16000', data: base64 } });
        };

        source.connect(this.processor);
        this.processor.connect(inputCtx.destination);

        // Connect to Gemini
        this.session = await this.aiService.genAI.live.connect({
            model: 'gemini-2.5-flash-native-audio-preview-09-2025',
            config: {
                responseModalities: ['AUDIO'],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
                systemInstruction: "You are a creative music studio assistant. Be concise, energetic, and helpful.",
                inputAudioTranscription: {},
                outputAudioTranscription: {}
            },
            callbacks: {
                onopen: () => this.connected.set(true),
                onclose: () => this.disconnect(),
                onmessage: (msg: LiveServerMessage) => this.handleMessage(msg),
                onerror: (err) => console.error("Live Error:", err)
            }
        });

    } catch (e) {
        console.error("Connection failed", e);
        alert("Failed to connect to Live API.");
    }
  }

  private handleMessage(msg: LiveServerMessage) {
    // Audio Output
    const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (audioData && this.audioContext) {
        this.playAudio(audioData);
    }

    // Transcription
    if (msg.serverContent?.inputTranscription) {
        this.currentInputTrans += msg.serverContent.inputTranscription.text;
    }
    if (msg.serverContent?.outputTranscription) {
        this.currentOutputTrans += msg.serverContent.outputTranscription.text;
    }

    if (msg.serverContent?.turnComplete) {
        if (this.currentInputTrans) this.logs.update(l => [...l, { source: 'user', text: this.currentInputTrans }]);
        if (this.currentOutputTrans) this.logs.update(l => [...l, { source: 'model', text: this.currentOutputTrans }]);
        this.currentInputTrans = '';
        this.currentOutputTrans = '';
    }
    
    if (msg.serverContent?.interrupted) {
        this.isSpeaking.set(false);
        this.nextStartTime = this.audioContext?.currentTime || 0;
    }
  }

  private async playAudio(base64: string) {
      if (!this.audioContext) return;
      this.isSpeaking.set(true);
      
      const binary = atob(base64);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
      
      // PCM16 to Float32
      const int16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(int16.length);
      for(let i=0; i<int16.length; i++) float32[i] = int16[i] / 32768.0;
      
      const buffer = this.audioContext.createBuffer(1, float32.length, 24000);
      buffer.copyToChannel(float32, 0);
      
      const source = this.audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(this.audioContext.destination);
      
      const start = Math.max(this.audioContext.currentTime, this.nextStartTime);
      source.start(start);
      this.nextStartTime = start + buffer.duration;
      
      source.onended = () => {
          if (this.audioContext && this.audioContext.currentTime >= this.nextStartTime - 0.1) {
              this.isSpeaking.set(false);
          }
      };
  }

  async toggleVideo() {
      if (this.isVideoEnabled()) {
          this.stopVideo();
      } else {
          await this.startVideo();
      }
  }

  async startVideo() {
      try {
          this.videoStream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
          const vid = this.videoPreviewRef()?.nativeElement;
          if (vid) {
              vid.srcObject = this.videoStream;
              vid.play();
          }
          this.isVideoEnabled.set(true);
          
          this.videoInterval = setInterval(() => {
              if (this.session && this.connected()) {
                  this.sendVideoFrame();
              }
          }, 500); // 2 FPS
      } catch (e) {
          console.error("Video failed", e);
      }
  }

  private sendVideoFrame() {
      const vid = this.videoPreviewRef()?.nativeElement;
      const canvas = this.canvasRef()?.nativeElement;
      if (!vid || !canvas || !this.session) return;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
          canvas.width = vid.videoWidth;
          canvas.height = vid.videoHeight;
          ctx.drawImage(vid, 0, 0);
          const base64 = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];
          this.session.sendRealtimeInput({ media: { mimeType: 'image/jpeg', data: base64 } });
      }
  }

  stopVideo() {
      if (this.videoStream) this.videoStream.getTracks().forEach(t => t.stop());
      if (this.videoInterval) clearInterval(this.videoInterval);
      this.videoStream = null;
      this.isVideoEnabled.set(false);
  }

  disconnect() {
      if (this.session) {
          this.session.close();
          this.session = null;
      }
      if (this.processor) {
          this.processor.disconnect();
          this.processor.onaudioprocess = null;
      }
      if (this.audioStream) this.audioStream.getTracks().forEach(t => t.stop());
      if (this.audioContext) this.audioContext.close();
      this.stopVideo();
      this.connected.set(false);
      this.isSpeaking.set(false);
  }

  private float32ToPCM16(float32: Float32Array): Int16Array {
      const int16 = new Int16Array(float32.length);
      for (let i = 0; i < float32.length; i++) {
        const s = Math.max(-1, Math.min(1, float32[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      return int16;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
      let binary = '';
      const bytes = new Uint8Array(buffer);
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return btoa(binary);
  }
}
