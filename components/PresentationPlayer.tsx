
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, ChevronLeft, ChevronRight, Volume2, Maximize } from 'lucide-react';
import { SlideData, NarrationSegment } from '../types';

interface PresentationPlayerProps {
  slides: SlideData[];
  narrations: NarrationSegment[];
}

const PresentationPlayer: React.FC<PresentationPlayerProps> = ({ slides, narrations }) => {
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedAtRef = useRef<number>(0);

  const stopAudio = useCallback(() => {
    if (sourceNodeRef.current) {
      sourceNodeRef.current.stop();
      sourceNodeRef.current = null;
    }
  }, []);

  const playSlideAudio = useCallback((index: number, offset: number = 0) => {
    stopAudio();
    const narration = narrations.find(n => n.slideIndex === index);
    if (!narration?.audioBuffer) return;

    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    const source = audioContextRef.current.createBufferSource();
    source.buffer = narration.audioBuffer;
    source.connect(audioContextRef.current.destination);
    
    source.onended = () => {
      if (index < slides.length - 1 && isPlaying) {
        setCurrentSlideIndex(prev => prev + 1);
        setProgress(0);
      } else if (index === slides.length - 1) {
        setIsPlaying(false);
        setProgress(100);
      }
    };

    source.start(0, offset);
    sourceNodeRef.current = source;
    startTimeRef.current = audioContextRef.current.currentTime - offset;
  }, [narrations, slides.length, isPlaying, stopAudio]);

  useEffect(() => {
    if (isPlaying) {
      playSlideAudio(currentSlideIndex);
    } else {
      stopAudio();
    }
    return () => stopAudio();
  }, [isPlaying, currentSlideIndex, playSlideAudio, stopAudio]);

  // Update Progress Bar
  useEffect(() => {
    let frame: number;
    const update = () => {
      if (isPlaying && sourceNodeRef.current && sourceNodeRef.current.buffer) {
        const duration = sourceNodeRef.current.buffer.duration;
        const elapsed = audioContextRef.current!.currentTime - startTimeRef.current;
        setProgress(Math.min((elapsed / duration) * 100, 100));
      }
      frame = requestAnimationFrame(update);
    };
    update();
    return () => cancelAnimationFrame(frame);
  }, [isPlaying]);

  const handleNext = () => {
    if (currentSlideIndex < slides.length - 1) {
      setCurrentSlideIndex(prev => prev + 1);
      setProgress(0);
    }
  };

  const handlePrev = () => {
    if (currentSlideIndex > 0) {
      setCurrentSlideIndex(prev => prev - 1);
      setProgress(0);
    }
  };

  const currentSlide = slides[currentSlideIndex];
  const currentNarration = narrations.find(n => n.slideIndex === currentSlideIndex);

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 rounded-xl overflow-hidden shadow-xl aspect-video relative group">
        <img 
          src={currentSlide.image} 
          alt={`Slide ${currentSlideIndex + 1}`} 
          className="w-full h-full object-contain"
        />
        
        {/* Controls Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-4">
          <div className="flex flex-col gap-4">
            <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 transition-all duration-100" style={{ width: `${progress}%` }} />
            </div>
            <div className="flex items-center justify-between text-white">
              <div className="flex items-center gap-4">
                <button onClick={() => setIsPlaying(!isPlaying)} className="hover:text-blue-400 transition-colors">
                  {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
                </button>
                <div className="flex items-center gap-2">
                  <button onClick={handlePrev} className="hover:text-blue-400"><ChevronLeft size={24} /></button>
                  <span className="text-sm font-medium tabular-nums">{currentSlideIndex + 1} / {slides.length}</span>
                  <button onClick={handleNext} className="hover:text-blue-400"><ChevronRight size={24} /></button>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <Volume2 size={20} />
                <Maximize size={20} className="cursor-pointer hover:text-blue-400" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-slate-50 border border-slate-200 rounded-xl p-6">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Narration Script</h4>
          <p className="text-slate-800 leading-relaxed italic">
            "{currentNarration?.script || 'No script generated for this slide.'}"
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 overflow-y-auto max-h-[300px]">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Slide Content</h4>
          <div className="space-y-3">
             {slides.map((s, idx) => (
               <button 
                key={idx}
                onClick={() => { setCurrentSlideIndex(idx); setIsPlaying(false); }}
                className={`w-full text-left p-2 rounded-lg text-sm transition-colors border
                  ${currentSlideIndex === idx ? 'bg-blue-50 border-blue-200 text-blue-700 font-medium' : 'hover:bg-slate-50 border-transparent text-slate-600'}`}
               >
                 Slide {idx + 1}
               </button>
             ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PresentationPlayer;
