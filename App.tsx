
import React, { useState, useCallback } from 'react';
import { Upload, Play, Clock, MessageSquare, CheckCircle2, Loader2, Video, Download, AlertCircle } from 'lucide-react';
import { AppState, ProcessingStep, SlideData, NarrationSegment, AppLanguage } from './types';
import { processPdf } from './services/pdf';
import { generateScripts, generateAudio, decodeAudioData } from './services/gemini';
import { audioBufferToWav, blobToBase64 } from './services/audioUtils';
import Dashboard from './components/Dashboard';
import PresentationPlayer from './components/PresentationPlayer';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    files: [],
    duration: 60, // Default 60 seconds
    style: 'An atmospheric tone that reveals the truth',
    language: 'ko', // Default to Korean
    slides: [],
    narrations: [],
    step: 'idle',
    isExporting: false,
    progress: 0,
    error: null,
  });

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleStartGeneration = async () => {
    if (state.files.length === 0) return;

    try {
      setState(prev => ({ ...prev, step: 'parsing', progress: 10, error: null }));
      
      let allSlides: SlideData[] = [];
      let slideCounter = 0;

      for (const file of state.files) {
        if (file.type === 'application/pdf') {
          const pdfSlides = await processPdf(file);
          const mappedPdfSlides = pdfSlides.map(s => ({
            ...s,
            index: slideCounter++
          }));
          allSlides = [...allSlides, ...mappedPdfSlides];
        } else if (file.type.startsWith('image/')) {
          const base64 = await fileToBase64(file);
          allSlides.push({
            index: slideCounter++,
            image: base64,
            text: `Image file: ${file.name}`
          });
        }
      }

      if (allSlides.length === 0) throw new Error("No valid slides found in uploaded files.");

      setState(prev => ({ ...prev, slides: allSlides, step: 'scripting', progress: 30 }));

      const scriptItems = await generateScripts(allSlides, state.duration, state.style, state.language);
      const narrations: NarrationSegment[] = scriptItems.map(item => ({
        slideIndex: item.slideIndex,
        script: item.script,
      }));
      setState(prev => ({ ...prev, narrations, step: 'voicing', progress: 60 }));

      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const updatedNarrations = [...narrations];
      const voice = state.language === 'ko' ? 'Kore' : 'Zephyr';

      for (let i = 0; i < updatedNarrations.length; i++) {
        const audioData = await generateAudio(updatedNarrations[i].script, voice);
        const buffer = await decodeAudioData(audioData, audioCtx);
        updatedNarrations[i].audioBuffer = buffer;
        
        setState(prev => ({ 
          ...prev, 
          narrations: [...updatedNarrations],
          progress: 60 + Math.floor((i / updatedNarrations.length) * 35) 
        }));
      }

      setState(prev => ({ ...prev, step: 'ready', progress: 100 }));
    } catch (err: any) {
      console.error(err);
      setState(prev => ({ ...prev, step: 'idle', error: err.message || "An unexpected error occurred." }));
    }
  };

  const handleExport = async () => {
    if (state.slides.length === 0 || state.narrations.length === 0) return;

    setState(prev => ({ ...prev, isExporting: true, error: null }));

    try {
      const payloadSlides = [];
      
      for (let i = 0; i < state.slides.length; i++) {
        const slide = state.slides[i];
        const narration = state.narrations.find(n => n.slideIndex === slide.index);
        
        if (!narration?.audioBuffer) continue;

        const wavBlob = audioBufferToWav(narration.audioBuffer);
        const audioBase64 = await blobToBase64(wavBlob);

        payloadSlides.push({
          image_base64: slide.image,
          audio_base64: audioBase64
        });
      }

      const response = await fetch('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slides: payloadSlides })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to generate video on server.");
      }

      const videoBlob = await response.blob();
      const url = window.URL.createObjectURL(videoBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Presentation_${new Date().getTime()}.mp4`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

    } catch (err: any) {
      console.error("Export Error:", err);
      setState(prev => ({ ...prev, error: `Export failed: ${err.message}` }));
    } finally {
      setState(prev => ({ ...prev, isExporting: false }));
    }
  };

  const handleReset = () => {
    setState({
      files: [],
      duration: 60,
      style: 'An atmospheric tone that reveals the truth',
      language: 'ko',
      slides: [],
      narrations: [],
      step: 'idle',
      isExporting: false,
      progress: 0,
      error: null,
    });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-2 rounded-lg">
              <Video className="text-white" size={20} />
            </div>
            <h1 className="text-xl font-bold text-slate-900">SlideStream AI</h1>
          </div>
          {state.step === 'ready' && (
            <button 
              onClick={handleReset}
              className="text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors"
            >
              Start New Project
            </button>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {state.step === 'ready' ? (
          <div className="max-w-4xl mx-auto space-y-6">
             <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-2xl font-bold">Your AI Presentation</h2>
                    <p className="text-slate-500">Ready for preview and review</p>
                  </div>
                  <button 
                    onClick={handleExport}
                    disabled={state.isExporting}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-md"
                  >
                    {state.isExporting ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <Download size={18} />
                    )}
                    {state.isExporting ? 'Exporting...' : 'Export MP4'}
                  </button>
                </div>

                {state.error && (
                  <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-700">
                    <AlertCircle className="shrink-0 mt-0.5" size={18} />
                    <p className="text-sm">{state.error}</p>
                  </div>
                )}

                <PresentationPlayer slides={state.slides} narrations={state.narrations} />
             </div>
          </div>
        ) : (
          <Dashboard 
            state={state} 
            onFilesChange={(files) => setState(prev => ({ ...prev, files: Array.from(files) }))}
            onDurationChange={(duration) => setState(prev => ({ ...prev, duration }))}
            onStyleChange={(style) => setState(prev => ({ ...prev, style }))}
            onLanguageChange={(language) => setState(prev => ({ ...prev, language }))}
            onGenerate={handleStartGeneration}
          />
        )}
      </main>

      {/* Progress & Export Overlay */}
      {(state.step !== 'idle' && state.step !== 'ready' || state.isExporting) && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
            <div className="flex flex-col items-center text-center">
              <div className="relative mb-6">
                <Loader2 className="w-16 h-16 text-blue-600 animate-spin" />
                {!state.isExporting && (
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-blue-600">
                    {state.progress}%
                  </span>
                )}
              </div>
              <h3 className="text-xl font-bold mb-2">
                {state.isExporting ? 'Rendering MP4...' : (
                  <>
                    {state.step === 'parsing' && 'Processing Files...'}
                    {state.step === 'scripting' && 'Writing Script...'}
                    {state.step === 'voicing' && 'Generating Voiceovers...'}
                  </>
                )}
              </h3>
              <p className="text-slate-500 mb-6 text-sm">
                {state.isExporting 
                  ? 'Stitching your presentation into a high-quality video file. This may take a minute.'
                  : 'Our AI is currently processing your presentation elements.'}
              </p>
              {!state.isExporting && (
                <div className="w-full bg-slate-100 rounded-full h-2 mb-4">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-500" 
                    style={{ width: `${state.progress}%` }}
                  />
                </div>
              )}
              {state.isExporting && (
                 <div className="w-full h-2 bg-blue-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-600 animate-[shimmer_2s_infinite] w-full" style={{
                      backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.4) 50%, rgba(255,255,255,0) 100%)',
                      backgroundSize: '200% 100%'
                    }} />
                 </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
