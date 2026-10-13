import React, { useState } from 'react';
import { BOT_CODE_FILES } from '../bot/codeFiles';
import { Copy, Check, FileCode2, Terminal } from 'lucide-react';

export const CodeViewer: React.FC = () => {
  const [selectedFileId, setSelectedFileId] = useState<string>('strategy');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const currentFile =
    BOT_CODE_FILES.find((f) => f.id === selectedFileId) || BOT_CODE_FILES[0];

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="bg-slate-900/90 rounded-2xl border border-slate-800/80 shadow-2xl overflow-hidden backdrop-blur-md">
      {/* File Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-950/80 border-b border-slate-800">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {BOT_CODE_FILES.map((file) => {
            const isSelected = file.id === currentFile.id;
            return (
              <button
                key={file.id}
                onClick={() => setSelectedFileId(file.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all ${
                  isSelected
                    ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-transparent'
                }`}
              >
                <FileCode2 className="w-3.5 h-3.5 text-cyan-400" />
                <span>{file.name}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleCopy(currentFile.id, currentFile.code)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/40 text-xs font-sans font-semibold transition-all"
          >
            {copiedId === currentFile.id ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            <span>{copiedId === currentFile.id ? 'تم نسخ الملف بالكامل!' : 'نسخ الكود المصدري'}</span>
          </button>
        </div>
      </div>

      {/* File Details & Arabic Annotation Banner */}
      <div className="p-3.5 bg-slate-900/60 border-b border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="text-xs text-slate-300">
          <span className="font-bold text-cyan-400 ml-1.5">شرح الملف:</span>
          {currentFile.descriptionArabic}
        </div>
        <div className="text-[11px] font-mono text-slate-500 flex items-center gap-1.5 shrink-0" dir="ltr">
          <Terminal className="w-3 h-3 text-slate-500" />
          <span>{currentFile.path}</span>
        </div>
      </div>

      {/* Code Editor Container */}
      <div className="relative" dir="ltr">
        <pre className="p-4 bg-slate-950 font-mono text-xs leading-relaxed text-slate-200 overflow-x-auto max-h-[580px] select-all text-left">
          <code>{currentFile.code}</code>
        </pre>
      </div>

      {/* Bottom Command Hint */}
      <div className="p-3 bg-slate-950/90 border-t border-slate-800 flex flex-wrap items-center justify-between text-xs text-slate-400 gap-2">
        <div className="flex items-center gap-2">
          <span>أمر التشغيل المباشر في بيئة Node/TypeScript:</span>
          <code className="text-cyan-300 font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-800" dir="ltr">
            npx tsx src/bot/sampleRunner.ts
          </code>
        </div>
        <span className="text-slate-500 font-mono text-[11px]">المكتبات المعتمدة: technicalindicators, ethers / viem</span>
      </div>
    </div>
  );
};
