import React, { useState } from 'react';
import { Copy, Check, Download, Terminal, FileCode, Shield, Zap } from 'lucide-react';
import { BotConfigState } from '../types';
import { generateCustomPythonScript, REQUIREMENTS_TXT, ENV_EXAMPLE_TXT } from '../data/pythonCode';

interface CodeViewerProps {
  config: BotConfigState;
  onDownloadScript: () => void;
}

export const CodeViewer: React.FC<CodeViewerProps> = ({ config, onDownloadScript }) => {
  const [activeTab, setActiveTab] = useState<'python' | 'requirements' | 'env'>('python');
  const [copied, setCopied] = useState<boolean>(false);

  const pythonCode = generateCustomPythonScript(config);

  const getActiveCode = () => {
    switch (activeTab) {
      case 'python':
        return pythonCode;
      case 'requirements':
        return REQUIREMENTS_TXT;
      case 'env':
        return ENV_EXAMPLE_TXT;
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(getActiveCode());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadRequirements = () => {
    const blob = new Blob([REQUIREMENTS_TXT], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'requirements.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadEnv = () => {
    const blob = new Blob([ENV_EXAMPLE_TXT], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '.env.example';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-zinc-900/90 border border-zinc-800">
        {/* File Tabs */}
        <div className="flex items-center space-x-1.5 rtl:space-x-reverse bg-zinc-950 p-1 rounded-lg border border-zinc-800/80">
          <button
            onClick={() => setActiveTab('python')}
            className={`px-3 py-1.5 rounded-md text-xs font-mono font-medium transition-all flex items-center space-x-1.5 ${
              activeTab === 'python'
                ? 'bg-zinc-800 text-emerald-400 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>limitless_mml_bot.py</span>
          </button>
          <button
            onClick={() => setActiveTab('requirements')}
            className={`px-3 py-1.5 rounded-md text-xs font-mono font-medium transition-all flex items-center space-x-1.5 ${
              activeTab === 'requirements'
                ? 'bg-zinc-800 text-emerald-400 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>requirements.txt</span>
          </button>
          <button
            onClick={() => setActiveTab('env')}
            className={`px-3 py-1.5 rounded-md text-xs font-mono font-medium transition-all flex items-center space-x-1.5 ${
              activeTab === 'env'
                ? 'bg-zinc-800 text-emerald-400 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>.env.example</span>
          </button>
        </div>

        {/* Copy & Download buttons */}
        <div className="flex items-center space-x-2 rtl:space-x-reverse">
          <button
            onClick={handleCopy}
            className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors flex items-center space-x-1.5 rtl:space-x-reverse"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">تم النسخ!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>نسخ الكود</span>
              </>
            )}
          </button>

          {activeTab === 'python' ? (
            <button
              onClick={onDownloadScript}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold transition-colors flex items-center space-x-1.5 rtl:space-x-reverse shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              <span>تحميل سكربت .py</span>
            </button>
          ) : activeTab === 'requirements' ? (
            <button
              onClick={downloadRequirements}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold transition-colors flex items-center space-x-1.5 rtl:space-x-reverse shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              <span>تحميل requirements.txt</span>
            </button>
          ) : (
            <button
              onClick={downloadEnv}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold transition-colors flex items-center space-x-1.5 rtl:space-x-reverse shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              <span>تحميل .env.example</span>
            </button>
          )}
        </div>
      </div>

      {/* Code Container with line numbers and styling */}
      <div className="rounded-2xl bg-zinc-950 border border-zinc-800 overflow-hidden shadow-xl" dir="ltr">
        <div className="px-4 py-2.5 bg-zinc-900/90 border-b border-zinc-800 flex items-center justify-between text-xs font-mono text-zinc-400">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block" />
            <span className="ml-2 text-zinc-300 font-semibold">
              {activeTab === 'python'
                ? 'limitless_mml_bot.py (Production Ready & Compiled)'
                : activeTab === 'requirements'
                ? 'requirements.txt'
                : '.env.example'}
            </span>
          </div>
          <span>Python 3.10+ &bull; Asyncio &bull; Web3.py &bull; Websockets</span>
        </div>

        <pre className="p-4 overflow-x-auto text-xs font-mono text-zinc-300 max-h-[600px] leading-relaxed select-text selection:bg-emerald-500/30 selection:text-emerald-200 text-left">
          <code>{getActiveCode()}</code>
        </pre>
      </div>

      {/* Deployment & Execution Instructions */}
      <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 text-xs space-y-2">
        <div className="text-zinc-200 font-semibold flex items-center space-x-2 rtl:space-x-reverse">
          <Zap className="w-4 h-4 text-emerald-400" />
          <span>أوامر التشغيل والتشغيل الفعلي في الطرفية (Terminal):</span>
        </div>
        <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800/80 text-zinc-400 space-y-1 overflow-x-auto font-mono text-left" dir="ltr">
          <div>
            <span className="text-emerald-400">$</span> python3 -m venv venv && source venv/bin/activate
          </div>
          <div>
            <span className="text-emerald-400">$</span> pip install -r requirements.txt
          </div>
          <div>
            <span className="text-emerald-400">$</span> cp .env.example .env && nano .env # ضع مفتاحك الخاص وعقدة RPC_URL
          </div>
          <div>
            <span className="text-emerald-400">$</span> python limitless_mml_bot.py
          </div>
        </div>
      </div>
    </div>
  );
};
