import { Component, ChangeDetectionStrategy, signal, ElementRef, viewChild, OnDestroy, input, effect, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AiService, GenerateVideosOperation } from '../services/ai.service';
import { AppTheme } from '../services/user-context.service';

@Component({
  selector: 'app-video-editor',
  templateUrl: './video-editor.component.html',
  styleUrls: ['./video-editor.component.css'],
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VideoEditorComponent implements OnDestroy {
  imageForVideoGeneration = input<string | null>(null);
  initialPrompt = input<string | null>(null);
  theme = input.required<AppTheme>();
  
  mediaStream = signal<MediaStream | null>(null);
  isRecording = signal(false);
  recordedVideoUrl = signal<string | null>(null);
  videoPrompt = signal('');
  generatedVideoUrl = signal<string | null>(null);
  isGeneratingVideo = signal(false);
  generationProgressMessage = signal<string | null>(null);
  aspectRatio = signal<'16:9' | '9:16'>('16:9');
  error = signal<string | null>(null);
  
  private aiService = inject(AiService);
  isAiAvailable = computed(() => this.aiService.isAiAvailable());
  liveVideoPreviewRef = viewChild<ElementRef<HTMLVideoElement>>('liveVideoPreview');

  constructor() {
    effect(() => {
      const prompt = this.initialPrompt();
      if (prompt) this.videoPrompt.set(prompt);
    });
  }

  ngOnDestroy(): void {
    this.stopMediaStream();
  }

  async toggleCamera(): Promise<void> {
    if (this.mediaStream()) {
      this.stopMediaStream();
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        this.mediaStream.set(stream);
        const videoEl = this.liveVideoPreviewRef()?.nativeElement;
        if(videoEl) videoEl.srcObject = stream;
      } catch (err: any) { this.error.set(`Camera access denied: ${err.message}`); }
    }
  }

  stopMediaStream(): void {
    this.mediaStream()?.getTracks().forEach(track => track.stop());
    this.mediaStream.set(null);
    const videoEl = this.liveVideoPreviewRef()?.nativeElement;
    if(videoEl) videoEl.srcObject = null;
  }

  async generateVideo(fromImage: boolean): Promise<void> {
    if (!this.isAiAvailable() || !this.aiService.genAI) {
      this.error.set('AI features are unavailable.'); return;
    }
    const prompt = this.videoPrompt().trim();
    if (!prompt) { this.error.set('Please enter a prompt.'); return; }

    this.isGeneratingVideo.set(true);
    this.error.set(null);
    this.generationProgressMessage.set('Initializing Veo 3.1...');
    
    try {
      let operation: GenerateVideosOperation;
      const config = { numberOfVideos: 1, aspectRatio: this.aspectRatio(), resolution: '720p' as const };
      
      // Check for API key selection (required for Veo)
      if ((window as any).aistudio && !(await (window as any).aistudio.hasSelectedApiKey())) {
          const success = await (window as any).aistudio.openSelectKey();
          if (!success) throw new Error("API Key selection required for Veo models.");
      }

      if (fromImage && this.imageForVideoGeneration()) {
        const mimeType = this.imageForVideoGeneration()!.split(';')[0].split(':')[1];
        const data = this.imageForVideoGeneration()!.split(',')[1];
        operation = await this.aiService.genAI.models.generateVideos({
          model: 'veo-3.1-fast-generate-preview', prompt,
          image: { imageBytes: data, mimeType }, config,
        });
      } else {
        operation = await this.aiService.genAI.models.generateVideos({
          model: 'veo-3.1-fast-generate-preview', prompt, config,
        });
      }

      this.generationProgressMessage.set('Rendering video frames...');
      while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        operation = await this.aiService.genAI.operations.getVideosOperation({ operation });
        this.generationProgressMessage.set('Processing physics & lighting...');
      }

      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (downloadLink) {
        this.generatedVideoUrl.set(`${downloadLink}&key=${this.aiService.getApiKey()}`);
        this.generationProgressMessage.set('Generation complete!');
      } else { throw new Error('No download link in response.'); }
    } catch (err: any) {
      this.error.set(`Video generation failed: ${err.message}`);
      this.generationProgressMessage.set(null);
    } finally {
      this.isGeneratingVideo.set(false);
    }
  }
}