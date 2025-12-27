import { Component, ChangeDetectionStrategy, ElementRef, viewChild, AfterViewInit, OnDestroy } from '@angular/core';

@Component({
  selector: 'app-matrix-background',
  template: `<canvas #matrixCanvas class="absolute top-0 left-0 w-full h-full"></canvas>`,
  styles: [`:host { display: block; position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 0; }`],
  host: {
    '(window:resize)': 'onResize()'
  }
})
export class MatrixBackgroundComponent implements AfterViewInit, OnDestroy {
  canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('matrixCanvas');
  
  private ctx!: CanvasRenderingContext2D;
  private animationFrameId?: number;
  private lastDrawTime = 0;
  private readonly FRAME_INTERVAL = 100; // ms
  private rainDrops: number[] = [];
  private columns = 0;
  private fontSize = 16;
  private alphabet = 'AURA AI MUSIC SMUVE';

  ngAfterViewInit(): void {
    const canvas = this.canvasRef().nativeElement;
    this.ctx = canvas.getContext('2d')!;
    this.setup();
    this.startAnimation();
  }

  ngOnDestroy(): void {
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
  }

  onResize(): void {
    this.setup();
  }

  private setup(): void {
    if (!this.canvasRef) return;
    const canvas = this.canvasRef().nativeElement;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    this.columns = canvas.width / this.fontSize;
    this.rainDrops = Array.from({ length: this.columns }).map(() => 1);
  }

  private startAnimation(): void {
    const drawLoop = (currentTime: number) => {
      if (currentTime - this.lastDrawTime > this.FRAME_INTERVAL) {
        this.drawMatrix();
        this.lastDrawTime = currentTime;
      }
      this.animationFrameId = requestAnimationFrame(drawLoop);
    };
    this.animationFrameId = requestAnimationFrame(drawLoop);
  }

  private drawMatrix(): void {
      const canvas = this.canvasRef().nativeElement;
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
      this.ctx.fillRect(0, 0, canvas.width, canvas.height);
      this.ctx.fillStyle = '#0F0';
      this.ctx.font = `${this.fontSize}px monospace`;

      for (let i = 0; i < this.rainDrops.length; i++) {
        const text = this.alphabet.charAt(Math.floor(Math.random() * this.alphabet.length));
        this.ctx.fillText(text, i * this.fontSize, this.rainDrops[i] * this.fontSize);
        if (this.rainDrops[i] * this.fontSize > canvas.height && Math.random() > 0.975) {
          this.rainDrops[i] = 0;
        }
        this.rainDrops[i]++;
      }
  }
}