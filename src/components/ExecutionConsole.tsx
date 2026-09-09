import React, { useState } from 'react';
import { Terminal, Trash2, Sparkles, RefreshCw, Cpu } from 'lucide-react';
import { TerminalLog } from '../types';

interface ExecutionConsoleProps {
  logs: TerminalLog[];
  onClearLogs: () => void;
  onFlushBuffer?: () => void;
}

export const ExecutionConsole: React.FC<ExecutionConsoleProps> = ({
  logs,
  onClearLogs,
  onFlushBuffer,
}) => {
  const [isFlushing, setIsFlushing] = useState(false);

  const handleManualFlush = () => {
    setIsFlushing(true);
    if (onFlushBuffer) {
      onFlushBuffer();
    }
    setTimeout(() => {
      setIsFlushing(false);
    }, 600);
  };

  return (
    <div className="rounded-2xl bg-zinc-950 border border-zinc-800 overflow-hidden shadow-xl">
      {/* Console Header */}
      <div className="px-4 py-2.5 bg-zinc-900/90 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center space-x-2 rtl:space-x-reverse">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-bold text-white">
            سجل التنفيذ غير المتزامن للبوت (سجل الطرفية المباشر)
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800/60">
            فائق السرعة Low-Latency
          </span>
        </div>

        {/* Anti-Bottleneck Buffer Status & Controls */}
        <div className="flex items-center space-x-2 rtl:space-x-reverse">
          {/* Circular Buffer Active Pill */}
          <div
            className="hidden md:inline-flex items-center space-x-1.5 rtl:space-x-reverse text-[10px] font-mono px-2 py-0.5 rounded-md bg-cyan-950/40 text-cyan-300 border border-cyan-800/50"
            title="الفرمتة والتدوير التلقائي مفعل (Ring Buffer Deque): يتم حذف التكات القديمة لحظياً لمنع تراكم الذاكرة"
          >
            <Cpu className="w-3 h-3 text-cyan-400" />
            <span>فرمتة وتدوير تلقائي للذاكرة: نَشِط (0% اختناق)</span>
          </div>

          {/* Quick Manual Flush Button */}
          <button
            onClick={handleManualFlush}
            disabled={isFlushing}
            className="inline-flex items-center space-x-1 rtl:space-x-reverse px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-cyan-300 hover:text-cyan-100 text-[11px] font-mono transition-colors border border-zinc-700"
            title="فرمتة الذاكرة المؤقتة وتفريغ طابور السجلات يدوياً لمنع أي ضغط على المتصفح"
          >
            <RefreshCw className={`w-3 h-3 ${isFlushing ? 'animate-spin text-cyan-400' : ''}`} />
            <span>{isFlushing ? 'جاري الفرمتة...' : 'فرمتة الكاش'}</span>
          </button>

          {/* Clear Logs Button */}
          <button
            onClick={onClearLogs}
            className="p-1 rounded text-zinc-400 hover:text-rose-400 transition-colors"
            title="مسح كل السجلات"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Log Feed */}
      <div className="p-3.5 font-mono text-xs max-h-64 overflow-y-auto space-y-1.5 scrollbar-thin scrollbar-thumb-zinc-800">
        {logs.map((log) => {
          let badgeColor = 'text-zinc-400 bg-zinc-900 border-zinc-800';
          let textColor = 'text-zinc-300';

          if (log.level === 'MOMENTUM') {
            badgeColor = 'text-amber-400 bg-amber-950/60 border-amber-800/60 font-bold';
            textColor = 'text-amber-200';
          } else if (log.level === 'EXEC') {
            badgeColor = 'text-blue-400 bg-blue-950/60 border-blue-800/60 font-bold';
            textColor = 'text-blue-200';
          } else if (log.level === 'FLIP') {
            badgeColor = 'text-emerald-400 bg-emerald-950/80 border-emerald-800/80 font-bold';
            textColor = 'text-emerald-200 font-semibold';
          } else if (log.level === 'WARN') {
            badgeColor = 'text-rose-400 bg-rose-950/60 border-rose-800/60';
            textColor = 'text-rose-300';
          }

          return (
            <div key={log.id} className="flex items-start space-x-2 rtl:space-x-reverse leading-relaxed">
              <span className="text-zinc-400 text-[10px] shrink-0 pt-0.5">{log.timestamp}</span>
              <span className={`px-1.5 py-0.2 text-[10px] rounded border ${badgeColor} shrink-0`}>
                [{log.level}]
              </span>
              <span className={`break-all ${textColor}`}>{log.message}</span>
            </div>
          );
        })}

        {logs.length === 0 && (
          <div className="text-zinc-400 text-center py-4 italic text-xs">
            في انتظار أحداث وتنبيهات البوت...
          </div>
        )}
      </div>
    </div>
  );
};
