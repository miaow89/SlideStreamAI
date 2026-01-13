import React, { useState, useEffect, useRef } from 'react';
import { Video, Download, Key, X, Loader2, ServerOff, AlertCircle } from 'lucide-react';
import { AppState, SlideData, NarrationSegment, AppLanguage } from './types';
import { processPdf } from './services/pdf';
import { generateScripts, generateAudio, decodeAudioData } from './services/gemini';
import Dashboard from './components/Dashboard';
import PresentationPlayer from './components/PresentationPlayer';

const App: React.FC = () => {
  const [apiKey, setApiKey] = useState<string>(localStorage.getItem('GEMINI_API_KEY') || process.env.API_KEY || '');
  const [showKeyModal, setShowKeyModal] = useState<boolean>(false);
  const [tempKey, setTempKey] = useState<string>('');
  
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

  // For Browser Recording
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!apiKey) setShowKeyModal(true);
  }, [apiKey]);

  const handleSaveKey = () => {
    if (tempKey.trim()) {
      setApiKey(tempKey.trim());
      localStorage.setItem('GEMINI_API_KEY', tempKey.trim());
      setShowKeyModal(false);
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
    if (!apiKey) { setShowKeyModal(true); return; }
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

      if (allSlides.length === 0) throw new Error("유효한 슬라이드를 찾을 수 없습니다.");

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
        const audioData = await generateAudio(updatedNarrations[i].script, apiKey, voice);
        const buffer = await decodeAudioData(audioData, audioCtx);
        updatedNarrations[i].audioBuffer = buffer;
        
        setState(prev => ({ 
          ...prev, 
          narrations: [...updatedNarrations],
          progress: 60 + Math.floor(((i + 1) / updatedNarrations.length) * 35) 
        }));
      }

      setState(prev => ({ ...prev, step: 'ready', progress: 100 }));
    } catch (err: any) {
      console.error(err);
      setState(prev => ({ ...prev, step: 'idle', error: err.message || "생성 중 오류가 발생했습니다." }));
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

      const stream = canvas.captureStream(30); // 30 FPS
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

        // Draw slide
        const img = new Image();
        img.src = slide.image;
        await new Promise((res) => { img.onload = res; });
        
        ctx.fillStyle = '#0f172a'; // Slate-900
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
        const x = (canvas.width / 2) - (img.width / 2) * scale;
        const y = (canvas.height / 2) - (img.height / 2) * scale;
        ctx.drawImage(img, x, y, img.width * scale, img.height * scale);

        // Play audio segment
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
      setState(prev => ({ ...prev, error: "동영상 녹화 중 오류가 발생했습니다.", isExporting: false }));
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
            <button onClick={() => setShowKeyModal(true)} className="text-slate-500 hover:text-blue-600 flex items-center gap-1 text-sm font-medium">
              <Key size={14} /> API 키 설정
            </button>
            {state.step === 'ready' && (
              <button onClick={() => setState(prev => ({ ...prev, step: 'idle', files: [], error: null }))} className="text-sm font-medium text-slate-500 hover:text-slate-900">
                새로 만들기
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
              <div className="text-sm">
                <p className="font-bold text-lg mb-1">문제가 발생했습니다</p>
                <p className="leading-relaxed text-red-600/80">{state.error}</p>
              </div>
            </div>
          </div>
        )}

        {state.step === 'ready' ? (
          <div className="max-w-4xl mx-auto space-y-6">
             <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-6">
                <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
                  <div>
                    <h2 className="text-2xl font-bold">프레젠테이션 미리보기</h2>
                    <p className="text-slate-500 text-sm">슬라이드와 AI 음성을 확인하고 동영상으로 내보내세요.</p>
                  </div>
                  <button 
                    onClick={handleExportBrowser}
                    disabled={state.isExporting}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white px-6 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-blue-500/20"
                  >
                    {state.isExporting ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                    {state.isExporting ? `동영상 녹화 중 (${state.progress}%)` : "동영상 저장 (.webm)"}
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
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold flex items-center gap-2"><Key className="text-blue-600" size={20} /> Gemini API 키 입력</h3>
              <button onClick={() => setShowKeyModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <p className="text-sm text-slate-500 mb-4">Gemini 2.5 및 3 모델을 사용하기 위한 API 키가 필요합니다.</p>
            <input 
              type="password"
              placeholder="API 키를 입력하세요"
              value={tempKey}
              onChange={(e) => setTempKey(e.target.value)}
              className="w-full px-4 py-3 border border-slate-200 rounded-lg mb-4 focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <button onClick={handleSaveKey} className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors">저장 및 계속하기</button>
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
            <h3 className="text-xl font-bold mb-2">{state.isExporting ? "동영상 인코딩 중" : "프레젠테이션 제작 중"}</h3>
            <p className="text-slate-500 text-sm leading-relaxed">
              {state.isExporting 
                ? "브라우저에서 직접 슬라이드를 녹화하고 있습니다. 탭을 끄지 마세요." 
                : "AI가 슬라이드를 분석하고 음성을 생성하고 있습니다."}
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