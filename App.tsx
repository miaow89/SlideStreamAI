
import React, { useState, useEffect, useCallback } from 'react';
import { Upload, Play, Clock, MessageSquare, CheckCircle2, Loader2, Video, Download, AlertCircle, ExternalLink, Key, X } from 'lucide-react';
import { AppState, ProcessingStep, SlideData, NarrationSegment, AppLanguage } from './types';
import { processPdf } from './services/pdf';
import { generateScripts, generateAudio, decodeAudioData } from './services/gemini';
import { audioBufferToWav, blobToBase64 } from './services/audioUtils';
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

  useEffect(() => {
    if (!apiKey) {
      setShowKeyModal(true);
    }
  }, [apiKey]);

  const handleSaveKey = () => {
    if (tempKey.trim()) {
      setApiKey(tempKey.trim());
      localStorage.setItem('GEMINI_API_KEY', tempKey.trim());
      setShowKeyModal(false);
    }
  };

  // 로컬 호스트인 경우 8000번 포트 사용, 아닌 경우 실제 배포된 백엔드 URL 사용
  const BACKEND_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:8000' 
    : 'https://slidestream-backend.onrender.com'; // 사용자의 실제 백엔드 주소로 변경 필요

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleStartGeneration = async () => {
    if (!apiKey) {
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

  const handleExport = async () => {
    if (state.slides.length === 0 || state.narrations.length === 0) return;
    
    // 기본 플레이스홀더 주소인 경우 경고
    if (BACKEND_URL.includes('your-backend-service')) {
      setState(prev => ({ ...prev, error: "백엔드 서버 주소가 설정되지 않았습니다. 로컬에서 실행 중이라면 python backend/main.py를 실행하세요." }));
      return;
    }

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

      const response = await fetch(`${BACKEND_URL}/api/generate-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slides: payloadSlides })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: "서버 응답 오류" }));
        throw new Error(errorData.detail || "동영상 생성 실패");
      }

      const videoBlob = await response.blob();
      const url = window.URL.createObjectURL(videoBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `SlideStream_${new Date().getTime()}.mp4`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      console.error(err);
      setState(prev => ({ ...prev, error: `내보내기 실패: ${err.message}. 백엔드 서버가 실행 중인지 확인하세요.` }));
    } finally {
      setState(prev => ({ ...prev, isExporting: false }));
    }
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
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setShowKeyModal(true)}
              className="text-slate-500 hover:text-blue-600 flex items-center gap-1 text-sm font-medium"
            >
              <Key size={14} />
              API 키 설정
            </button>
            {state.step === 'ready' && (
              <button 
                onClick={() => setState(prev => ({ ...prev, step: 'idle', files: [], error: null }))}
                className="text-sm font-medium text-slate-500 hover:text-slate-900"
              >
                새로 만들기
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {state.error && (
          <div className="mb-6 max-w-4xl mx-auto p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-700">
            <AlertCircle className="shrink-0 mt-0.5" size={18} />
            <div className="text-sm">
              <p className="font-bold">오류 발생</p>
              <p>{state.error}</p>
            </div>
          </div>
        )}

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
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white px-6 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-blue-500/20"
                  >
                    {state.isExporting ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                    {state.isExporting ? "동영상 인코딩 중..." : "MP4 내보내기"}
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

      {/* API 키 모달 */}
      {showKeyModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Key className="text-blue-600" size={20} />
                Gemini API 키 입력
              </h3>
              <button onClick={() => setShowKeyModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <p className="text-sm text-slate-500 mb-4 leading-relaxed">
              이 앱을 사용하려면 Google Gemini API 키가 필요합니다. 키가 없다면 아래 링크에서 무료로 발급받으실 수 있습니다.
            </p>
            <a 
              href="https://aistudio.google.com/app/api-keys?hl=ko" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline text-sm flex items-center gap-1 mb-6"
            >
              Gemini API 키 발급받기 (무료)
              <ExternalLink size={14} />
            </a>
            <input 
              type="password"
              placeholder="API 키를 입력하세요"
              value={tempKey}
              onChange={(e) => setTempKey(e.target.value)}
              className="w-full px-4 py-2 border border-slate-200 rounded-lg mb-4 focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <button 
              onClick={handleSaveKey}
              className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors"
            >
              저장 및 시작하기
            </button>
          </div>
        </div>
      )}

      {/* 로딩 오버레이 */}
      {(state.step !== 'idle' && state.step !== 'ready' || state.isExporting) && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl flex flex-col items-center text-center">
            <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
            <h3 className="text-xl font-bold mb-2">
              {state.isExporting ? "동영상 파일 생성 중" : "프레젠테이션 제작 중"}
            </h3>
            <p className="text-slate-500 text-sm mb-6">
              {state.isExporting 
                ? "서버에서 고화질 MP4 파일을 합성하고 있습니다. 슬라이드 수에 따라 1~3분 정도 소요될 수 있습니다." 
                : "AI가 슬라이드를 분석하고 음성을 생성하고 있습니다. 잠시만 기다려 주세요."}
            </p>
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
              <div 
                className={`h-full bg-blue-600 transition-all duration-500 ${state.isExporting ? 'animate-pulse' : ''}`} 
                style={{ width: state.isExporting ? '100%' : `${state.progress}%` }} 
              />
            </div>
            {state.isExporting && <p className="mt-4 text-xs text-blue-600 font-medium">인코딩 중에는 창을 닫지 마세요...</p>}
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
