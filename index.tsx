
// The API_KEY sanitization logic has been moved to a <script> tag in src/index.html
// to ensure it runs before any modules are imported and evaluated.

import { bootstrapApplication } from '@angular/platform-browser';
import { provideZonelessChangeDetection } from '@angular/core';
import { AppComponent } from './src/video-editor/app.component';
import { provideAiService, API_KEY_TOKEN } from './src/services/ai.service';

// This value is now set by the inline script in src/index.html on the global object.
declare global {
  var AURA_GEMINI_API_KEY: string;
}

bootstrapApplication(AppComponent, {
  providers: [
    provideZonelessChangeDetection(),
    provideAiService(),
    { provide: API_KEY_TOKEN, useValue: globalThis.AURA_GEMINI_API_KEY || '' },
  ],
}).catch(err => console.error(err));

// AI Studio always uses an `index.tsx` file for all project types.
