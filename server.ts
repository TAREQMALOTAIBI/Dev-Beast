import express, { Request, Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { BotService } from './server/botService';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize the Institutional Quant Trading Bot Engine
const botService = new BotService();
botService.initialize().catch((err) => {
  console.error('[Server] Failed to initialize bot service:', err);
});

// ==========================================
// API ROUTES (Must come before Vite middleware)
// ==========================================

// Health check
app.get('/api/health', (req: Request, res: Response) => {
  const state = botService.getFullState();
  res.json({
    status: 'ok',
    system: state.health,
  });
});

// Full state snapshot
app.get('/api/status', (req: Request, res: Response) => {
  res.json(botService.getFullState());
});

// Real-time Server-Sent Events (SSE) stream for live sub-second frontend updates
app.get('/api/stream', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  botService.registerSseClient(res);
});

// Toggle Bot Active/Inactive
app.post('/api/bot/toggle', (req: Request, res: Response) => {
  const { active } = req.body;
  botService.updateConfig({ active: Boolean(active) });
  res.json({ success: true, active: Boolean(active) });
});

// Update Configuration (thresholds, API tokens, live mode)
app.post('/api/bot/config', async (req: Request, res: Response) => {
  const {
    liveMode,
    zScoreThreshold,
    momentumThreshold,
    oiDropThreshold,
    limitlessTokenId,
    limitlessTokenSecret,
    limitlessWalletAddress,
  } = req.body;

  await botService.updateConfig({
    ...(liveMode !== undefined && { liveMode: Boolean(liveMode) }),
    ...(zScoreThreshold !== undefined && { zScoreThreshold: Number(zScoreThreshold) }),
    ...(momentumThreshold !== undefined && { momentumThreshold: Number(momentumThreshold) }),
    ...(oiDropThreshold !== undefined && { oiDropThreshold: Number(oiDropThreshold) }),
    ...(limitlessTokenId !== undefined && { limitlessTokenId: String(limitlessTokenId) }),
    ...(limitlessTokenSecret !== undefined && { limitlessTokenSecret: String(limitlessTokenSecret) }),
    ...(limitlessWalletAddress !== undefined && { limitlessWalletAddress: String(limitlessWalletAddress) }),
  });

  res.json({ success: true, state: botService.getFullState() });
});

// Refresh on-chain balance from Base Mainnet RPC
app.post('/api/bot/wallet-refresh', async (req: Request, res: Response) => {
  try {
    const result = await botService.refreshRealWalletBalance();
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to refresh on-chain balance' });
  }
});

// Update Embedded Wallet Balance
app.post('/api/bot/wallet-balance', (req: Request, res: Response) => {
  const { balance } = req.body;
  if (typeof balance === 'number' && balance >= 0) {
    botService.setWalletBalance(balance);
    res.json({ success: true, balance });
  } else {
    res.status(400).json({ error: 'Invalid balance amount' });
  }
});

// Manual Test Trigger
app.post('/api/bot/manual-trigger', async (req: Request, res: Response) => {
  const { forceDirection, bypassWindow, bypassPriceFilter } = req.body;
  const result = await botService.manualTriggerTest({
    forceDirection,
    bypassWindow: Boolean(bypassWindow),
    bypassPriceFilter: Boolean(bypassPriceFilter),
  });
  res.json(result);
});

// ==========================================
// Vite Middleware / Static Serving
// ==========================================
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[QuantBot] Institutional Quant Bot server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
