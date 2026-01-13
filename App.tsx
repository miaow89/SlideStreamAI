
import React, { useState, useCallback } from 'react';
import { Upload, Play, Clock, MessageSquare, CheckCircle2, Loader2, Video, Download, AlertCircle, ExternalLink } from 'lucide-react';
import { AppState, ProcessingStep, SlideData, NarrationSegment, AppLanguage } from './types';
import { processPdf } from './services/pdf';
import { generateScripts, generateAudio, decodeAudioData } from './services/gemini';
import { audioBufferToWav, blobToBase64 } from './services/audioUtils';
import Dashboard from './components/Dashboard';
import PresentationPlayer from './components/PresentationPlayer';

const App: React.FC = () => {
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

  // 백엔드 서버 URL 설정 (GitHub Pages 사용 시 Render나 Railway 주소를 여기에 적으세요)
  const BACKEND_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:8000' 
    : 'https://your-backend-service.onrender.com'; // 실제 배포한 백엔드 주소로 변경 필요

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
          allSlides = [...allSlides, ...pdfSlides.map(s => ({ ...s, index: slideCounter++ }))];
        } else if (file.type.startsWith('image/')) {
          const base64 = await fileToBase64(file);
          allSlides.push({ index: slideCounter++, image: base64, text: `Image: ${file.name}` });
        }
      }

      if (allSlides.length === 0) throw new Error("No valid slides found.");

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
          progress: 60 + Math.floor(((i + 1) / updatedNarrations.length) * 35) 
        }));
      }

      setState(prev => ({ ...prev, step: 'ready', progress: 100 }));
    } catch (err: any) {
      console.error(err);
      setState(prev => ({ ...prev, step: 'idle', error: err.message || "An error occurred during generation." }));
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
        payloadSlides.push({ image_base64: slide.image, audio_base64: audioBase64 });
      }

      const response = await fetch(`${BACKEND_URL}/api/generate-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slides: payloadSlides })
      });

      if (!response.ok) {
        throw new Error("비디오 생성 서버에 연결할 수 없습니다. 백엔드 서버(Render 등)가 실행 중인지 확인하세요.");
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
      setState(prev => ({ 
        ...prev, 
        error: `MP4 내보내기 실패: ${err.message}. 팁: 정적 사이트(GitHub Pages)에서는 별도의 백엔드 서버가 필요합니다.` 
      }));
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
              새로 만들기
            </button>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {state.step === 'ready' ? (
          <div className="max-w-4xl mx-auto space-y-6">
             <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-6">
                <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
                  <div>
                    <h2 className="text-2xl font-bold">프레젠테이션 미리보기</h2>
                    <p className="text-slate-500 text-sm">슬라이드와 AI 음성을 확인하고 MP4로 내보내세요.</p>
                  </div>
                  <button 
                    onClick={handleExport}
                    disabled={state.isExporting}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white px-6 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-blue-500/20 active:scale-95"
                  >
                    {state.isExporting ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                    {state.isExporting ? '인코딩 중...' : 'MP4 내보내기'}
                  </button>
                </div>

                {state.error && (
                  <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-700">
                    <AlertCircle className="shrink-0 mt-0.5" size={18} />
                    <div className="text-sm">
                      <p className="font-bold">알림</p>
                      <p>{state.error}</p>
                    </div>
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

      {/* 로딩 오버레이 */}
      {(state.step !== 'idle' && state.step !== 'ready' || state.isExporting) && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-white/20">
            <div className="flex flex-col items-center text-center">
              <div className="relative mb-8">
                <div className="w-20 h-20 border-4 border-blue-100 rounded-full animate-pulse"></div>
                <Loader2 className="w-10 h-10 text-blue-600 animate-spin absolute top-1/2 left-1/2 -mt-5 -ml-5" />
                {!state.isExporting && (
                  <div className="absolute -bottom-2 bg-blue-600 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">
                    {state.progress}%
                  </div>
                )}
              </div>
              <h3 className="text-2xl font-black mb-3 text-slate-900">
                {state.isExporting ? '동영상 렌더링 중' : '프레젠테이션 제작 중'}
              </h3>
              <p className="text-slate-500 mb-8 text-sm leading-relaxed">
                {state.isExporting 
                  ? '슬라이드와 오디오를 합쳐 MP4 파일을 만들고 있습니다. 이 작업은 서버 성능에 따라 최대 1분 정도 소요될 수 있습니다.'
                  : 'AI가 슬라이드를 분석하고 대본과 음성을 생성하고 있습니다.'}
              </p>
              
              <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden relative">
                {state.isExporting ? (
                  <div className="h-full bg-blue-600 animate-[shimmer_2s_infinite] w-full" style={{
                    backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.4) 50%, rgba(255,255,255,0) 100%)',
                    backgroundSize: '200% 100%'
                  }} />
                ) : (
                  <div className="h-full bg-blue-600 transition-all duration-500 ease-out" style={{ width: `${state.progress}%` }} />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
};

export default App;
