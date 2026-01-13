
import React, { useState, useEffect, useRef } from 'react';
import { Video, Download, Key, X, Loader2, ShieldCheck, ShieldAlert, AlertCircle, ExternalLink } from 'lucide-react';
import { AppState, SlideData, NarrationSegment, AppLanguage } from './types';
import { processPdf } from './services/pdf';
import { generateScripts, generateAudio, decodeAudioData, validateApiKey } from './services/gemini';
import Dashboard from './components/Dashboard';
import PresentationPlayer from './components/PresentationPlayer';

// Fix: Define the aistudio property directly on the global Window interface to prevent type mismatch and modifier errors.
declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

const App: React.FC = () => {
  const [isKeyValidated, setIsKeyValidated] = useState<boolean>(false);
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [showKeyModal, setShowKeyModal] = useState<boolean>(false);
  
  const [state, setState] = useState<AppState>({
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

  const checkAndValidateKey = async () => {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      setShowKeyModal(true);
      return;
    }

    setIsValidating(true);
    try {
      const isValid = await validateApiKey(apiKey);
      setIsKeyValidated(isValid);
      if (isValid) {
        setShowKeyModal(false);
      } else {
        setShowKeyModal(true);
      }
    } catch (err: any) {
      setIsKeyValidated(false);
      setShowKeyModal(true);
    } finally {
      setIsValidating(false);
    }
  };

  useEffect(() => {
    checkAndValidateKey();
  }, []);

  const handleOpenKeySelector = async () => {
    if (window.aistudio) {
      try {
        await window.aistudio.openSelectKey();
        // Proceed as if successful per guidelines to mitigate race condition
        setIsKeyValidated(true);
        setShowKeyModal(false);
        // Verify key in background
        checkAndValidateKey();
      } catch (e) {
        console.error("Key selection failed", e);
      }
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleStartGeneration = async () => {
    const apiKey = process.env.API_KEY;
    if (!apiKey || !isKeyValidated) {
      setShowKeyModal(true);
      return;
    }
    if (state.files.length === 0) return;

    try {
      setState(prev => ({ ...prev, step: 'parsing', progress: 10, error: null }));
      
      let allSlides: SlideData[] = [];
      let slideCounter = 0;

      for (const file of state.files) {
        if (file.type === 'application/pdf') {
          const pdfSlides = await processPdf(file);
          allSlides = [...allSlides, ...pdfSlides.map(s => ({ ...s, index: slideCounter++ }))];
        } else if (file.type.startsWith('image/')) {
          const base64 = await fileToBase64(file);
          allSlides.push({ index: slideCounter++, image: base64, text: `Image: ${file.name}` });
        }
      }

      if (allSlides.length === 0) throw new Error("No valid slides found in uploaded files.");

      setState(prev => ({ ...prev, slides: allSlides, step: 'scripting', progress: 30 }));

      const scriptItems = await generateScripts(allSlides, state.duration, state.style, state.language, apiKey);
      const narrations: NarrationSegment[] = scriptItems.map(item => ({
        slideIndex: item.slideIndex,
        script: item.script,
      }));
      
      setState(prev => ({ ...prev, narrations, step: 'voicing', progress: 60 }));

      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const updatedNarrations = [...narrations];
      const voice = state.language === 'ko' ? 'Kore' : 'Zephyr';

      for (let i = 0; i < updatedNarrations.length; i++) {
        try {
          const audioData = await generateAudio(updatedNarrations[i].script, apiKey, voice);
          const buffer = await decodeAudioData(audioData, audioCtx);
          updatedNarrations[i].audioBuffer = buffer;
          
          setState(prev => ({ 
            ...prev, 
            narrations: [...updatedNarrations],
            progress: 60 + Math.floor(((i + 1) / updatedNarrations.length) * 35) 
          }));
        } catch (audioErr) {
          console.error(`Failed to generate audio for slide ${i}`, audioErr);
        }
      }

      setState(prev => ({ ...prev, step: 'ready', progress: 100 }));
    } catch (err: any) {
      console.error(err);
      const errorMsg = err.message || "An unexpected error occurred during generation.";
      if (errorMsg.includes("Requested entity was not found")) {
        setIsKeyValidated(false);
        setShowKeyModal(true);
      }
      setState(prev => ({ ...prev, step: 'idle', error: errorMsg }));
    }
  };

  const handleExportBrowser = async () => {
    if (state.slides.length === 0 || state.narrations.length === 0) return;
    setState(prev => ({ ...prev, isExporting: true, progress: 0 }));

    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const dest = audioCtx.createMediaStreamDestination();
      
      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error("Canvas context failed");

      const stream = canvas.captureStream(30); 
      stream.addTrack(dest.stream.getAudioTracks()[0]);

      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9,opus' });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `SlideStream_${new Date().getTime()}.webm`;
        a.click();
        setState(prev => ({ ...prev, isExporting: false }));
      };

      recorder.start();

      for (let i = 0; i < state.slides.length; i++) {
        const slide = state.slides[i];
        const narration = state.narrations.find(n => n.slideIndex === slide.index);
        if (!narration?.audioBuffer) continue;

        setState(prev => ({ ...prev, progress: Math.floor((i / state.slides.length) * 100) }));

        const img = new Image();
        img.src = slide.image;
        await new Promise((res) => { img.onload = res; });
        
        ctx.fillStyle = '#0f172a'; 
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
        const x = (canvas.width / 2) - (img.width / 2) * scale;
        const y = (canvas.height / 2) - (img.height / 2) * scale;
        ctx.drawImage(img, x, y, img.width * scale, img.height * scale);

        const source = audioCtx.createBufferSource();
        source.buffer = narration.audioBuffer;
        source.connect(dest);
        source.connect(audioCtx.destination);
        
        const playPromise = new Promise((res) => { source.onended = res; });
        source.start();
        await playPromise;
      }

      recorder.stop();
    } catch (err: any) {
      console.error(err);
      setState(prev => ({ ...prev, error: "Failed to record video presentation.", isExporting: false }));
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-2 rounded-lg"><Video className="text-white" size={20} /></div>
            <h1 className="text-xl font-bold text-slate-900">SlideStream AI</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${isKeyValidated ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
              {isValidating ? <Loader2 size={14} className="animate-spin" /> : (isKeyValidated ? <ShieldCheck size={14} /> : <ShieldAlert size={14} />)}
              {isValidating ? 'Validating...' : (isKeyValidated ? 'Connected' : 'Key Error')}
            </div>
            <button onClick={() => setShowKeyModal(true)} className="text-slate-500 hover:text-blue-600 flex items-center gap-1 text-sm font-medium">
              <Key size={14} /> API Key Setup
            </button>
            {state.step === 'ready' && (
              <button onClick={() => setState(prev => ({ ...prev, step: 'idle', files: [], error: null }))} className="text-sm font-medium text-slate-500 hover:text-slate-900">
                New Project
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {state.error && (
          <div className="mb-6 max-w-4xl mx-auto p-6 bg-red-50 border border-red-100 rounded-3xl flex flex-col gap-4 text-red-700 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="bg-red-100 p-2 rounded-xl"><AlertCircle className="text-red-600" size={24} /></div>
              <div className="text-sm flex-1">
                <p className="font-bold text-lg mb-1">Error Detected</p>
                <p className="leading-relaxed text-red-600/80">{state.error}</p>
                {!isKeyValidated && !isValidating && (
                  <button onClick={() => setShowKeyModal(true)} className="mt-2 text-xs font-bold text-red-500 underline flex items-center gap-1">
                    Reconfigure API Key <Key size={12} />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {state.step === 'ready' ? (
          <div className="max-w-4xl mx-auto space-y-6">
             <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-6">
                <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
                  <div>
                    <h2 className="text-2xl font-bold">Presentation Preview</h2>
                    <p className="text-slate-500 text-sm">Review slides and narration before exporting.</p>
                  </div>
                  <button 
                    onClick={handleExportBrowser}
                    disabled={state.isExporting}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white px-6 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-blue-500/20"
                  >
                    {state.isExporting ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                    {state.isExporting ? `Encoding Video (${state.progress}%)` : "Export as .webm"}
                  </button>
                </div>
                <PresentationPlayer slides={state.slides} narrations={state.narrations} />
             </div>
          </div>
        ) : (
          <Dashboard 
            state={state} 
            onFilesChange={(files) => setState(prev => ({ ...prev, files: Array.from(files), error: null }))}
            onDurationChange={(duration) => setState(prev => ({ ...prev, duration }))}
            onStyleChange={(style) => setState(prev => ({ ...prev, style }))}
            onLanguageChange={(language) => setState(prev => ({ ...prev, language }))}
            onGenerate={handleStartGeneration}
          />
        )}
      </main>

      {showKeyModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <div className="bg-blue-50 p-3 rounded-2xl">
                <Key className="text-blue-600" size={28} />
              </div>
              <button onClick={() => setShowKeyModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors p-2 hover:bg-slate-100 rounded-full">
                <X size={24} />
              </button>
            </div>
            
            <h3 className="text-2xl font-bold text-slate-900 mb-3">API Key Required</h3>
            <p className="text-slate-600 mb-6 leading-relaxed">
              To use SlideStream AI, you must select an API key from a <strong>paid Google Cloud project</strong>.
            </p>

            <div className="space-y-4">
              <button 
                onClick={handleOpenKeySelector}
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl shadow-xl shadow-blue-500/25 transition-all flex items-center justify-center gap-3 text-lg"
              >
                <Key size={20} />
                Select API Key
              </button>
              
              <a 
                href="https://ai.google.dev/gemini-api/docs/billing" 
                target="_blank" 
                rel="noopener noreferrer"
                className="w-full py-4 bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold rounded-2xl transition-all flex items-center justify-center gap-2 border border-slate-200"
              >
                <ExternalLink size={18} />
                Billing Documentation
              </a>
            </div>
          </div>
        </div>
      )}

      {(state.step !== 'idle' && state.step !== 'ready' || state.isExporting) && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl flex flex-col items-center text-center">
            <div className="relative mb-6">
              <Loader2 className="w-16 h-16 text-blue-600 animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center font-bold text-xs text-blue-600">
                {state.progress}%
              </div>
            </div>
            <h3 className="text-xl font-bold mb-2">{state.isExporting ? "Encoding Video" : "Processing Presentation"}</h3>
            <p className="text-slate-500 text-sm leading-relaxed">
              {state.isExporting 
                ? "Recording slides directly in the browser. Please keep this tab active." 
                : "AI is analyzing slides and generating narration audio."}
            </p>
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mt-6">
              <div className="h-full bg-blue-600 transition-all duration-500" style={{ width: `${state.progress}%` }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
