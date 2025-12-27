import { Component, ChangeDetectionStrategy, input, ElementRef, viewChild, AfterViewInit, OnDestroy, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
// FIX: Update AppTheme import to break circular dependency
import { AppTheme } from '../../services/user-context.service';

@Component({
  selector: 'app-audio-visualizer',
  templateUrl: './audio-visualizer.component.html',
  styleUrls: ['./audio-visualizer.component.css'],
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AudioVisualizerComponent implements AfterViewInit, OnDestroy {
  analyserNode = input<AnalyserNode | undefined>(undefined);
  canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('visualizerCanvas');
  theme = input.required<AppTheme>();

  private ctx!: CanvasRenderingContext2D;
  private dataArray!: Uint8Array;
  private animationFrameId?: number;

  constructor() {
    effect(() => {
      const analyser = this.analyserNode();
      if (analyser) {
        analyser.fftSize = 256;
        this.dataArray = new Uint8Array(analyser.frequencyBinCount);
        if (this.ctx) this.startVisualizer();
      } else {
        this.stopVisualizer();
      }
    });
  }

  ngAfterViewInit(): void {
    const canvas = this.canvasRef().nativeElement;
    this.ctx = canvas.getContext('2d')!;
    if (this.analyserNode()) this.startVisualizer();
  }

  ngOnDestroy(): void {
    this.stopVisualizer();
  }

  private startVisualizer(): void {
    this.stopVisualizer();
    const canvas = this.canvasRef().nativeElement;
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    this.animationFrameId = requestAnimationFrame(this.draw.bind(this));
  }

  private stopVisualizer(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = undefined;
    }
  }

  private draw(): void {
    const analyser = this.analyserNode();
    if (!analyser || !this.ctx) { this.stopVisualizer(); return; }

    analyser.getByteFrequencyData(this.dataArray);
    const canvas = this.canvasRef().nativeElement;
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);
    const barCount = analyser.frequencyBinCount;
    const barWidth = (canvas.width / barCount) * 0.9;
    let x = 0;

    for (let i = 0; i < barCount; i++) {
      const barHeight = (this.dataArray[i] / 255) * canvas.height;
      const hue = i * (360 / barCount);
      this.ctx.fillStyle = `hsl(${hue}, 80%, 60%)`;
      this.ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
      x += barWidth + (canvas.width / barCount) * 0.1;
    }
    this.animationFrameId = requestAnimationFrame(this.draw.bind(this));
  }
}
