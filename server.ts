import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { createPublicClient, http, formatUnits } from 'viem';
import { base } from 'viem/chains';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;

// USDC Contract on Base Mainnet
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// ERC20 ABI (Minimal)
const erc20Abi = [
  {
    "constant": true,
    "inputs": [{ "name": "_owner", "type": "address" }],
    "name": "balanceOf",
    "outputs": [{ "name": "balance", "type": "uint256" }],
    "type": "function",
  }
] as const;

async function startServer() {
  app.get('/api/config', async (req, res) => {
    try {
      const rpcUrl = process.env.RPC_URL || process.env.VITE_BASE_RPC_URL || 'https://mainnet.base.org';
      const walletAddress = process.env.WALLET_ADDRESS || process.env.VITE_WALLET_ADDRESS;
      
      let balanceUsdc = 0;

      if (walletAddress) {
        const publicClient = createPublicClient({
          chain: base,
          transport: http(rpcUrl),
        });

        const balanceWei = await publicClient.readContract({
          address: USDC_ADDRESS,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [walletAddress as `0x${string}`],
        } as any);
        
        balanceUsdc = parseFloat(formatUnits(balanceWei as bigint, 6));
      }

      res.json({
        walletAddress: walletAddress || null,
        balanceUsdc,
        riskPerTrade: parseFloat(process.env.RISK_PER_TRADE || '0.01'),
        maxEntryPrice: parseFloat(process.env.MAX_ENTRY_PRICE || '0.10'),
        dynamicFlipProfit: parseFloat(process.env.DYNAMIC_FLIP_PROFIT || '3.00'),
        sigmaThreshold: parseFloat(process.env.SIGMA_THRESHOLD || '2.5'),
        isConfigured: !!process.env.PRIVATE_KEY
      });
    } catch (error) {
      console.error('Error reading config/balance:', error);
      res.status(500).json({ error: 'Failed to read config or balance' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[QuantBot] Institutional Quant Bot server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
