// ==============================================================================
// PM2 Process File with Automatic Memory Restart & V8 Garbage Collection
// ملف تشغيل PM2 لـ Google Cloud VM مع إعادة التشغيل التلقائي عند زيادة الذاكرة
// ==============================================================================

module.exports = {
  apps: [
    {
      name: 'limitless-trading-bot',
      script: 'server.ts',
      interpreter: 'node',
      // تمكين التطهير الآلي للذاكرة وضبط مساحة الذاكرة لتفادي أي اختناق
      interpreter_args: '--import tsx --expose-gc --max-old-space-size=512',
      instances: 1,
      autorestart: true,
      watch: false,
      // فرمتة وإعادة تشغيل تلقائية سلسة إذا تجاوز استهلاك الذاكرة 350 ميجابايت
      max_memory_restart: '350M',
      restart_delay: 2000,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};
