
export interface SlideData {
  index: number;
  image: string; // Base64
  text: string;
}

export interface NarrationSegment {
  slideIndex: number;
  script: string;
  audioBuffer?: AudioBuffer;
}

export type ProcessingStep = 'idle' | 'parsing' | 'scripting' | 'voicing' | 'ready';

export type AppLanguage = 'en' | 'ko';

export interface AppState {
  files: File[];
  duration: number; // seconds
  style: string;
  language: AppLanguage;
  slides: SlideData[];
  narrations: NarrationSegment[];
  step: ProcessingStep;
  isExporting: boolean;
  progress: number;
  error: string | null;
}
