import React, { useState, useEffect } from 'react';
import {
  KeyRound,
  ShieldCheck,
  Plus,
  Trash2,
  Copy,
  Check,
  AlertCircle,
  ExternalLink,
  Code2,
} from 'lucide-react';
import type { ApiTokenRecord, DerivedTokenResult, LimitlessScope } from '../bot/types';
import { ScopeTrading, ScopeDelegatedSigning, ScopeAccountCreation, ScopeWithdrawal } from '../bot/types';
import { LimitlessExchangeSDK } from '../bot/limitlessSdk';

interface ApiTokenManagerProps {
  sdk: LimitlessExchangeSDK;
}

export const ApiTokenManager: React.FC<ApiTokenManagerProps> = ({ sdk }) => {
  const [tokens, setTokens] = useState<ApiTokenRecord[]>([]);
  const [label, setLabel] = useState<string>('production-btc-bot');
  const [selectedScopes, setSelectedScopes] = useState<LimitlessScope[]>([
    ScopeTrading as LimitlessScope,
    ScopeDelegatedSigning as LimitlessScope,
  ]);
  const [derivedResult, setDerivedResult] = useState<DerivedTokenResult | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    sdk.listApiTokens().then(setTokens);
  }, [sdk]);

  const handleToggleScope = (scope: LimitlessScope) => {
    if (selectedScopes.includes(scope)) {
      if (scope === ScopeTrading) return; // ScopeTrading إلزامي للبوت
      setSelectedScopes(selectedScopes.filter((s) => s !== scope));
    } else {
      setSelectedScopes([...selectedScopes, scope]);
    }
  };

  const handleDeriveToken = async () => {
    setLoading(true);
    try {
      const res = await sdk.deriveApiToken(label || 'trading-agent', selectedScopes);
      setDerivedResult(res);
      const updated = await sdk.listApiTokens();
      setTokens(updated);
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeToken = async (tokenId: string) => {
    await sdk.revokeApiToken(tokenId);
    const updated = await sdk.listApiTokens();
    setTokens(updated);
  };

  const copyToClipboard = (text: string, keyName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(keyName);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-6 shadow-2xl backdrop-blur-md space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span>إدارة مفاتيح API الموثقة (HMAC API Tokens &amp; Scopes)</span>
              <span className="px-2 py-0.5 rounded text-[10px] bg-cyan-950 text-cyan-300 border border-cyan-800/50">
                ApiTokenService
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              توليد مفاتيح مصادقة HMAC ذات صلاحيات محددة بدقة لتشغيل خوادم التداول السحابية والمحافظ المفوضة.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span className="text-slate-300">إدارة المفاتيح مفعلة للشريك</span>
        </div>
      </div>

      {/* Grid: Create Token & Active Tokens */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Token Derivation Form (5 Columns) */}
        <div className="lg:col-span-5 p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-4">
          <h3 className="text-xs font-bold text-white flex items-center gap-2">
            <Plus className="w-4 h-4 text-cyan-400" />
            <span>اشتقاق مفتاح API جديد (deriveToken)</span>
          </h3>

          <div className="space-y-1">
            <label className="text-[11px] text-slate-400">تسمية المفتاح (Token Label)</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="مثال: limitless-quant-daemon"
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
            />
          </div>

          {/* Scopes Selection */}
          <div className="space-y-2">
            <label className="text-[11px] text-slate-400 block">الصلاحيات المطلوبة (Scopes)</label>
            <div className="space-y-1.5">
              {[
                { id: ScopeTrading, name: 'ScopeTrading (trading)', desc: 'إلزامي: فتح وإلغاء الأوامر ودفتر الأوامر', required: true },
                { id: ScopeDelegatedSigning, name: 'ScopeDelegatedSigning (delegated_signing)', desc: 'توقيع أوامر المحفظة بالنيابة عن الحساب', required: false },
                { id: ScopeAccountCreation, name: 'ScopeAccountCreation (account_creation)', desc: 'إنشاء محافظ فرعية', required: false },
                { id: ScopeWithdrawal, name: 'ScopeWithdrawal (withdrawal)', desc: 'سحب الأموال من المحافظ السحابية', required: false },
              ].map((scope) => {
                const isChecked = selectedScopes.includes(scope.id as LimitlessScope);
                return (
                  <label
                    key={scope.id}
                    onClick={() => handleToggleScope(scope.id as LimitlessScope)}
                    className={`p-2.5 rounded-lg border text-xs flex items-start gap-2.5 cursor-pointer transition-all ${
                      isChecked
                        ? 'bg-cyan-950/40 border-cyan-500/40 text-cyan-200'
                        : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {}}
                      className="mt-0.5 accent-cyan-500"
                    />
                    <div>
                      <span className="font-mono font-bold block text-[11px]">{scope.name}</span>
                      <span className="text-[10px] text-slate-400">{scope.desc}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <button
            onClick={handleDeriveToken}
            disabled={loading}
            className="w-full py-2 px-3 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-all flex items-center justify-center gap-1.5 shadow-md"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{loading ? 'جاري الاشتقاق...' : 'إنشاء مفتاح HMAC الآن'}</span>
          </button>

          {/* Secret Modal / Banner (One-Time Reveal) */}
          {derivedResult && (
            <div className="p-3 bg-amber-950/40 border border-amber-500/40 rounded-xl space-y-2 text-xs">
              <div className="flex items-center gap-1.5 text-amber-300 font-bold">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>احفظ المفتاح السري الآن (يُعرض مرة واحدة فقط):</span>
              </div>

              <div className="space-y-1 font-mono text-[11px]">
                <div className="flex items-center justify-between bg-slate-950 p-1.5 rounded border border-slate-800">
                  <span className="text-slate-400">Token ID:</span>
                  <div className="flex items-center gap-1">
                    <span className="text-cyan-300">{derivedResult.tokenId}</span>
                    <button
                      onClick={() => copyToClipboard(derivedResult.tokenId, 'tokId')}
                      className="text-slate-400 hover:text-white"
                    >
                      {copiedKey === 'tokId' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between bg-slate-950 p-1.5 rounded border border-slate-800">
                  <span className="text-slate-400">Secret:</span>
                  <div className="flex items-center gap-1">
                    <span className="text-emerald-300 truncate max-w-[140px]">{derivedResult.secret}</span>
                    <button
                      onClick={() => copyToClipboard(derivedResult.secret, 'secret')}
                      className="text-slate-400 hover:text-white"
                    >
                      {copiedKey === 'secret' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Active Tokens List (7 Columns) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-400 pb-1 border-b border-slate-800">
            <span className="font-bold text-slate-200">المفاتيح النشطة للحساب (listTokens)</span>
            <span className="font-mono text-slate-400">{tokens.length} مفتاح نشط</span>
          </div>

          <div className="space-y-2.5">
            {tokens.map((tok) => (
              <div
                key={tok.tokenId}
                className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">{tok.label}</span>
                    <span className="text-cyan-400 font-mono text-[11px] bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                      {tok.tokenId}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 flex-wrap pt-0.5">
                    {tok.scopes.map((s) => (
                      <span
                        key={s}
                        className="px-2 py-0.2 rounded text-[10px] font-mono bg-cyan-950 text-cyan-300 border border-cyan-800/40"
                      >
                        {s}
                      </span>
                    ))}
                  </div>

                  <span className="text-[10px] text-slate-500 block">
                    آخر استخدام: {tok.lastUsedAt}
                  </span>
                </div>

                <button
                  onClick={() => handleRevokeToken(tok.tokenId)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/50 text-xs transition-all self-end sm:self-center"
                  title="إلغاء المفتاح فورياً"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>إلغاء (Revoke)</span>
                </button>
              </div>
            ))}
          </div>

          {/* Quick Integration Example */}
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1.5 text-xs">
            <div className="flex items-center gap-1.5 text-slate-300 font-bold">
              <Code2 className="w-4 h-4 text-cyan-400" />
              <span>طريقة استخدام بيانات HMAC في الكود:</span>
            </div>
            <pre className="p-2 bg-slate-900 rounded font-mono text-[11px] text-cyan-200/90 overflow-x-auto" dir="ltr">
{`const client = new Client({
  baseURL: 'https://api.limitless.exchange',
  hmacCredentials: {
    tokenId: '${derivedResult?.tokenId || 'lmts_tok_9941a82f'}',
    secret: process.env.LMTS_TOKEN_SECRET,
  },
});`}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
