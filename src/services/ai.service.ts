
import { Injectable, signal, computed, EnvironmentProviders, makeEnvironmentProviders, InjectionToken, inject } from '@angular/core';

// Moved from index.tsx to prevent circular dependency
export const API_KEY_TOKEN = new InjectionToken<string>('GEMINI_API_KEY');

// --- START: INTERNAL TYPE DECLARations FOR @google/genai ---

export interface GoogleGenAI {
  apiKey: string;
  models: {
    generateContent(params: GenerateContentParameters): Promise<GenerateContentResponse>;
    generateContentStream(params: GenerateContentParameters): Promise<AsyncIterable<GenerateContentResult>>;
    generateImages(params: GenerateImagesParameters): Promise<GenerateImagesResponse>;
    generateVideos(params: GenerateVideosParameters): Promise<GenerateVideosOperation>;
  };
  chats: {
    create(config: { model: string; systemInstruction?: string; config?: any; }): Chat;
  };
  live: {
    connect(params: LiveConnectParameters): Promise<LiveSession>;
  };
  operations: {
    getVideosOperation(params: { operation: GenerateVideosOperation }): Promise<GenerateVideosOperation>;
  };
}

export interface Chat {
  model: string;
  sendMessage(params: { message: string | Content | (string | Content)[] }): Promise<GenerateContentResponse>;
  sendMessageStream(params: { message: string | Content | (string | Content)[] }): Promise<AsyncIterable<GenerateContentResult>>;
  getHistory(): Promise<Content[]>;
  setHistory(history: Content[]): void;
  sendContext(context: Content[]): Promise<void>;
  config?: { systemInstruction?: string; };
}

export interface LiveConnectParameters {
  model: string;
  config?: {
    responseModalities?: string[]; // 'AUDIO'
    speechConfig?: { voiceConfig?: { prebuiltVoiceConfig?: { voiceName: string } } };
    systemInstruction?: string;
    inputAudioTranscription?: {};
    outputAudioTranscription?: {};
  };
  callbacks?: {
    onopen?: () => void;
    onmessage?: (message: LiveServerMessage) => void;
    onclose?: (event: CloseEvent) => void;
    onerror?: (event: ErrorEvent) => void;
  };
}

export interface LiveSession {
  sendRealtimeInput(input: { media: { mimeType: string; data: string; } }): void;
  sendToolResponse(response: any): void;
  close(): void;
}

export interface LiveServerMessage {
  serverContent?: {
    modelTurn?: { parts: { inlineData: { data: string; mimeType: string; } }[] };
    turnComplete?: boolean;
    interrupted?: boolean;
    inputTranscription?: { text: string };
    outputTranscription?: { text: string };
  };
  toolCall?: any;
}

export interface GenerateContentParameters {
  model: string;
  contents: string | { parts: Content[] } | Content[];
  config?: {
    systemInstruction?: string;
    tools?: Tool[];
    topK?: number;
    topP?: number;
    temperature?: number;
    responseMimeType?: string;
    responseSchema?: { type: Type; items?: any; properties?: any; propertyOrdering?: string[]; };
    seed?: number;
    maxOutputTokens?: number;
    thinkingConfig?: { thinkingBudget: number };
  };
}

export interface GenerateContentResponse {
  text: string;
  candidates?: Array<{
    content?: { parts?: Content[]; };
    groundingMetadata?: {
      groundingChunks?: Array<{
        web?: { uri?: string; title?: string; };
      }>;
    };
  }>;
}

export interface GenerateContentResult {
  text: string;
  candidates?: Array<{
    groundingMetadata?: {
      groundingChunks?: Array<{
        web?: { uri?: string; title?: string; };
      }>;
    };
  }>;
}

export interface Content {
  text?: string;
  inlineData?: { mimeType: string; data: string; };
  fileData?: { mimeType: string; fileUri: string; };
  parts?: Content[];
}

export enum Type {
  TYPE_UNSPECIFIED = 'TYPE_UNSPECIFIED', STRING = 'STRING', NUMBER = 'NUMBER',
  INTEGER = 'INTEGER', BOOLEAN = 'BOOLEAN', ARRAY = 'ARRAY', OBJECT = 'OBJECT', NULL = 'NULL',
}

export interface Tool {
  googleSearch?: {};
  googleMaps?: {};
}

export interface GenerateImagesParameters {
  model: string; prompt: string;
  config?: {
    numberOfImages?: number; outputMimeType?: string;
    aspectRatio?: '1:1' | '3:4' | '4:3' | '9:16' | '16:9' | '2:3' | '3:2' | '21:9';
    imageSize?: '1K' | '2K' | '4K'; 
  };
}

export interface GenerateImagesResponse {
  generatedImages: Array<{ image: { imageBytes: string; }; }>;
}

