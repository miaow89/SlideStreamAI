
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

export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:3';

export type ResolutionScale = 1 | 2 | 3 | 4;

export interface AppState {
  files: File[];
  duration: number; // seconds
  style: string;
  language: AppLanguage;
  aspectRatio: AspectRatio;
  resolutionScale: ResolutionScale;
  slides: SlideData[];
  narrations: NarrationSegment[];
  step: ProcessingStep;
  isExporting: boolean;
  progress: number;
  error: string | null;
}
