
import React from 'react';
import { Upload, Clock, MessageSquare, AlertCircle, Globe, FileText, Image as ImageIcon } from 'lucide-react';
import { AppState, AppLanguage } from '../types';

interface DashboardProps {
  state: AppState;
  onFilesChange: (files: FileList) => void;
  onDurationChange: (duration: number) => void;
  onStyleChange: (style: string) => void;
  onLanguageChange: (lang: AppLanguage) => void;
  onGenerate: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ 
  state, 
  onFilesChange, 
  onDurationChange, 
  onStyleChange,
  onLanguageChange,
  onGenerate 
}) => {
  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFilesChange(e.dataTransfer.files);
    }
  };

  return (
    <div className="grid lg:grid-cols-2 gap-8 items-start">
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 mb-2">Create high-quality video presentations</h2>
          <p className="text-lg text-slate-600">Upload PDF slides or images and let AI generate a professional voiceover and video for you.</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
          {/* File Upload */}
          <div 
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleFileDrop}
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer
              ${state.files.length > 0 ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-blue-400'}`}
          >
            <input 
              type="file" 
              accept=".pdf, image/*" 
              multiple
              className="hidden" 
              id="file-upload" 
              onChange={(e) => e.target.files && onFilesChange(e.target.files)}
            />
            <label htmlFor="file-upload" className="cursor-pointer">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Upload className="text-blue-600" size={24} />
              </div>
              <div className="text-sm font-semibold text-slate-900">
                {state.files.length > 0 ? (
                  <div className="flex flex-col items-center gap-1">
                    <span>{state.files.length} file(s) selected</span>
                    <div className="flex gap-2 text-xs font-normal text-slate-500 overflow-hidden max-w-[250px] whitespace-nowrap text-ellipsis">
                      {state.files.slice(0, 3).map(f => f.name).join(', ')}
                      {state.files.length > 3 && '...'}
                    </div>
                  </div>
                ) : 'Click to upload or drag PDF/Images'}
              </div>
              <p className="text-xs text-slate-500 mt-1">Accepts PDF, JPG, PNG, WEBP</p>
            </label>
          </div>

          {/* Configuration Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Clock size={16} className="text-slate-400" />
                Target Duration (seconds)
              </label>
              <input 
                type="number" 
                min="10" 
                max="1800"
                value={state.duration}
                onChange={(e) => onDurationChange(Number(e.target.value))}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
              />
              <p className="text-[10px] text-slate-400">Total duration of the narrated presentation.</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Globe size={16} className="text-slate-400" />
                Narrator Language
              </label>
              <select 
                value={state.language}
                onChange={(e) => onLanguageChange(e.target.value as AppLanguage)}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none appearance-none"
              >
                <option value="ko">한국어 (Korean)</option>
                <option value="en">English (US)</option>
              </select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <MessageSquare size={16} className="text-slate-400" />
                Tone Preset
              </label>
              <select 
                value={state.style}
                onChange={(e) => onStyleChange(e.target.value)}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none appearance-none"
              >
                <option>An atmospheric tone that reveals the truth</option>
                <option>Professional and authoritative</option>
                <option>Energetic and motivational</option>
                <option>Educational and clear</option>
                <option>Storytelling and conversational</option>
                <option>Minimalist and direct</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Additional Custom Voice Instructions</label>
            <textarea 
              rows={3}
              placeholder="e.g., Speak like a visionary tech leader. Slow down on technical explanations."
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none resize-none"
              onChange={(e) => onStyleChange(e.target.value)}
            />
          </div>

          {state.error && (
            <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-700">
              <AlertCircle className="shrink-0 mt-0.5" size={18} />
              <p className="text-sm">{state.error}</p>
            </div>
          )}

          <button 
            disabled={state.files.length === 0}
            onClick={onGenerate}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold rounded-xl shadow-lg shadow-blue-500/25 transition-all flex items-center justify-center gap-2 text-lg"
          >
            Generate Video Presentation
          </button>
        </div>
      </div>

      <div className="hidden lg:block bg-slate-900 rounded-3xl overflow-hidden aspect-video relative shadow-2xl">
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-12">
          <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mb-6">
            <div className="flex gap-1">
               <FileText className="text-slate-400" size={24} />
               <ImageIcon className="text-slate-400" size={24} />
            </div>
          </div>
          <h3 className="text-white text-xl font-bold mb-2">Real-time Preview</h3>
          <p className="text-slate-400">Your generated presentation video will appear here. Upload files to get started.</p>
        </div>
        <div className="absolute bottom-6 left-6 right-6 h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div className="h-full w-1/3 bg-blue-600/50" />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