export interface GenerateVideosParameters {
  model: string; prompt: string; image?: { imageBytes: string; mimeType: string; };
  config?: {
    numberOfVideos?: number;
    aspectRatio?: '1:1' | '3:4' | '4:3' | '9:16' | '16:9';
    resolution?: '720p' | '1080p';
  };
}

export interface GenerateVideosResponse {
  generatedVideos?: Array<{ video?: { uri?: string; }; }>;
}

export interface GenerateVideosOperation {
  done: boolean; name: string; response?: GenerateVideosResponse;
  metadata?: any; error?: { code: number; message: string; };
}

export enum Modality {
  AUDIO = 'AUDIO',
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO'
}

// --- END: INTERNAL TYPE DECLARATIONS ---

@Injectable()
export class AiService {
  private readonly _apiKey: string = inject(API_KEY_TOKEN);

  private _genAI = signal<GoogleGenAI | undefined>(undefined);
  private _chatInstance = signal<Chat | undefined>(undefined);

  readonly isAiAvailable = computed(() => !!this._genAI());

  constructor() {
    this.initializeGenAI();
  }

  get genAI(): GoogleGenAI | undefined {
    return this._genAI();
  }

  get chatInstance(): Chat | undefined {
    return this._chatInstance();
  }

  getApiKey(): string {
    return this._apiKey;
  }

  async transcribeAudio(base64Audio: string, mimeType: string): Promise<string> {
    if (!this.isAiAvailable() || !this.genAI) {
      throw new Error("AI Service not available.");
    }
    try {
      const audioPart = { inlineData: { mimeType, data: base64Audio } };
      const textPart = { text: "Transcribe this audio." };
      const response = await this.genAI.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [audioPart, textPart] }
      });
      return response.text;
    } catch (error) {
      console.error('AI Service: Audio transcription failed', error);
      throw new Error('Failed to transcribe audio.');
    }
  }

  private async initializeGenAI(): Promise<void> {
    if (!this._apiKey || this._apiKey.length < 30) {
      console.error('AiService: AI features disabled. Invalid or missing API key.');
      return;
    }

    try {
      // By constructing the URL from parts, we make it impossible for any
      // static analysis tool to detect and pre-load this module.
      const url = ['https://', 'next.esm.sh/', '@google/genai@^1.30.0?external=rxjs'].join('');
      const genaiModule = await import(/* @vite-ignore */ url);
      
      const genAIInstance = new (genaiModule.GoogleGenAI as any)({ apiKey: this._apiKey }) as GoogleGenAI;
      this._genAI.set(genAIInstance);

      const createdChatInstance = genAIInstance.chats.create({
        model: 'gemini-3-flash-preview',
        config: {
          systemInstruction: `You are S.M.U.V.E (Sentient Music Understanding and Vision Engine), an expert AI music manager and creative partner for the AURA Studio app.

Your goal is to provide **hyper-personalized** and **context-aware** assistance.
With each message, you will receive a [SYSTEM_CONTEXT] JSON block containing:
1. 'appState': The current screen (e.g., 'piano-roll', 'dj', 'image-editor') and theme.
2. 'userProfile': The artist's profile, including their Name, Genre, Skills, Career Goals, and Influences.

**Directives:**

1.  **Be The Manager:** Address the user by their Artist Name if available. If their goal is "Get Signed", offer industry-standard advice. If "Improve Skills", offer technical tips.
2.  **Use The Profile:** 
    - If they are a 'Producer' in 'Hip-Hop', suggest trap drum patterns or sampling techniques.
    - If they are a 'Vocalist' in 'R&B', discuss harmonies or vocal chain plugins.
    - Reference their 'Influences' when suggesting creative direction.
3.  **Be Situationally Aware:**
    - In 'piano-roll': Focus on melody, harmony, BPM, and composition.
    - In 'image-editor': Focus on album art aesthetics, visual branding, and prompts.
    - In 'video-editor': Focus on music video concepts, pacing, and storytelling.
    - In 'networking': Focus on collaboration strategies and finding local talent.
4.  **Tone:** Creative, enthusiastic, slightly futuristic, but professional.
5.  **Actions:** You can execute commands like SEARCH, DEEP (for reasoning), MAP, GENERATE_IMAGE, etc. when the user intent matches.

Always prioritize the user's specific context over generic advice.
`
        },
      }) as Chat;
      this._chatInstance.set(createdChatInstance);

      console.log('AiService: GoogleGenAI client initialized.');
    } catch (error) {
      console.error('AiService: Error initializing GoogleGenAI client:', error);
      this._genAI.set(undefined);
    }
  }
}

export function provideAiService(): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: AiService, useClass: AiService },
  ]);
}
