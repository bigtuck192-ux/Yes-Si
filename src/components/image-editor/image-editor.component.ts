import { Component, ChangeDetectionStrategy, signal, ElementRef, viewChild, output, input, effect, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AiService, GenerateImagesResponse } from '../../services/ai.service';
import { AppTheme } from '../../services/user-context.service';

@Component({
  selector: 'app-image-editor',
  templateUrl: './image-editor.component.html',
  styleUrls: ['./image-editor.component.css'],
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImageEditorComponent {
  initialPrompt = input<string | null>(null);
  theme = input.required<AppTheme>();

  originalImageUrl = signal<string | null>(null);
  editPrompt = signal('');
  generatedImageUrls = signal<string[]>([]);
  isLoading = signal(false);
  errorMessage = signal<string | null>(null);
  aspectRatio = signal<'1:1' | '3:4' | '4:3' | '9:16' | '16:9' | '2:3' | '3:2' | '21:9'>('1:1');
  
  // New: Model Selection
  useProModel = signal(false);
  
  private aiService = inject(AiService);
  isAiAvailable = computed(() => this.aiService.isAiAvailable());
  fileInputRef = viewChild<ElementRef<HTMLInputElement>>('fileInput');
  imageSelected = output<string>();
  imageAnalysisRequest = output<string>();
  imageGenerated = output<string>();

  constructor() {
    effect(() => {
      const prompt = this.initialPrompt();
      if (prompt) this.editPrompt.set(prompt);
    });
  }

  handleImageUpload(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => this.originalImageUrl.set(e.target?.result as string);
      reader.readAsDataURL(file);
    }
  }

  async generateImage(): Promise<void> {
    if (!this.isAiAvailable() || !this.aiService.genAI) {
      this.errorMessage.set('AI features are unavailable.');
      return;
    }
    const prompt = this.editPrompt().trim();
    if (!prompt) {
      this.errorMessage.set('Please enter a prompt.');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);
    try {
      if (this.useProModel()) {
          // Check for API key selection (required for Pro Image)
          if ((window as any).aistudio && !(await (window as any).aistudio.hasSelectedApiKey())) {
            const success = await (window as any).aistudio.openSelectKey();
            if (!success) throw new Error("API Key selection required for Pro models.");
          }
      }

      const model = this.useProModel() ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image';
      
      // Different logic for Gemini Image models vs Imagen
      // Gemini Image models use generateContent with imageConfig
      const response = await this.aiService.genAI.models.generateContent({
        model: model,
        contents: { parts: [{ text: prompt }] },
        config: {
            imageConfig: { 
                aspectRatio: this.aspectRatio(),
                imageSize: this.useProModel() ? '2K' : '1K'
            } as any // Cast because imageConfig isn't fully typed in base interface yet for all cases
        } as any
      });

      let imageUrl = '';
      for (const part of response.candidates?.[0]?.content?.parts || []) {
          if (part.inlineData) {
              imageUrl = `data:image/png;base64,${part.inlineData.data}`;
              break;
          }
      }

      if (imageUrl) {
        this.generatedImageUrls.set([imageUrl]);
        this.imageGenerated.emit(imageUrl);
      } else {
        this.errorMessage.set('No image generated.');
      }
    } catch (error: any) {
      this.errorMessage.set(`Image generation failed: ${error.message}`);
    } finally {
      this.isLoading.set(false);
    }
  }
  
  async editImage(): Promise<void> {
    if (!this.isAiAvailable() || !this.aiService.genAI) {
      this.errorMessage.set('AI features are unavailable.'); return;
    }
    const originalImage = this.originalImageUrl();
    if (!originalImage) {
      this.errorMessage.set('Please upload an image to edit.'); return;
    }
    const prompt = this.editPrompt().trim();
    if (!prompt) {
      this.errorMessage.set('Please enter an edit prompt.'); return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);
    try {
      const mimeType = originalImage.split(';')[0].split(':')[1];
      const imageData = originalImage.split(',')[1];
      
      // Use Flash Image for editing (it supports image input + text prompt)
      const response = await this.aiService.genAI.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [
            { inlineData: { mimeType, data: imageData } },
            { text: prompt }
        ]}
      });

      let imageUrl = '';
      for (const part of response.candidates?.[0]?.content?.parts || []) {
          if (part.inlineData) {
              imageUrl = `data:image/png;base64,${part.inlineData.data}`;
              break;
          }
      }

      if (imageUrl) {
        this.generatedImageUrls.set([imageUrl]);
        this.imageGenerated.emit(imageUrl);
      } else {
        this.errorMessage.set('Image editing failed to produce an image.');
      }

    } catch (error: any) {
      this.errorMessage.set(`Image editing failed: ${error.message}`);
    } finally {
      this.isLoading.set(false);
    }
  }

  clearImage(): void {
    this.originalImageUrl.set(null);
    this.generatedImageUrls.set([]);
    this.editPrompt.set('');
    this.errorMessage.set(null);
    if (this.fileInputRef()) this.fileInputRef()!.nativeElement.value = '';
  }

  useAsAlbumArt(): void {
    const urlToEmit = this.generatedImageUrls()[0] || this.originalImageUrl();
    if (urlToEmit) this.imageSelected.emit(urlToEmit);
  }

  requestImageAnalysis(): void {
    const urlToAnalyze = this.generatedImageUrls()[0] || this.originalImageUrl();
    if (urlToAnalyze) this.imageAnalysisRequest.emit(urlToAnalyze);
  }
}