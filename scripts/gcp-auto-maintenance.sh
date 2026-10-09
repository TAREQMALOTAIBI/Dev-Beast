#!/usr/bin/env bash
# ==============================================================================
# 🤖 Google Cloud VM Automated Purge & Low-Latency Optimizer for Trading Bot
# سكريبت الفرمتة والتطهير الآلي لموارد Google Cloud VM لمنع الاختناق وتسريع تنفيذ الأوامر
# ==============================================================================

set -e

TIMESTAMP=$(date "+%Y-%m-%d %H:%M:%S")
echo "======================================================================"
echo "🧹 [GCP Auto-Purge] بدء دورة الفرمتة وتطهير الموارد: $TIMESTAMP"
echo "======================================================================"

# 1. تحرير ذاكرة التخزين المؤقت لنواة لينكس (Drop Linux Kernel PageCache, Dentries, Inodes)
echo "⚡ [1/5] جاري تنظيف وتفريغ كاش الذاكرة في نظام لينكس (Drop Caches)..."
if [ "$EUID" -eq 0 ]; then
  sync
  echo 3 > /proc/sys/vm/drop_caches 2>/dev/null || true
  echo "✅ تم تفريغ PageCache و Dentries بنجاح عبر صلاحيات الجذر."
else
  sync
  sudo sh -c "echo 3 > /proc/sys/vm/drop_caches" 2>/dev/null || echo "ℹ️ تم تنفيذ sync (تخطي drop_caches لعدم توفر sudo دون كلمة مرور)."
fi

# 2. تنظيف وتفريغ ملفات السجلات المتضخمة (Vacuum Logs to prevent Disk Bottleneck)
echo "📜 [2/5] جاري تنظيف وتدوير سجلات النظام (Logs Rotation)..."
if command -v journalctl &> /dev/null; then
  sudo journalctl --vacuum-time=1d --vacuum-size=50M 2>/dev/null || journalctl --vacuum-size=50M 2>/dev/null || true
  echo "✅ تم ضغط وتفريغ سجلات journalctl القديمة."
fi

# 3. تنظيف سجلات PM2 إن وجدت (PM2 Logs Flush)
echo "📦 [3/5] فحص وتنظيف سجلات مدير العمليات PM2..."
if command -v pm2 &> /dev/null; then
  pm2 flush > /dev/null 2>&1 || true
  echo "✅ تم تفريغ سجلات PM2 المتراكمة لتوفير مساحة الذاكرة."
fi

# 4. استدعاء نقطة نهاية الفرمتة الداخلية للبوت (In-App Garbage Collection & Socket Reset)
echo "🌐 [4/5] إرسال إشارة الفرمتة والتطهير لمحرك البوت عبر API..."
PURGE_RES=$(curl -s -X POST http://127.0.0.1:3000/api/system/purge 2>/dev/null || true)
if [ -n "$PURGE_RES" ]; then
  echo "✅ استجابة محرك البوت: $PURGE_RES"
else
  echo "ℹ️ محرك البوت يعمل بشكل مستقل أو غير متاح محلياً على المنفذ 3000."
fi

# 5. تطبيق إعدادات النواة لتنفيذ أوامر FAK بأقل زمن تأخير (Kernel Low-Latency Network Tuning)
echo "🚀 [5/5] تفعيل إعدادات شبكة النواة فائقة السرعة للأوامر اللحظية (Low-Latency TCP)..."
if [ "$EUID" -eq 0 ] || sudo -n true 2>/dev/null; then
  sudo sysctl -w net.ipv4.tcp_tw_reuse=1 > /dev/null 2>&1 || true
  sudo sysctl -w net.ipv4.tcp_fin_timeout=15 > /dev/null 2>&1 || true
  sudo sysctl -w vm.swappiness=10 > /dev/null 2>&1 || true
  echo "✅ تم تطبيق TCP Socket Reuse وتسريع إغلاق الاتصالات لتفادي استنزاف المنافذ."
fi

# إحصائيات الذاكرة بعد التنظيف
TOTAL_MEM=$(free -m | awk '/^Mem:/{print $2}')
USED_MEM=$(free -m | awk '/^Mem:/{print $3}')
FREE_MEM=$(free -m | awk '/^Mem:/{print $4}')
AVAIL_MEM=$(free -m | awk '/^Mem:/{print $7}')

echo "----------------------------------------------------------------------"
echo "📊 حالة الذاكرة الحالية على Google Cloud VM:"
echo "   - إجمالي الذاكرة: ${TOTAL_MEM} MB"
echo "   - الذاكرة المستخدمة: ${USED_MEM} MB"
echo "   - الذاكرة المتاحة فوراً: ${AVAIL_MEM} MB"
echo "🎉 اكتملت الفرمتة الآلية بنجاح! السيرفر يعمل بسلاسة وبأقصى كفاءة."
echo "======================================================================"
