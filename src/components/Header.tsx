import React from 'react';
import {
  Activity,
  Shield,
  Zap,
  Radio,
  Sliders,
  Wallet,
  Server,
  Cpu,
  RefreshCw,
} from 'lucide-react';
import { BotConfig, SystemHealth } from '../types';

interface HeaderProps {
  config: BotConfig;
  health: SystemHealth;
  walletBalance: number;
  onToggleActive: (active: boolean) => void;
  onToggleLiveMode: (live: boolean) => void;
  onOpenConfig: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  config,
  health,
  walletBalance,
  onToggleActive,
  onToggleLiveMode,
  onOpenConfig,
}) => {
  return (
    <header
      id="app-header"
      className="bg-[#0a0a0a] border-b border-[#222] sticky top-0 z-30 px-4 sm:px-6 py-3"
    >
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        {/* Right (in RTL): Engine Status, Brand & Metadata */}
        <div className="flex flex-wrap items-center gap-3 sm:gap-5">
          <div className="flex items-center gap-2">
            <div
              className={`w-3 h-3 rounded-full transition-all ${
                config.active
                  ? 'bg-[#00ff9d] shadow-[0_0_8px_#00ff9d]'
                  : 'bg-[#ff4d4d] shadow-[0_0_6px_#ff4d4d]'
              }`}
            />
            <span
              className={`text-xs font-bold tracking-wider font-mono ${
                config.active ? 'text-[#00ff9d]' : 'text-[#ff4d4d]'
              }`}
            >
              المحرك الكمي: {config.active ? 'نشط' : 'متوقف'}
            </span>
          </div>

          <div className="hidden sm:block h-4 w-[1px] bg-[#333]" />

          <div className="text-xs text-zinc-500">
            الهدف: <span className="text-zinc-300 font-mono font-medium">BTC 15M</span>
          </div>

          <div className="hidden sm:block h-4 w-[1px] bg-[#333]" />

          <div className="text-xs text-zinc-500">
            الشبكة: <span className="text-zinc-300 font-mono">Base Mainnet</span>
          </div>

          <div className="hidden lg:block h-4 w-[1px] bg-[#333]" />

          <div className="hidden lg:block text-xs text-zinc-500">
            البيئة: <span className="text-zinc-300 font-mono">Node 22 LTS</span>
          </div>

          <div className="hidden xl:block h-4 w-[1px] bg-[#333]" />

          <div className="hidden xl:flex items-center gap-1.5 text-xs text-zinc-500">
            <span>ذاكرة الخادم:</span>
            <span className="text-zinc-300 font-mono">{health.rssMemoryMB} ميجابايت / 1024</span>
          </div>
        </div>

        {/* Left (in RTL): Wallet Balance, Live Mode, Toggle Switch, Settings */}
        <div className="flex items-center gap-3 sm:gap-4 w-full md:w-auto justify-between md:justify-end">
          {/* Live Stream Telemetry Pills */}
          <div className="hidden sm:flex items-center gap-2">
            <div
              id="status-binance-ws"
              className="flex items-center gap-1.5 px-2 py-1 bg-[#111] border border-[#222] text-[10px] font-mono text-zinc-400"
            >
              <div
                className={`w-1.5 h-1.5 rounded-full ${
                  health.binanceWsConnected
                    ? 'bg-[#00ff9d] shadow-[0_0_4px_#00ff9d]'
                    : 'bg-[#ff4d4d]'
                }`}
              />
              <span>بث بينانس ({health.candleCount}/100)</span>
            </div>

            <div
              id="status-limitless-api"
              className="flex items-center gap-1.5 px-2 py-1 bg-[#111] border border-[#222] text-[10px] font-mono text-zinc-400"
            >
              <div className="w-1.5 h-1.5 bg-[#00ff9d] rounded-full shadow-[0_0_4px_#00ff9d]" />
              <span>Limitless ({health.limitlessLatencyMs}ms)</span>
            </div>
          </div>

          {/* Embedded Wallet Balance */}
          <div id="wallet-balance-badge" className="flex flex-col items-start md:items-end">
            <span className="text-[10px] text-zinc-500 font-mono">
              محفظة Limitless
            </span>
            <span className="text-sm font-mono text-[#00ff9d] font-bold tracking-tight">
              ${walletBalance.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{' '}
              <span className="text-zinc-500 text-[10px]">USDC</span>
            </span>
          </div>

          {/* Live Order vs Dry Run Mode */}
          <button
            id="btn-toggle-live-mode"
            type="button"
            onClick={() => onToggleLiveMode(!config.liveMode)}
            className={`px-2 py-1 text-[10px] font-mono uppercase tracking-wider font-bold border transition-colors ${
              config.liveMode
                ? 'bg-[#ff4d4d]/10 text-[#ff4d4d] border-[#ff4d4d]/40'
                : 'bg-[#111] text-zinc-400 border-[#222] hover:text-zinc-200'
            }`}
          >
            {config.liveMode ? '● تداول حقيقي' : 'تجريبي (Dry-Run)'}
          </button>

          {/* Bot Master Toggle Switch (Geometric Balance Pill Style) */}
          <div
            id="btn-toggle-bot-active"
            onClick={() => onToggleActive(!config.active)}
            className={`w-11 h-6 rounded-full relative p-1 cursor-pointer transition-colors border ${
              config.active ? 'bg-[#111] border-[#00ff9d]/50' : 'bg-[#1a1a1a] border-[#333]'
            }`}
            title={config.active ? 'إيقاف المحرك الكمي مؤقتاً' : 'تفعيل المحرك الكمي'}
          >
            <div
              className={`w-4 h-4 rounded-full transition-all duration-200 ${
                config.active
                  ? 'bg-[#00ff9d] -translate-x-5 rtl:-translate-x-5 shadow-[0_0_6px_#00ff9d]'
                  : 'bg-zinc-600 translate-x-0'
              }`}
            />
          </div>

          {/* Settings button */}
          <button
            id="btn-open-config"
            type="button"
            onClick={onOpenConfig}
            className="p-1.5 border border-[#222] bg-[#111] text-zinc-400 hover:text-zinc-100 hover:border-[#333] transition-colors"
            title="إعدادات المعايير وبيانات الاعتماد"
          >
            <Sliders className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
