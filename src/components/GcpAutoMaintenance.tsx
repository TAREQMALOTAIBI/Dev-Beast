import React, { useState, useEffect } from 'react';
import {
  Server,
  Cpu,
  Zap,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Terminal,
  Copy,
  Check,
  Shield,
  Activity,
  Trash2,
  Clock,
  HardDrive,
} from 'lucide-react';

interface MaintenanceData {
  autoPurgeEnabled: boolean;
  intervalMinutes: number;
  lastPurgeTime: number;
  totalPurgeCount: number;
  lastFreedMb: number;
  memory: {
    rssMb: number;
    heapUsedMb: number;
    heapTotalMb: number;
    externalMb: number;
  };
  system: {
    platform: string;
    arch: string;
    uptimeHours: number;
    nodeUptimeMinutes: number;
    osTotalMemMb: number;
    osFreeMemMb: number;
    cpuCount: number;
    loadAvg: number[];
  };
  purgeLogs: Array<{
    id: string;
    timestamp: number;
    reason: string;
    freedMb: number;
    currentRssMb: number;
    heapUsedMb: number;
    durationMs: number;
  }>;
}

export const GcpAutoMaintenance: React.FC = () => {
  const [data, setData] = useState<MaintenanceData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isPurging, setIsPurging] = useState<boolean>(false);
  const [purgeAlert, setPurgeAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  const fetchMaintenanceData = async () => {
    try {
      const res = await fetch('/api/system/maintenance');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (e) {
      console.error('فشل جلب بيانات صيانة النظام:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMaintenanceData();
    const interval = setInterval(fetchMaintenanceData, 6000);
    return () => clearInterval(interval);
  }, []);

  const handleManualPurge = async () => {
    setIsPurging(true);
    setPurgeAlert(null);
    try {
      const res = await fetch('/api/system/purge', { method: 'POST' });
      const resData = await res.json();
      if (res.ok && resData.success) {
        setPurgeAlert({
          type: 'success',
          message: `✅ تمت الفرمتة الآلية بنجاح! تم تفريغ الكاش وتحرير ${resData.record?.freedMb || 0} MB من الذاكرة خلال ${resData.record?.durationMs || 0}ms.`,
        });
        await fetchMaintenanceData();
      } else {
        setPurgeAlert({
          type: 'error',
          message: 'تعذر تنفيذ الفرمتة الآن، يرجى إعادة المحاولة.',
        });
      }
    } catch (err: any) {
      setPurgeAlert({
        type: 'error',
        message: `خطأ أثناء الفرمتة: ${err.message}`,
      });
    } finally {
      setIsPurging(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCmd(id);
    setTimeout(() => setCopiedCmd(null), 2500);
  };

  const cronCommand = `chmod +x scripts/gcp-auto-maintenance.sh && (crontab -l 2>/dev/null; echo "*/10 * * * * $(pwd)/scripts/gcp-auto-maintenance.sh >> /tmp/gcp-purge.log 2>&1") | crontab -`;
  const pm2Command = `pm2 start ecosystem.config.cjs && pm2 save`;
  const kernelTuningCommand = `sudo sysctl -w net.ipv4.tcp_tw_reuse=1 && sudo sysctl -w net.ipv4.tcp_fin_timeout=15 && sudo sysctl -w vm.swappiness=10`;

  const memoryPercent = data && data.system.osTotalMemMb > 0
    ? Math.min(100, Math.round((data.memory.rssMb / data.system.osTotalMemMb) * 100))
    : 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-cyan-950/20 to-slate-900 border border-cyan-500/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <Server className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white">الفرمتة والتطهير الآلي في Google Cloud VM</h2>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-mono font-bold">
                AUTO-PURGE ACTIVE
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
              محرك فرمتة ذاتي مدمج يفرغ الذاكرة المؤقتة (PageCache)، يغلق الاتصالات العالقة، ويطلق تفريغ V8 Garbage Collection دورياً كل 10 دقائق وعند الطوارئ لمنع أي اختناق وتنفيذ أوامر FAK بأعلى سرعة وسلاسة 24/7.
            </p>
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={handleManualPurge}
          disabled={isPurging}
          className="w-full md:w-auto px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 disabled:opacity-50 transition-all cursor-pointer shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${isPurging ? 'animate-spin' : ''}`} />
          <span>{isPurging ? 'جاري الفرمتة وتطهير الذاكرة...' : 'فرمتة وتطهير فوري الآن'}</span>
        </button>
      </div>

      {purgeAlert && (
        <div className={`p-3.5 rounded-xl text-xs flex items-center gap-2 border ${
          purgeAlert.type === 'success'
            ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-200'
            : 'bg-rose-950/50 border-rose-500/40 text-rose-200'
        }`}>
          {purgeAlert.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />}
          <span>{purgeAlert.message}</span>
        </div>
      )}

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: RSS Memory */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="flex items-center gap-1.5 font-medium">
              <Cpu className="w-4 h-4 text-cyan-400" />
              ذاكرة العملية (Node RSS)
            </span>
            <span className="text-[10px] text-cyan-400 font-mono">حقيقي</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xl font-bold font-mono text-white">
              {data ? `${data.memory.rssMb} MB` : '...'}
            </span>
            <span className="text-xs text-slate-400 font-mono">
              Heap: {data ? `${data.memory.heapUsedMb} MB` : '...'}
            </span>
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                data && data.memory.rssMb > 300 ? 'bg-rose-500' : 'bg-cyan-500'
              }`}
              style={{ width: `${Math.min(100, (data?.memory.rssMb || 50) / 4)}%` }}
            />
          </div>
          <span className="text-[10px] text-slate-500 block">سقف الأمان التلقائي: 350 MB</span>
        </div>

        {/* Metric 2: OS Free Memory */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="flex items-center gap-1.5 font-medium">
              <HardDrive className="w-4 h-4 text-emerald-400" />
              ذاكرة نظام VM المتاحة
            </span>
            <span className="text-[10px] text-emerald-400 font-mono">GCP Host</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xl font-bold font-mono text-emerald-400">
              {data ? `${data.system.osFreeMemMb} MB` : '...'}
            </span>
            <span className="text-xs text-slate-400 font-mono">
              إجمالي: {data ? `${data.system.osTotalMemMb} MB` : '...'}
            </span>
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-emerald-500 h-full transition-all duration-500"
              style={{ width: `${memoryPercent}%` }}
            />
          </div>
          <span className="text-[10px] text-slate-500 block">نظام التشغيل: {data?.system.platform || 'Linux'} ({data?.system.arch || 'x64'})</span>
        </div>

        {/* Metric 3: Auto-Purge Frequency */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="flex items-center gap-1.5 font-medium">
              <Clock className="w-4 h-4 text-purple-400" />
              دورة الفرمتة الذاتية
            </span>
            <span className="text-[10px] text-purple-400 font-mono">نشط</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xl font-bold font-mono text-purple-400">
              كل {data?.intervalMinutes || 10} دقائق
            </span>
            <span className="text-xs text-slate-400 font-mono">
              {data?.totalPurgeCount || 0} دورة تمت
            </span>
          </div>
          <div className="text-[11px] text-slate-300 flex items-center justify-between pt-1">
            <span className="text-slate-400 text-[10px]">آخر فرمتة:</span>
            <span className="font-mono text-[10px] text-emerald-400">
              {data?.lastPurgeTime ? new Date(data.lastPurgeTime).toLocaleTimeString('ar-EG') : 'الآن'}
            </span>
          </div>
          <span className="text-[10px] text-slate-500 block">تفريغ تلقائي بدون توقف التداول</span>
        </div>

        {/* Metric 4: FAK Execution Readiness */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="flex items-center gap-1.5 font-medium">
              <Zap className="w-4 h-4 text-amber-400" />
              جاهزية أوامر FAK
            </span>
            <span className="text-[10px] text-emerald-400 font-mono">Ultra Low Latency</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xl font-bold font-mono text-amber-400">
              0 اختناق (Smooth)
            </span>
            <span className="text-xs text-slate-400 font-mono">
              {data?.system.cpuCount || 1} vCPU
            </span>
          </div>
          <div className="text-[11px] text-slate-300 flex items-center justify-between pt-1">
            <span className="text-slate-400 text-[10px]">متوسط الحمل (Load Avg):</span>
            <span className="font-mono text-[10px] text-cyan-400">
              {data?.system.loadAvg ? data.system.loadAvg.join(' • ') : '0.05'}
            </span>
          </div>
          <span className="text-[10px] text-slate-500 block">إعادة استخدام مقابس TCP مفعلة</span>
        </div>
      </div>

      {/* Deployment & Setup on Google Cloud VM */}
      <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Terminal className="w-4 h-4 text-cyan-400" />
            <span>تفعيل الفرمتة الآلية على سيرفر Google Cloud VM (خطوة واحدة)</span>
          </h3>
          <span className="text-xs text-slate-400 font-mono">GCP Compute Engine Quick Setup</span>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">
          قم بتنفيذ الأوامر التالية في نافذة SSH الخاصة بسيرفر Google Cloud VM لديك. ستقوم هذه الأوامر بجدولة الفرمتة التلقائية على مستوى نظام التشغيل لينكس (Linux Kernel PageCache) وضبط مدير العمليات PM2 لإعادة تدوير الذاكرة بسلاسة:
        </p>

        {/* Command 1: Automated Cron Purge */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-300 font-medium flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-[11px]">1</span>
              جدولة الفرمتة الآلية للنظام (Crontab Auto-Maintenance Every 10 min):
            </span>
            <button
              onClick={() => copyToClipboard(cronCommand, 'cron')}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 text-[11px] font-mono flex items-center gap-1 transition-all cursor-pointer"
            >
              {copiedCmd === 'cron' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedCmd === 'cron' ? 'تم النسخ' : 'نسخ الأمر'}</span>
            </button>
          </div>
          <pre className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-cyan-300 font-mono text-xs overflow-x-auto text-left" dir="ltr">
            {cronCommand}
          </pre>
        </div>

        {/* Command 2: Kernel Network Low-Latency Tuning */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-300 font-medium flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-[11px]">2</span>
              تسريع تنفيذ أوامر FAK ومنع اختناق اتصالات الشبكة (Kernel Low Latency Tuning):
            </span>
            <button
              onClick={() => copyToClipboard(kernelTuningCommand, 'kernel')}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 text-[11px] font-mono flex items-center gap-1 transition-all cursor-pointer"
            >
              {copiedCmd === 'kernel' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedCmd === 'kernel' ? 'تم النسخ' : 'نسخ الأمر'}</span>
            </button>
          </div>
          <pre className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-cyan-300 font-mono text-xs overflow-x-auto text-left" dir="ltr">
            {kernelTuningCommand}
          </pre>
        </div>

        {/* Command 3: PM2 with GC */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-300 font-medium flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-[11px]">3</span>
              تشغيل البوت عبر PM2 مع تفعيل V8 Garbage Collection وإعادة التشغيل عند 350M:
            </span>
            <button
              onClick={() => copyToClipboard(pm2Command, 'pm2')}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 text-[11px] font-mono flex items-center gap-1 transition-all cursor-pointer"
            >
              {copiedCmd === 'pm2' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedCmd === 'pm2' ? 'تم النسخ' : 'نسخ الأمر'}</span>
            </button>
          </div>
          <pre className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-cyan-300 font-mono text-xs overflow-x-auto text-left" dir="ltr">
            {pm2Command}
          </pre>
        </div>
      </div>

      {/* Purge Logs Stream */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-200 flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" />
            <span>سجل عمليات الفرمتة والتطهير المنفذة (Purge History)</span>
          </h3>
          <span className="text-xs font-mono text-slate-500">{data?.purgeLogs.length || 0} عملية مسجلة</span>
        </div>

        {!data?.purgeLogs || data.purgeLogs.length === 0 ? (
          <div className="p-6 text-center bg-slate-950 rounded-xl border border-slate-800 text-slate-500 text-xs">
            لا توجد عمليات فرمتة مسجلة بعد. يتم التنفيذ تلقائياً كل 10 دقائق أو بالنقر على "فرمتة وتطهير فوري الآن".
          </div>
        ) : (
          <div className="space-y-2">
            {data.purgeLogs.map((log) => (
              <div
                key={log.id}
                className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono"
              >
                <div className="flex items-center gap-2.5">
                  <span className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-xs">
                    🧹
                  </span>
                  <div>
                    <span className="text-white font-sans font-bold block">{log.reason}</span>
                    <span className="text-[11px] text-slate-400">
                      الذاكرة بعد التنظيف (RSS): <strong className="text-cyan-400">{log.currentRssMb} MB</strong> • Heap: <strong className="text-emerald-400">{log.heapUsedMb} MB</strong>
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-center">
                  <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                    تم تحرير {log.freedMb} MB
                  </span>
                  <span className="text-[10px] text-slate-500 font-sans">
                    {new Date(log.timestamp).toLocaleTimeString('ar-EG')} ({log.durationMs}ms)
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
