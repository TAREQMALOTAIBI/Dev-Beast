import React, { useState, useRef, useEffect } from 'react';
import { Terminal, Filter, Trash2, ArrowDown } from 'lucide-react';
import { ExecutionLog } from '../types';

interface ExecutionConsoleProps {
  logs: ExecutionLog[];
  onClearLogs?: () => void;
}

export const ExecutionConsole: React.FC<ExecutionConsoleProps> = ({ logs, onClearLogs }) => {
  const [filter, setFilter] = useState<'ALL' | 'TRIGGER' | 'EXECUTION' | 'SETTLEMENT' | 'INFO'>('ALL');
  const [autoScroll, setAutoScroll] = useState(true);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const filteredLogs = logs.filter((log) => {
    if (filter === 'ALL') return true;
    return log.level === filter;
  });

  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = 0;
    }
  }, [logs, autoScroll]);

  const getLevelBadgeClass = (level: ExecutionLog['level']) => {
    switch (level) {
      case 'TRIGGER':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold';
      case 'EXECUTION':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/40 font-bold';
      case 'SETTLEMENT':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-bold';
      case 'WARN':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/40 font-bold';
      default:
        return 'bg-neutral-800 text-neutral-400 border-neutral-700';
    }
  };

  const filterLabels: Record<string, string> = {
    ALL: 'الكل',
    TRIGGER: 'إشارة',
    EXECUTION: 'تنفيذ',
    SETTLEMENT: 'تسوية',
    INFO: 'معلومات',
  };

  return (
    <div
      id="execution-console-panel"
      className="bg-[#0a0a0a] border border-[#222] flex flex-col font-mono text-xs"
    >
      {/* Header & Controls matching Geometric Balance design */}
      <div className="p-4 border-b border-[#222] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#00ff9d] animate-pulse"></span>
          <span className="text-xs font-mono font-bold tracking-wider text-zinc-300">
            شاشة التنفيذ والقياس اللحظي
          </span>
          <span className="text-[10px] text-zinc-500">({filteredLogs.length})</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
          {(['ALL', 'TRIGGER', 'EXECUTION', 'SETTLEMENT', 'INFO'] as const).map((lvl) => (
            <button
              key={lvl}
              type="button"
              onClick={() => setFilter(lvl)}
              className={`px-2 py-1 uppercase tracking-wider border transition-colors ${
                filter === lvl
                  ? 'bg-[#00ff9d]/20 text-[#00ff9d] border-[#00ff9d]/50 font-bold'
                  : 'bg-[#111] hover:bg-[#222] text-zinc-400 border-[#222]'
              }`}
            >
              {filterLabels[lvl]}
            </button>
          ))}
          {onClearLogs && (
            <button
              type="button"
              onClick={onClearLogs}
              className="px-2 py-1 bg-[#111] hover:bg-[#222] text-zinc-400 border border-[#222] transition-colors"
            >
              مسح
            </button>
          )}
          <button
            type="button"
            onClick={() => setAutoScroll(!autoScroll)}
            className="px-2 py-1 bg-[#111] hover:bg-[#222] text-zinc-400 border border-[#222] transition-colors"
          >
            التمرير: {autoScroll ? 'مفعّل' : 'معطّل'}
          </button>
        </div>
      </div>

      {/* Log Feed */}
      <div
        ref={logContainerRef}
        className="h-64 sm:h-72 overflow-y-auto p-4 space-y-2 text-xs divide-y divide-[#181818]"
      >
        {filteredLogs.length === 0 ? (
          <div className="py-12 text-center text-zinc-600">
            بانتظار الإشارات الكمية وتقييمات إغلاق شمعة الدقيقة...
          </div>
        ) : (
          filteredLogs.map((log) => {
            const timeStr = new Date(log.timestamp).toLocaleTimeString('en-US', {
              hour12: false,
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            });

            return (
              <div
                key={log.id}
                className="pt-2 first:pt-0 flex items-start gap-2.5 hover:bg-[#111]/40 transition-colors"
              >
                <span className="text-zinc-600 shrink-0 select-none font-mono">[{timeStr}]</span>
                <span
                  className={`px-1.5 py-0.5 border text-[9px] tracking-wider shrink-0 font-bold ${
                    log.level === 'TRIGGER'
                      ? 'border-[#00ff9d]/40 bg-[#00ff9d]/10 text-[#00ff9d]'
                      : log.level === 'EXECUTION'
                      ? 'border-blue-500/40 bg-blue-500/10 text-blue-400'
                      : log.level === 'SETTLEMENT'
                      ? 'border-[#00ff9d]/40 bg-[#00ff9d]/10 text-[#00ff9d]'
                      : log.level === 'WARN'
                      ? 'border-[#ff4d4d]/40 bg-[#ff4d4d]/10 text-[#ff4d4d]'
                      : 'border-[#222] bg-[#111] text-zinc-500'
                  }`}
                >
                  {filterLabels[log.level] || log.level}
                </span>
                <span className="text-zinc-300 break-words flex-1 leading-relaxed">
                  {log.message}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Footer / Status bar */}
      <div className="px-4 py-2 bg-[#0d0d0d] border-t border-[#222] flex items-center justify-between text-[10px] text-zinc-600">
        <span>حد ذاكرة 1GB RAM: ذاكرة دائرية مقيدة (60 سطراً للقياس)</span>
        <span className="text-[#00ff9d]/80 font-mono">LIMITLESS PROTOCOL • BASE MAINNET</span>
      </div>
    </div>
  );
};
