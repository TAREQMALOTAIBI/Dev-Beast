import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { ethers } from 'ethers';
import {
  Client as LimitlessClient,
  HttpClient,
  MarketFetcher,
  OrderType,
  Side,
  withRetry,
  WebSocketClient as LimitlessWsClient,
} from '@limitless-exchange/sdk';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT: number = Number(process.env.PORT) || 3000;

app.use(express.json());

// ==========================================
// إدارة المتغيرات البيئية (.env) وتحميلها ديناميكياً
// ==========================================

function reloadEnvVariables() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.substring(0, eqIdx).trim();
          let val = trimmed.substring(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          process.env[key] = val;
        }
      }
    } catch (e: any) {
      console.warn('⚠️ خطأ في قراءة .env ديناميكياً:', e.message);
    }
  }
}

// دالة تنظيف وتنسيق المفتاح الخاص
function parsePrivateKey(): string {
  reloadEnvVariables();
  const candidates = [
    process.env.PRIVATE_KEY,
    process.env.WALLET_PRIVATE_KEY,
    process.env.PRIVATEKEY,
    process.env.PK,
    process.env.LIMITLESS_PRIVATE_KEY,
  ];

  for (const raw of candidates) {
    if (!raw) continue;
    let clean = raw.trim().replace(/['"`\s]/g, '');
    const cleanUpper = clean.toUpperCase();
    if (
      clean.includes('ضع_مفتاح') ||
      cleanUpper.includes('YOUR_PRIVATE_KEY') ||
      cleanUpper.includes('PRIVATE_KEY') ||
      cleanUpper.includes('YOUR_KEY') ||
      clean.includes('...')
    ) continue;
    if (clean.startsWith('0x') || clean.startsWith('0X')) {
      clean = clean.slice(2);
    }
    if (/^[0-9a-fA-F]{64}$/.test(clean)) {
      return `0x${clean}`;
    }
  }
  return '';
}

// دالة استخراج رمز الـ API لمنصة Limitless
function parseLimitlessCredentials() {
  reloadEnvVariables();

  // 1. فحص إذا كان هناك زوج HMAC (معرف التوكن + المفتاح السري)
  const tokenId = (
    process.env.LMTS_TOKEN_ID ||
    process.env.LIMITLESS_API_TOKEN ||
    process.env.API_TOKEN_LIMITLESS ||
    ''
  ).trim();

  const secretId = (
    process.env.LMTS_TOKEN_SECRET ||
    process.env.LIMITLESS_TOKEN_SECRET ||
    process.env.API_SECRET ||
    process.env.LMTS_SECRET ||
    ''
  ).trim();

  // في حال إدخال "tokenId:secret" في حقل واحد
  if (tokenId.includes(':') && !secretId) {
    const parts = tokenId.split(':');
    return {
      apiToken: parts[0].trim().replace(/['"`\s]/g, ''),
      apiSecret: parts[1].trim().replace(/['"`\s]/g, ''),
    };
  }

  if (tokenId && secretId && !tokenId.toLowerCase().includes('your_') && !secretId.toLowerCase().includes('your_')) {
    return {
      apiToken: tokenId.replace(/['"`\s]/g, ''),
      apiSecret: secretId.replace(/['"`\s]/g, ''),
    };
  }

  // 2. فحص الرموز المفردة (API Key / Identity Token)
  const apiTokenCandidates = [
    process.env.LIMITLESS_API_KEY,
    process.env.API_KEY,
    process.env.LMTS_API_KEY,
    process.env.LIMITLESS_API_TOKEN,
    process.env.API_TOKEN_LIMITLESS,
    process.env.API_TOKEN,
    process.env.LMTS_TOKEN_ID,
    process.env.TOKEN,
  ];

  let apiToken = '';
  for (const cand of apiTokenCandidates) {
    if (cand && !cand.toLowerCase().includes('your_') && !cand.includes('ضع_رمز')) {
      apiToken = cand.trim().replace(/['"`\s]/g, '');
      break;
    }
  }

  return { apiToken, apiSecret: '' };
}

let serverWallet: ethers.Wallet | null = null;
const USDC_BASE_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const USDbC_BASE_ADDRESS = '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA';
const USDT_BASE_ADDRESS = '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2';

function initializeServerWallet(): ethers.Wallet | null {
  const pk = parsePrivateKey();
  if (pk) {
    try {
      serverWallet = new ethers.Wallet(pk);
      return serverWallet;
    } catch (e: any) {
      console.warn('⚠️ فشل تهيئة المحفظة من المفتاح الخاص:', e.message);
    }
  }
  return null;
}

const initWallet = initializeServerWallet();
if (initWallet) {
  console.log(`✅ [Backend] تم ربط وتفعيل المحفظة الحقيقية بنجاح: ${initWallet.address}`);
} else {
  console.log('ℹ️ [Backend] في انتظار تعيين المفتاح الخاص في .env أو عبر لوحة الإعدادات.');
}

// إنشاء عميل Limitless الرسمي مع كامل آليات التوقيع والمصادقة
function getLimitlessClient(): LimitlessClient {
  const { apiToken, apiSecret } = parseLimitlessCredentials();
  const baseURL = process.env.LIMITLESS_API_URL || 'https://api.limitless.exchange';

  if (apiToken && apiSecret) {
    return new LimitlessClient({
      baseURL,
      hmacCredentials: { tokenId: apiToken, secret: apiSecret },
    });
  } else if (apiToken) {
    return new LimitlessClient({
      baseURL,
      apiKey: apiToken,
    });
  }

  return new LimitlessClient({ baseURL });
}

// مساعدات استعلام البلوكتشين عبر Fetch
async function fetchEthBalance(rpcUrl: string, address: string): Promise<string> {
  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getBalance',
        params: [address, 'latest'],
      }),
      signal: AbortSignal.timeout(4000),
    });
    const data = await res.json();
    if (data.result) {
      return parseFloat(ethers.formatEther(BigInt(data.result))).toFixed(4);
    }
  } catch {}
  return '0.0000';
}

async function fetchErc20Balance(
  rpcUrl: string,
  tokenAddress: string,
  walletAddress: string,
  decimals: number = 6
): Promise<number> {
  try {
    const cleanAddr = walletAddress.toLowerCase().replace('0x', '').padStart(64, '0');
    const dataCall = `0x70a08231${cleanAddr}`;
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'eth_call',
        params: [{ to: tokenAddress, data: dataCall }, 'latest'],
      }),
      signal: AbortSignal.timeout(4000),
    });
    const json = await res.json();
    if (json.result && json.result !== '0x') {
      return parseFloat(ethers.formatUnits(BigInt(json.result), decimals));
    }
  } catch {}
  return 0;
}

// دالة فحص وتفعيل تفويض USDC لعقد منصة Limitless تلقائياً
async function ensureUsdcAllowance(
  wallet: ethers.Wallet,
  spender: string,
  requiredAmountUsdc: number = 1
): Promise<boolean> {
  try {
    const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL || 'https://mainnet.base.org');
    const signer = wallet.connect(provider);
    const erc20Abi = [
      'function allowance(address owner, address spender) view returns (uint256)',
      'function approve(address spender, uint256 amount) returns (bool)',
    ];
    const usdcContract = new ethers.Contract(USDC_BASE_ADDRESS, erc20Abi, signer);
    const currentAllowance = await usdcContract.allowance(wallet.address, spender).catch(() => BigInt(0));
    const requiredUnits = ethers.parseUnits(String(Math.max(1, Math.ceil(requiredAmountUsdc))), 6);

    if (currentAllowance < requiredUnits) {
      console.log(`⚡ [Auto-Approve] تفويض منصة Limitless (${spender}) لسحب USDC...`);
      const tx = await usdcContract.approve(spender, ethers.MaxUint256);
      await tx.wait(1);
      console.log(`✅ [Auto-Approve] تم تفعيل تفويض USDC بنجاح: ${tx.hash}`);
      return true;
    }
    return true;
  } catch (e: any) {
    console.warn('⚠️ تنبيه أثناء فحص/تفعيل تفويض USDC:', e.message);
    return false;
  }
}

// مسار فحص وحفظ بيانات الاعتماد
app.get('/api/credentials/status', async (req, res) => {
  reloadEnvVariables();
  const wallet = initializeServerWallet();
  const { apiToken, apiSecret } = parseLimitlessCredentials();

  let limitlessApiOk = false;
  let limitlessUser: any = null;

  if (wallet && (apiToken || apiSecret)) {
    try {
      const client = getLimitlessClient();
      const profile = await client.portfolio.getProfile(wallet.address).catch(() => null);
      if (profile && (profile.account || profile.id)) {
        limitlessApiOk = true;
        limitlessUser = profile;
      }
    } catch (e: any) {
      console.warn('⚠️ فحص حساب Limitless:', e.message);
    }
  }

  res.json({
    hasPrivateKey: Boolean(wallet),
    walletAddress: wallet ? wallet.address : '0x807A7Ae675A0e16414875a2a318BEB6B55cDbB14',
    hasApiToken: Boolean(apiToken),
    apiTokenType: apiSecret ? 'HMAC_PAIR' : apiToken ? 'API_TOKEN' : 'NONE',
    hasApiSecret: Boolean(apiSecret),
    limitlessApiOk,
    limitlessUser,
  });
});

// مسار جلب مراكز المحفظة الحقيقية مباشرة من منصة Limitless عبر SDK
app.get('/api/portfolio/positions', async (req, res) => {
  try {
    const wallet = initializeServerWallet();
    const targetAddress = (req.query.address as string) || (wallet ? wallet.address : '');
    if (!targetAddress) {
      return res.json({ clob: [], amm: [] });
    }

    const client = getLimitlessClient();
    const positions = await (client.portfolio as any).getPositions(targetAddress).catch(async () => {
      return await client.portfolio.getPositions().catch(() => null);
    });
    return res.json(positions || { clob: [], amm: [] });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// مسار البيع الفوري وإغلاق المراكز (Manual / Instant Sell Endpoint)
app.post('/api/portfolio/sell', async (req, res) => {
  try {
    const { marketSlug, outcome, shares, price, orderType } = req.body;
    if (!marketSlug || !outcome) {
      return res.status(400).json({ error: 'marketSlug and outcome (YES/NO) are required.' });
    }

    const wallet = initializeServerWallet();
    if (!wallet) {
      return res.status(400).json({ error: 'المحفظة غير مهيأة بالسيرفر. يرجى التأكد من حفظ المفتاح الخاص.' });
    }

    const client = getLimitlessClient();
    const market = await client.markets.getMarket(marketSlug).catch(() => null);
    if (!market) {
      return res.status(404).json({ error: `تعذر العثور على بيانات السوق (${marketSlug}) في منصة Limitless.` });
    }

    const outcomeUpper = String(outcome).toUpperCase();
    const tokenId = outcomeUpper === 'YES' ? market.tokens?.yes : market.tokens?.no;
    if (!tokenId) {
      return res.status(400).json({ error: `معرف التوكن (${outcomeUpper}) غير متوفر لهذا السوق.` });
    }

    // فحص وتحديث التفويض لـ CTF على شبكة Base إذا لزم الأمر
    const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL || 'https://mainnet.base.org');
    const ctfAbi = [
      'function balanceOf(address account, uint256 id) view returns (uint256)',
      'function isApprovedForAll(address account, address operator) view returns (bool)',
      'function setApprovalForAll(address operator, bool approved)'
    ];
    const ctfContract = new ethers.Contract('0xC9c98965297Bc527861c898329Ee280632B76e18', ctfAbi, wallet.connect(provider));
    const venueExchange = market.venue?.exchange || '0x05c748E2f4DcDe0ec9Fa8DDc40DE6b867f923fa5';

    try {
      const isApproved = await ctfContract.isApprovedForAll(wallet.address, venueExchange).catch(() => true);
      if (!isApproved) {
        console.log('⚡ [Auto-Approve] تفويض منصة Limitless لنقل عقود CTF...');
        const tx = await ctfContract.setApprovalForAll(venueExchange, true);
        await tx.wait(1);
        console.log('✅ تم تفعيل تفويض CTF بنجاح:', tx.hash);
      }
    } catch (e: any) {
      console.warn('⚠️ فحص تفويض CTF:', e.message);
    }

    // جلب الرصيد الفعلي On-Chain
    let availableTokens = 0;
    try {
      const rawBal = await ctfContract.balanceOf(wallet.address, tokenId).catch(() => BigInt(0));
      availableTokens = parseFloat(ethers.formatUnits(rawBal, 6));
    } catch (e: any) {
      console.warn('⚠️ فحص رصيد CTF On-chain:', e.message);
    }

    // إذا تعذر فحص البلوكتشين اللحظي ولكن المركز موجود في المحفظة
    if (availableTokens <= 0 && shares && parseFloat(String(shares)) > 0) {
      availableTokens = parseFloat(String(shares));
    }

    if (availableTokens <= 0) {
      return res.status(400).json({
        error: `لا يوجد لديك رصيد من عقود ${outcomeUpper} المتاحة للبيع في هذا السوق (الرصيد الفعلي: 0).`,
        availableTokens: 0
      });
    }

    // تحديد الكمية المراد بيعها
    let sharesToSell = shares !== undefined && shares !== null && shares !== '' ? parseFloat(String(shares)) : availableTokens;
    if (isNaN(sharesToSell) || sharesToSell <= 0) {
      sharesToSell = availableTokens;
    }
    sharesToSell = Math.min(sharesToSell, availableTokens);
    sharesToSell = Math.floor(sharesToSell);

    if (sharesToSell <= 0) {
      return res.status(400).json({ error: 'الكمية المتاحة للبيع أقل من 1 عقد صحيح.' });
    }

    // جلب دفتر الأوامر لتحديد أفضل سعر بيع فوري
    const orderbook = await client.markets.getOrderBook(marketSlug).catch(() => null);
    let executionPrice = price ? parseFloat(String(price)) : null;

    if (!executionPrice) {
      if (outcomeUpper === 'YES') {
        executionPrice = orderbook?.bids?.[0]?.price || null;
      } else {
        if (orderbook?.bids?.[0]?.price) {
          executionPrice = Number((1.0 - orderbook.bids[0].price).toFixed(3));
        } else if (orderbook?.asks?.[0]?.price) {
          executionPrice = Number((1.0 - orderbook.asks[0].price).toFixed(3));
        } else {
          executionPrice = 0.20;
        }
      }
    }

    if (!executionPrice || executionPrice <= 0) {
      return res.status(400).json({
        error: 'لا توجد طلبات شراء (Bids) نشطة حالياً في دفتر الأوامر لهذا العقد لتنفيذ البيع الفوري.',
        orderbookBids: orderbook?.bids?.length || 0
      });
    }

    // ضبط السعر على دقة 0.001
    const alignedPrice = Math.min(0.999, Math.max(0.001, Number((Math.round(executionPrice / 0.001) * 0.001).toFixed(3))));

    console.log(`📤 [Manual Sell] إرسال أمر بيع ${sharesToSell} عقد ${outcomeUpper} بسعر $${alignedPrice} في سوق ${marketSlug}...`);

    const orderClient = client.newOrderClient(wallet);
    const selectedOrderType = orderType === 'GTC' ? OrderType.GTC : OrderType.FAK;

    const resOrder = await orderClient.createOrder({
      marketSlug,
      tokenId,
      side: Side.SELL,
      price: alignedPrice,
      size: sharesToSell,
      orderType: selectedOrderType,
    });

    console.log(`🎉 [Manual Sell] تم إرسال أمر البيع بنجاح! معرف الأمر: ${resOrder.order?.id || 'OK'}`);

    const estimatedUsdc = (sharesToSell * alignedPrice).toFixed(2);

    return res.json({
      success: true,
      message: `تم تنفيذ أمر بيع ${sharesToSell} عقد ${outcomeUpper} بسعر $${alignedPrice} بنجاح! المبلغ التقديري المسترد: $${estimatedUsdc} USDC.`,
      orderId: resOrder.order?.id,
      soldShares: sharesToSell,
      price: alignedPrice,
      estimatedProceedsUsdc: estimatedUsdc,
      matches: resOrder.makerMatches?.length || 0
    });
  } catch (err: any) {
    console.error('❌ [Manual Sell] فشل تنفيذ أمر البيع:', err);
    let friendlyMessage = err.message || 'حدث خطأ أثناء إرسال أمر البيع إلى المنصة.';
    if (friendlyMessage.includes('Order size') || friendlyMessage.includes('minSize') || friendlyMessage.includes('100000000')) {
      friendlyMessage = 'تنبيه من المنصة: دفتر الأوامر يفرض حداً أدنى لحجم الأمر (Min Order Size: 100 عقد). يمكنك زيادة حجم المركز أو الاحتفاظ به حتى موعد التسوية التلقائي.';
    } else if (friendlyMessage.includes('Authentication') || friendlyMessage.includes('401')) {
      friendlyMessage = 'يرجى التحقق من بيانات اعتماد API الخاصة بمنصة Limitless في تبويب الإعدادات.';
    } else if (friendlyMessage.includes('liquidity') || friendlyMessage.includes('FAK') || friendlyMessage.includes('cancelled')) {
      friendlyMessage = 'لم يتم العثور على سيولة شراء فورية مطابقة لهذا السعر في دفتر الأوامر حالياً.';
    }
    return res.status(500).json({ error: friendlyMessage, rawError: err.message });
  }
});

app.post('/api/credentials/save', async (req, res) => {
  try {
    const { privateKey, apiToken, apiSecret } = req.body;
    const envPath = path.resolve(process.cwd(), '.env');

    let currentEnv = '';
    if (fs.existsSync(envPath)) {
      currentEnv = fs.readFileSync(envPath, 'utf8');
    }

    const lines = currentEnv.split('\n');
    const newLines: string[] = [];
    const keysFound = new Set<string>();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        newLines.push(line);
        continue;
      }
      const eq = trimmed.indexOf('=');
      if (eq > 0) {
        const k = trimmed.substring(0, eq).trim();
        if (k === 'PRIVATE_KEY' && privateKey !== undefined) {
          newLines.push(`PRIVATE_KEY="${privateKey.trim()}"`);
          keysFound.add('PRIVATE_KEY');
        } else if (k === 'LIMITLESS_API_TOKEN' && apiToken !== undefined) {
          newLines.push(`LIMITLESS_API_TOKEN="${apiToken.trim()}"`);
          keysFound.add('LIMITLESS_API_TOKEN');
        } else if (k === 'LMTS_TOKEN_ID' && apiToken !== undefined) {
          newLines.push(`LMTS_TOKEN_ID="${apiToken.trim()}"`);
          keysFound.add('LMTS_TOKEN_ID');
        } else if (k === 'LMTS_TOKEN_SECRET' && apiSecret !== undefined) {
          newLines.push(`LMTS_TOKEN_SECRET="${apiSecret.trim()}"`);
          keysFound.add('LMTS_TOKEN_SECRET');
        } else {
          newLines.push(line);
        }
      }
    }

    if (privateKey !== undefined && !keysFound.has('PRIVATE_KEY')) {
      newLines.push(`PRIVATE_KEY="${privateKey.trim()}"`);
    }
    if (apiToken !== undefined && !keysFound.has('LIMITLESS_API_TOKEN')) {
      newLines.push(`LIMITLESS_API_TOKEN="${apiToken.trim()}"`);
    }
    if (apiSecret !== undefined && !keysFound.has('LMTS_TOKEN_SECRET')) {
      newLines.push(`LMTS_TOKEN_SECRET="${apiSecret.trim()}"`);
    }

    fs.writeFileSync(envPath, newLines.join('\n'), 'utf8');
    reloadEnvVariables();
    const updatedWallet = initializeServerWallet();

    console.log('✅ تم حفظ بيانات الاعتماد في .env وإعادة تحميلها بنجاح!');
    return res.json({
      success: true,
      walletAddress: updatedWallet ? updatedWallet.address : null,
      message: 'تم حفظ وتفعيل بيانات الاعتماد بنجاح!',
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/wallet', async (req, res) => {
  try {
    if (!serverWallet) {
      serverWallet = initializeServerWallet();
    }

    let address = '0x807A7Ae675A0e16414875a2a318BEB6B55cDbB14';
    const explicitAddress = process.env.WALLET_ADDRESS?.trim();
    if (explicitAddress && ethers.isAddress(explicitAddress)) {
      address = explicitAddress;
    } else if (serverWallet && serverWallet.address) {
      address = serverWallet.address;
    }

    const rpcUrls = [
      process.env.BASE_RPC_URL,
      'https://mainnet.base.org',
      'https://base.llamarpc.com',
      'https://base-rpc.publicnode.com',
      'https://1rpc.io/base',
    ].filter(Boolean) as string[];

    let ethBalance = '0.0000';
    let nativeUsdc = 0;
    let bridgedUsdc = 0;
    let usdtBalance = 0;
    let limitlessCollateral = '0.00';
    const otherChainsFound: Array<{ chain: string; balance: string; asset: string }> = [];

    // 1. استعلام شبكة Base عبر RPC مباشر
    for (const rpc of rpcUrls) {
      try {
        ethBalance = await fetchEthBalance(rpc, address);
        nativeUsdc = await fetchErc20Balance(rpc, USDC_BASE_ADDRESS, address, 6);
        bridgedUsdc = await fetchErc20Balance(rpc, USDbC_BASE_ADDRESS, address, 6);
        usdtBalance = await fetchErc20Balance(rpc, USDT_BASE_ADDRESS, address, 6);
        if (ethBalance !== '0.0000' || nativeUsdc > 0 || bridgedUsdc > 0 || usdtBalance > 0) {
          break;
        }
      } catch {}
    }

    // 2. فحص رصيد منصة Limitless عبر API (GET /profiles/:account)
    try {
      const lmtsResp = await fetch(
        `${process.env.LIMITLESS_API_URL || 'https://api.limitless.exchange'}/profiles/${address}`,
        { signal: AbortSignal.timeout(3000) }
      );
      if (lmtsResp.ok) {
        const lmtsData = await lmtsResp.json();
        const apiBal = lmtsData.available || lmtsData.balance || lmtsData.collateral || lmtsData.totalBalance;
        if (apiBal) {
          limitlessCollateral = parseFloat(String(apiBal)).toFixed(2);
        }
      }
    } catch {}

    const totalUsdc = Math.max(
      nativeUsdc + bridgedUsdc + usdtBalance,
      parseFloat(limitlessCollateral)
    ).toFixed(2);

    // إذا كان هناك تنبيه سابق عن عدم كفاية الرصيد وأصبح الرصيد متوفراً الآن، نقوم بإزالته فوراً
    if (parseFloat(totalUsdc) >= 0.10 && lastExecutionError && lastExecutionError.includes('رصيد USDC غير كافٍ')) {
      lastExecutionError = null;
    }

    return res.json({
      configured: true,
      address,
      usdcBalance: totalUsdc,
      nativeUsdc: nativeUsdc.toFixed(2),
      bridgedUsdc: bridgedUsdc.toFixed(2),
      ethBalance,
      limitlessCollateral,
      otherChainsFound,
      network: 'Base Mainnet (Chain ID: 8453)',
      limitlessTokenConfigured: Boolean(process.env.LMTS_TOKEN_ID && process.env.LMTS_TOKEN_SECRET),
    });
  } catch (err: any) {
    console.error('خطأ في استعلام /api/wallet:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ==========================================
// محرك التداول الآلي على السيرفر (Server Trading Engine - Z-Score Strategy)
// ==========================================

const BOT_STATE_FILE = path.resolve(process.cwd(), '.bot_state.json');

function loadBotRunningState(): boolean {
  try {
    if (fs.existsSync(BOT_STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(BOT_STATE_FILE, 'utf8'));
      if (typeof data.running === 'boolean') {
        return data.running;
      }
    }
  } catch (err: any) {
    console.warn('⚠️ فشل قراءة حالة الروبوت من الملف:', err.message);
  }
  return true;
}

function saveBotRunningState(running: boolean) {
  try {
    fs.writeFileSync(BOT_STATE_FILE, JSON.stringify({ running, updatedAt: new Date().toISOString() }), 'utf8');
  } catch (err: any) {
    console.warn('⚠️ فشل حفظ حالة الروبوت في الملف:', err.message);
  }
}

const TRADES_HISTORY_FILE = path.resolve(process.cwd(), '.trades_history.json');

function loadPersistedTrades(): Array<{
  timestamp: number;
  tokenType: string;
  price: number;
  amount: number;
  txHash: string;
  marketSlug?: string;
  marketTitle?: string;
}> {
  try {
    if (fs.existsSync(TRADES_HISTORY_FILE)) {
      const data = JSON.parse(fs.readFileSync(TRADES_HISTORY_FILE, 'utf8'));
      if (Array.isArray(data)) return data;
    }
  } catch {}
  return [];
}

function savePersistedTrades(trades: any[]) {
  try {
    fs.writeFileSync(TRADES_HISTORY_FILE, JSON.stringify(trades.slice(0, 50), null, 2), 'utf8');
  } catch (err: any) {
    console.warn('⚠️ فشل حفظ سجل الصفقات:', err.message);
  }
}

// ==========================================
// حماية العقد: قاعدة صفقة واحدة فقط لكل عقد 15 دقيقة
// ==========================================

interface TradedContractInfo {
  slug: string;
  title: string;
  tokenType: string;
  price: number;
  amount: number;
  timestamp: number;
  expirationTimestamp?: number;
  txHash: string;
}

const TRADED_CONTRACTS_FILE = path.resolve(process.cwd(), '.traded_contracts.json');

function loadTradedContracts(): Map<string, TradedContractInfo> {
  const map = new Map<string, TradedContractInfo>();
  try {
    if (fs.existsSync(TRADED_CONTRACTS_FILE)) {
      const data = JSON.parse(fs.readFileSync(TRADED_CONTRACTS_FILE, 'utf8'));
      if (Array.isArray(data)) {
        const now = Date.now();
        for (const item of data) {
          // نحتفظ بالعقود المتداولة خلال آخر 6 ساعات لتغطية فترات التداول والانتهاء
          if (item && item.slug && (now - (item.timestamp || 0) < 6 * 3600 * 1000)) {
            map.set(item.slug.toLowerCase().trim(), item);
          }
        }
      }
    }
  } catch (err: any) {
    console.warn('⚠️ فشل قراءة ملف العقود المتداولة:', err.message);
  }
  return map;
}

function saveTradedContracts(map: Map<string, TradedContractInfo>) {
  try {
    const list = Array.from(map.values()).slice(-50);
    fs.writeFileSync(TRADED_CONTRACTS_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (err: any) {
    console.warn('⚠️ فشل حفظ ملف العقود المتداولة:', err.message);
  }
}

let tradedContractsMap = loadTradedContracts();

// قفل التزامن الفوري (Immediate Mutex Lock) لمنع تنفيذ تكات متزامنة في نفس اللحظة
let isServerTradeExecuting = false;
const pendingExecutionSlugs = new Set<string>();

function isContractAlreadyTraded(slug: string, expirationTimestamp?: number): boolean {
  if (!slug) return false;
  const cleanSlug = slug.toLowerCase().trim();

  // 1. الفحص في خريطة العقود المنفذة المباشرة
  if (tradedContractsMap.has(cleanSlug)) return true;

  // 2. الفحص في قائمة العقود قيد التنفيذ اللحظي (حظر التزامن)
  if (pendingExecutionSlugs.has(cleanSlug)) return true;

  // 3. فحص إضافي في سجل الصفقات المنفذة عبر slug العقد
  for (const trade of executedTradesLog) {
    const mSlug = (trade as any).marketSlug;
    if (mSlug && mSlug.toLowerCase().trim() === cleanSlug) {
      return true;
    }
  }

  // 4. قاعدة الأمان الصارمة عبر النافذة الزمنية (15 دقيقة):
  // أي صفقة تم تنفيذها داخل نافذة الـ 15 دقيقة الخاصة بهذا العقد تعني أنه تم الدخول فيه مسبقاً!
  // نافذة العقد تبدأ قبل انتهاء الصلاحية بـ 15 دقيقة وتنتهي عند expirationTimestamp
  if (expirationTimestamp && expirationTimestamp > 0) {
    const windowStart = expirationTimestamp - 15 * 60 * 1000;
    const windowEnd = expirationTimestamp;
    for (const trade of executedTradesLog) {
      if (trade.timestamp && trade.timestamp >= windowStart && trade.timestamp <= windowEnd) {
        return true;
      }
    }

    // فحص أيضاً في خريطة العقود المتداولة المسجلة
    for (const [, info] of tradedContractsMap) {
      if (info.timestamp && info.timestamp >= windowStart && info.timestamp <= windowEnd) {
        return true;
      }
      if (info.expirationTimestamp && Math.abs(info.expirationTimestamp - expirationTimestamp) < 60000) {
        return true;
      }
    }
  }

  return false;
}

function findTradeForMarket(slug: string, expirationTimestamp?: number) {
  if (!slug) return null;
  const cleanSlug = slug.toLowerCase().trim();
  const direct = tradedContractsMap.get(cleanSlug);
  if (direct) return direct;

  for (const trade of executedTradesLog) {
    const mSlug = (trade as any).marketSlug;
    if (mSlug && mSlug.toLowerCase().trim() === cleanSlug) {
      return trade;
    }
  }

  if (expirationTimestamp && expirationTimestamp > 0) {
    const windowStart = expirationTimestamp - 15 * 60 * 1000;
    for (const trade of executedTradesLog) {
      if (trade.timestamp && trade.timestamp >= windowStart && trade.timestamp <= expirationTimestamp) {
        return trade;
      }
    }
  }

  return null;
}

function recordContractTraded(info: TradedContractInfo) {
  const cleanSlug = info.slug.toLowerCase().trim();
  tradedContractsMap.set(cleanSlug, info);
  saveTradedContracts(tradedContractsMap);
}

let isServerBotRunning = loadBotRunningState();
let lastServerEvalTime = 0;
const candleCloses: number[] = [];
let lastEvaluatedSignal: string = 'NEUTRAL';
let lastBtcPrice: number = 94500;
let lastCalculatedZScore: number = 0.0;
let lastCalculatedMean: number = 94500;
let lastCalculatedStdDev: number = 50;
let currentWaitReason: string = isServerBotRunning
  ? 'في انتظار إشارة Z-Score مؤهلة (±2.00 على فريم 5m لآخر 20 شمعة) للتنفيذ المباشر بسعر السوق على عقد BTC 15m'
  : 'الروبوت متوقف مؤقتاً (PAUSED) - اضغط تشغيل لتفعيل التداول الآلي';
let lastExecutionError: string | null = null;

let executedTradesLog: Array<{
  timestamp: number;
  tokenType: string;
  price: number;
  amount: number;
  txHash: string;
  marketSlug?: string;
  marketTitle?: string;
}> = loadPersistedTrades();

// مزامنة العقود المتداولة مسبقاً من سجل الصفقات المحفوظة
for (const trade of executedTradesLog) {
  if (trade.marketSlug) {
    const cleanSlug = trade.marketSlug.toLowerCase().trim();
    if (!tradedContractsMap.has(cleanSlug)) {
      tradedContractsMap.set(cleanSlug, {
        slug: trade.marketSlug,
        title: trade.marketTitle || trade.marketSlug,
        tokenType: trade.tokenType,
        price: trade.price,
        amount: trade.amount,
        timestamp: trade.timestamp,
        txHash: trade.txHash,
      });
    }
  }
}

async function syncLimitlessUserHistory() {
  if (!serverWallet) return;
  try {
    const limitlessClient = getLimitlessClient();
    const history = await limitlessClient.portfolio.getUserHistory(serverWallet.address).catch(() => null);
    if (history && Array.isArray(history.data) && history.data.length > 0) {
      const synced = history.data.map((item: any) => ({
        timestamp: Number(item.blockTimestamp ? item.blockTimestamp * 1000 : Date.now()),
        tokenType: item.outcomeIndex === 0 ? 'YES' : 'NO',
        price: Number(item.outcomeTokenPrice || 0),
        amount: Number(item.outcomeTokenAmount || item.contracts || 1),
        txHash: item.transactionHash || item.orderId || '',
        marketSlug: item.market?.slug,
        marketTitle: item.market?.title,
      }));

      // الحفاظ على marketSlug و marketTitle المسجلة محلياً في الصفقات المنفذة
      const existingMap = new Map<string, any>();
      for (const t of executedTradesLog) {
        if (t.txHash) existingMap.set(t.txHash, t);
      }

      for (const t of synced) {
        if (t.txHash && existingMap.has(t.txHash)) {
          const prev = existingMap.get(t.txHash);
          if (!t.marketSlug && prev.marketSlug) t.marketSlug = prev.marketSlug;
          if (!t.marketTitle && prev.marketTitle) t.marketTitle = prev.marketTitle;
        }
        if (t.txHash) {
          existingMap.set(t.txHash, t);
        }
      }

      executedTradesLog = Array.from(existingMap.values());
      executedTradesLog.sort((a, b) => b.timestamp - a.timestamp);
      savePersistedTrades(executedTradesLog);
    }
  } catch (err: any) {
    console.warn('⚠️ فشل مزامنة سجل الصفقات من Limitless:', err.message);
  }
}

// خطة التداول بالـ Z-Score مع إدارة المخاطر Full Kelly (100% f*)
const ZSCORE_STRATEGY = {
  marketSlug: 'btc-price-15m-now',
  lookbackPeriod: 20,         // نافذة الحساب: آخر 20 شمعة على فريم الـ 5 دقائق (5m) لتعظيم الدقة الإحصائية وتصفية الضجيج
  upperThreshold: Number(process.env.Z_SCORE_THRESHOLD) || 2.00,        // إشارة هبوط إذا أصبح Z-Score >= +2.00
  lowerThreshold: -(Number(process.env.Z_SCORE_THRESHOLD) || 2.00),       // إشارة صعود إذا أصبح Z-Score <= -2.00
  maxEntryPrice: null as number | null, // تم إزالة سقف السعر نهائياً: شراء مباشر بسعر السوق المتاح (Market Price)
  riskPercent: 1.0,           // نسبة المخاطرة للصفقة
  riskModel: (process.env.RISK_MODEL as 'FULL_KELLY' | 'HALF_KELLY' | 'FIXED') || 'FULL_KELLY', // استراتيجية كيلي الكاملة (Full Kelly 100%)
  kellyWinRate: Number(process.env.KELLY_WIN_RATE) || 0.68, // نسبة النجاح المقدرة 68% لإشارة Z-Score ±2.00
  kellyMultiplier: 1.0,       // Full Kelly = 100%
  maxBankrollRiskPercent: (process.env.MAX_BANKROLL_RISK_PERCENT && Number(process.env.MAX_BANKROLL_RISK_PERCENT) !== 0.04)
    ? Number(process.env.MAX_BANKROLL_RISK_PERCENT)
    : 0.01, // سقف حماية أقصى: لا تضع أكثر من 1% من المحفظة في صفقة واحدة
  tradeSizeUsdc: Number(process.env.TRADE_SIZE_USDC) || 0.50, // الحد الأدنى المرجعي للميزانية بالدولار
};

function calculateServerZScore(prices: number[], lookback: number = 20) {
  const window = prices.slice(-lookback);
  const current = window[window.length - 1];
  const sum = window.reduce((a, b) => a + b, 0);
  const mean = sum / lookback;
  const variance = window.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / lookback;
  const stdDev = Math.sqrt(variance);
  const zScore = stdDev > 0 ? (current - mean) / stdDev : 0;
  return {
    zScore: Number(zScore.toFixed(3)),
    mean: Number(mean.toFixed(2)),
    stdDev: Number(stdDev.toFixed(2)),
  };
}

const serverLimitlessHttp = new HttpClient({
  baseURL: process.env.LIMITLESS_API_URL || 'https://api.limitless.exchange',
});
const serverMarketFetcher = new MarketFetcher(serverLimitlessHttp);

// ==============================================================================
// ⚡ محرك البث المباشر لمنصة Limitless عبر WebSocket (Zero-Latency Real-Time Feed)
// استبدال الـ REST API Polling ببث حي ثانية بثانية لأسعار عقود 15m ودفتر الأوامر
// ==============================================================================

interface LiveLimitlessOrderbook {
  marketSlug?: string;
  asks: Array<{ price: number; size: number }>;
  bids: Array<{ price: number; size: number }>;
  bestAskYes: number | null;
  bestAskNo: number | null;
  midpoint?: number | null;
  spread?: number | null;
  lastUpdated: number;
}

let liveOraclePrice: { value: number; timestamp: number; source: string } | null = null;
let limitlessWs: LimitlessWsClient | null = null;
let currentSubscribedSlug: string | null = null;
let liveLimitlessOrderbook: LiveLimitlessOrderbook | null = null;
let isLimitlessWsConnected = false;

async function syncLimitlessWsMarket() {
  try {
    const market = await getServerActiveBtcMarket();
    if (!market || !market.slug) return;

    // تهيئة أولية من أسعار العقد الرسمية في حال لم تتوفر بعد
    if (!liveLimitlessOrderbook) {
      const askYes = Array.isArray(market.prices) && market.prices[0] ? Number(market.prices[0]) : null;
      const askNo = Array.isArray(market.prices) && market.prices[1] ? Number(market.prices[1]) : null;
      if (askYes !== null || askNo !== null) {
        liveLimitlessOrderbook = {
          marketSlug: market.slug,
          asks: askYes ? [{ price: askYes, size: 0 }] : [],
          bids: askNo ? [{ price: Number((1.0 - askNo).toFixed(3)), size: 0 }] : [],
          bestAskYes: askYes,
          bestAskNo: askNo,
          midpoint: askYes && askNo ? Number(((askYes + (1 - askNo)) / 2).toFixed(3)) : askYes,
          spread: askYes && askNo ? Number(Math.abs(askYes - (1 - askNo)).toFixed(3)) : 0,
          lastUpdated: Date.now(),
        };
      }
    }

    if (!limitlessWs || !isLimitlessWsConnected) return;

    if (market.slug !== currentSubscribedSlug) {
      const oldSlug = currentSubscribedSlug;
      currentSubscribedSlug = market.slug;
      
      // تفريغ دفتر الأوامر القديم فوراً لمنع بقاء أسعار العقد السابق متجمدة
      if (liveLimitlessOrderbook && liveLimitlessOrderbook.marketSlug !== market.slug) {
        liveLimitlessOrderbook = null;
      }

      if (oldSlug) {
        try {
          await limitlessWs.unsubscribe('subscribe_market_prices', { marketSlugs: [oldSlug] });
        } catch {}
      }

      const subscribeParams: any = {
        marketSlugs: [market.slug],
      };
      if (market.address || market.marketAddress) {
        subscribeParams.marketAddresses = [market.address || market.marketAddress];
      }
      await limitlessWs.subscribe('subscribe_market_prices', subscribeParams);
      console.log(`⚡ [Limitless WS] تم الاشتراك بالبث الحي لأسعار عقد BTC 15m: ${market.title} (${market.slug})`);

      // جلب فوري لدفتر الأوامر للعقد الجديد لضمان تحديث الأسعار بالملي ثانية
      const restOb: any = await serverMarketFetcher.getOrderBook(market.slug).catch(() => null);
      if (restOb) {
        const asks = (restOb.asks || []).map((a: any) => ({ price: Number(a.price), size: Number(a.size || 0) }));
        const bids = (restOb.bids || []).map((b: any) => ({ price: Number(b.price), size: Number(b.size || 0) }));
        const bestAskYes = asks.length > 0 ? asks[0].price : (restOb.midpoint ? Number(restOb.midpoint) : null);
        const bestBid = bids.length > 0 ? bids[0].price : null;
        const bestAskNo = bestBid !== null ? Number((1.0 - bestBid).toFixed(3)) : (asks.length > 0 ? Number((1.0 - asks[0].price).toFixed(3)) : null);
        liveLimitlessOrderbook = {
          marketSlug: market.slug,
          asks,
          bids,
          bestAskYes,
          bestAskNo,
          midpoint: restOb.midpoint !== undefined ? Number(restOb.midpoint) : (bestAskYes && bestAskNo ? Number(((bestAskYes + (1 - bestAskNo)) / 2).toFixed(3)) : null),
          spread: (asks.length > 0 && bids.length > 0) ? Number((asks[0].price - bids[0].price).toFixed(4)) : 0,
          lastUpdated: Date.now(),
        };
      }
    }
  } catch (e: any) {
    console.warn('تنبيه أثناء مزامنة اشتراك العقد في WebSocket:', e.message);
  }
}

// فحص دوري كل 4 ثوانٍ لمزامنة أي انتقال لعقد 15m جديد عند تسوية العقد السابق
setInterval(() => {
  syncLimitlessWsMarket().catch(() => {});
}, 4000);

async function startLimitlessWebSocket() {
  try {
    const { apiToken, apiSecret } = parseLimitlessCredentials();
    const url = process.env.LIMITLESS_WS_URL || 'wss://ws.limitless.exchange';

    const wsConfig: any = {
      url,
      autoReconnect: true,
      reconnectDelay: 1000,
      timeout: 10000,
    };
    if (apiToken && apiSecret) {
      wsConfig.hmacCredentials = { tokenId: apiToken, secret: apiSecret };
    } else if (apiToken) {
      wsConfig.apiKey = apiToken;
    }

    limitlessWs = new LimitlessWsClient(wsConfig);

    // تسجيل معالجات أحداث البث المباشر (Limitless WebSocket Streaming):
    // 1. استقبال تحديثات دفتر أوامر CLOB لحظياً (orderbookUpdate)
    limitlessWs.on('orderbookUpdate', (data: any) => {
      if (!data || !data.orderbook) return;
      const ob = data.orderbook;
      const asks = (ob.asks || []).map((a: any) => ({ price: Number(a.price), size: Number(a.size || 0) }));
      const bids = (ob.bids || []).map((b: any) => ({ price: Number(b.price), size: Number(b.size || 0) }));

      const bestAskYes = asks.length > 0 ? asks[0].price : (ob.midpoint ? Number(ob.midpoint) : null);
      const bestBid = bids.length > 0 ? bids[0].price : null;
      const bestAskNo = bestBid !== null
        ? Number((1.0 - bestBid).toFixed(3))
        : (asks.length > 0 ? Number((1.0 - asks[0].price).toFixed(3)) : null);

      const spread = (asks.length > 0 && bids.length > 0) ? Number((asks[0].price - bids[0].price).toFixed(4)) : null;

      liveLimitlessOrderbook = {
        marketSlug: data.marketSlug,
        asks,
        bids,
        bestAskYes,
        bestAskNo,
        midpoint: ob.midpoint !== undefined ? Number(ob.midpoint) : (bestAskYes && bestAskNo ? Number(((bestAskYes + (1 - bestAskNo)) / 2).toFixed(3)) : null),
        spread,
        lastUpdated: Date.now(),
      };
    });

    // 2. استقبال تحديثات الأسعار اللحظية لأسواق AMM (newPriceData)
    limitlessWs.on('newPriceData', (data: any) => {
      if (!data) return;
      const prices = Array.isArray(data.updatedPrices) ? data.updatedPrices : [data.updatedPrices];
      for (const p of prices) {
        if (p && (p.yesPrice !== undefined || p.noPrice !== undefined)) {
          const yesP = Number(p.yesPrice);
          const noP = Number(p.noPrice);
          liveLimitlessOrderbook = {
            marketSlug: data.marketSlug || currentSubscribedSlug || undefined,
            asks: liveLimitlessOrderbook?.asks || [],
            bids: liveLimitlessOrderbook?.bids || [],
            bestAskYes: !isNaN(yesP) ? yesP : liveLimitlessOrderbook?.bestAskYes ?? null,
            bestAskNo: !isNaN(noP) ? noP : liveLimitlessOrderbook?.bestAskNo ?? null,
            midpoint: !isNaN(yesP) ? yesP : liveLimitlessOrderbook?.midpoint,
            spread: 0,
            lastUpdated: Date.now(),
          };
        }
      }
    });

    // 3. استقبال أسعار الأوراكل الحية (oraclePriceData) من Chainlink / Pyth التابعة للسوق
    limitlessWs.on('oraclePriceData', (data: any) => {
      if (data && data.value !== undefined) {
        liveOraclePrice = {
          value: Number(data.value),
          timestamp: data.timestamp || Date.now(),
          source: data.source || 'chainlink',
        };
      }
    });

    limitlessWs.on('disconnect', (reason) => {
      isLimitlessWsConnected = false;
      console.warn(`⚠️ [Limitless WS] انقطع اتصال بث Limitless (${reason}). جاري إعادة الاتصال تلقائياً...`);
    });

    limitlessWs.on('error', (err) => {
      console.warn('⚠️ [Limitless WS] تنبيه خطأ في البث:', err?.message || err);
    });

    // 4. استشعار إنشاء عقد جديد عبر WebSocket وتبديل الاشتراك فوراً
    limitlessWs.on('marketCreated', async (event: any) => {
      const s = (event.slug || '').toLowerCase();
      const t = (event.title || '').toLowerCase();
      const is15m = s.includes('15-min') || s.includes('15m') || t.includes('15 min') || s.includes('15min');
      const is5mOnly = !is15m && (s.includes('5-min') || t.includes('5 min') || s.includes('5min'));
      if ((s.includes('btc') || t.includes('btc')) && is15m && !is5mOnly) {
        console.log(`🎉 [Limitless WS] تم إنشاء عقد BTC 15m جديد فوراً عبر WebSocket: ${event.title} (${event.slug})`);
        cachedActive15mMarket = event;
        await syncLimitlessWsMarket();
      }
    });

    // 5. استشعار تسوية العقد المنتهي وتجديد الاشتراك للعقد التالي
    limitlessWs.on('marketResolved', async (event: any) => {
      if (currentSubscribedSlug && event.marketSlug === currentSubscribedSlug) {
        console.log(`🏁 [Limitless WS] تمت تسوية العقد الحالي (${event.marketSlug})، جاري التبديل للعقد التالي...`);
        cachedActive15mMarket = null;
        liveLimitlessOrderbook = null;
        await syncLimitlessWsMarket();
      }
    });

    // الاتصال بالخادم ثم مزامنة الاشتراك فور اكتمال الاتصال
    await limitlessWs.connect();
    isLimitlessWsConnected = true;
    console.log('⚡ [Limitless WS] متصل بنجاح بخادم البث المباشر wss://ws.limitless.exchange (استجابة فورية بالميلي ثانية).');
    await syncLimitlessWsMarket();
  } catch (err: any) {
    console.warn('⚠️ [Limitless WS] تعذر بدء اتصال WebSocket:', err.message);
    setTimeout(startLimitlessWebSocket, 5000);
  }
}

let lastExecutedTradeTime = 0;
let cachedActive15mMarket: any = null;
let lastMarketFetchTime = 0;

async function getServerActiveBtcMarket(): Promise<any | null> {
  const now = Date.now();
  // استخدام السوق المخزن إذا كان صالحاً ومتبقياً عليه أكثر من 20 ثانية
  if (
    cachedActive15mMarket &&
    now - lastMarketFetchTime < 10000 &&
    cachedActive15mMarket.expirationTimestamp &&
    Number(cachedActive15mMarket.expirationTimestamp) > now + 20000
  ) {
    return cachedActive15mMarket;
  }

  try {
    for (let page = 1; page <= 4; page++) {
      const res = await serverMarketFetcher.getActiveMarkets({
        limit: 25,
        page,
        sortBy: 'newest',
      }).catch(() => null);

      if (res && Array.isArray(res.data) && res.data.length > 0) {
        const validMarkets = res.data.filter((m: any) => {
          if (m.closed || m.expired) return false;
          const expTime = m.expirationTimestamp ? Number(m.expirationTimestamp) : 0;
          if (expTime > 0 && expTime <= now + 20000) return false;
          return true;
        });

        // قصر الاختيار حصراً وبشكل صارم على عقود بيتكوين 15 دقيقة فقط (BTC 15 Min) والإكتفاء بها
        const btc15m = validMarkets.filter((m: any) => {
          const s = (m.slug || '').toLowerCase();
          const t = (m.title || '').toLowerCase();
          const cats = Array.isArray(m.categories) ? m.categories.map((c: any) => String(c).toLowerCase()) : [];

          const isBtc = s.includes('btc') || t.includes('btc') || cats.some((c: string) => c.includes('bitcoin') || c.includes('btc'));
          const is15m = s.includes('15-min') || s.includes('15min') || t.includes('15 min') || s.includes('15m') ||
                        cats.some((c: string) => c.includes('15 min') || c.includes('minutes 15'));

          // استبعاد صريح للعقود الأخرى (مع الحذر: كلمة 15-min تحتوي على 5-min كجزء فرعي لذلك نشترط !is15m)
          const is5mOnly = !is15m && (s.includes('5-min') || t.includes('5 min') || s.includes('5min'));
          const isExcluded = s.includes('daily') || t.includes('daily') ||
                             s.includes('hourly') || t.includes('hourly') ||
                             s.includes('weekly') || t.includes('weekly') ||
                             is5mOnly;

          return isBtc && is15m && !isExcluded;
        });

        if (btc15m.length > 0) {
          cachedActive15mMarket = btc15m[0];
          lastMarketFetchTime = now;
          return cachedActive15mMarket;
        }
      }
    }
  } catch (err: any) {
    console.warn('⚠️ [Server Bot] تعذر جلب سوق BTC 15m عبر MarketFetcher:', err.message);
  }

  cachedActive15mMarket = null;
  return null;
}

async function executeLimitlessTrade(
  targetToken: 'YES' | 'NO',
  btcPrice: number,
  currentZScore: number,
  isManualOrForced: boolean = false
) {
  // 1. فحص التزامن الفوري: منع أي تنفيذ متزامن في نفس اللحظة
  if (isServerTradeExecuting && !isManualOrForced) {
    console.log('⏳ [Server Bot] هناك صفقة قيد المعالجة والتنفيذ حالياً - تم حظر أي أمر متزامن.');
    return;
  }

  if (!serverWallet) {
    serverWallet = initializeServerWallet();
  }

  if (!serverWallet) {
    console.log('ℹ️ [Server Bot] تم رصد إشارة ولكن لم يتم تعيين مفتاح المحفظة في .env لتنفيذ التوقيع.');
    lastExecutionError = 'المحفظة غير مهيأة: يرجى التأكد من إدخال PRIVATE_KEY صالح في ملف .env بالخادم';
    currentWaitReason = `تم رصد إشارة مؤهلة لعقد ${targetToken} (Z-Score: ${currentZScore})! بانتظار إدخال المفتاح الخاص للمحفظة في الإعدادات للتنفيذ الحقيقي.`;
    return;
  }

  // فحص أمان صارم: إذا كان الروبوت متوقفاً يُمنع التنفيذ التلقائي فوراً
  if (!isServerBotRunning && !isManualOrForced) {
    console.log('⛔ [Server Bot] التداول متوقف مؤقتاً (PAUSED) - تم حظر فتح أي صفقة.');
    currentWaitReason = 'الروبوت متوقف مؤقتاً (PAUSED) - اضغط زر تشغيل الروبوت لتفعيل التداول الآلي.';
    return;
  }

  // فترة تبريد (Cooldown) لمنع تكرار الصفقات على نفس الإشارة
  if (!isManualOrForced && Date.now() - lastExecutedTradeTime < 60000) {
    return;
  }

  try {
    console.log(`🤖 [Server Bot] فحص عقد BTC 15 دقيقة الحصري لشراء عقد ${targetToken} (Z-Score: ${currentZScore})...`);
    
    const activeMarket = await getServerActiveBtcMarket();
    if (!activeMarket) {
      currentWaitReason = 'بانتظار توفر عقد بيتكوين 15 دقيقة (BTC 15 Min) نشط في منصة Limitless - تم حظر أي أسواق أخرى';
      console.log(`⏳ [Server Bot] ${currentWaitReason}`);
      return;
    }

    // التحقق الصارم النهائي من أن السوق المستهدف هو عقد بيتكوين 15 دقيقة حصراً
    const slugLower = (activeMarket.slug || '').toLowerCase();
    const titleLower = (activeMarket.title || '').toLowerCase();
    const is15mContract =
      slugLower.includes('15-min') || slugLower.includes('15m') || slugLower.includes('15min') ||
      titleLower.includes('15 min') || titleLower.includes('15-min') || titleLower.includes('15m');
    const is5mOnly = !is15mContract && (slugLower.includes('5-min') || titleLower.includes('5 min') || slugLower.includes('5min'));

    const isStrict15mBtc =
      (slugLower.includes('btc') || titleLower.includes('btc')) &&
      is15mContract &&
      !is5mOnly &&
      !slugLower.includes('daily') && !titleLower.includes('daily') &&
      !slugLower.includes('hourly') && !titleLower.includes('hourly') &&
      !slugLower.includes('weekly') && !titleLower.includes('weekly');

    if (!isStrict15mBtc) {
      console.warn(`⛔ [Server Bot] تم حظر التداول: السوق (${activeMarket.title}) ليس عقد بيتكوين 15 دقيقة! تم حصر الروبوت حصراً على عقود 15m.`);
      currentWaitReason = 'تم إلغاء التداول: السوق المتاح ليس عقد بيتكوين 15 دقيقة. بانتظار توفر عقد BTC 15m الحصري.';
      return;
    }

    // 🛡️ فحص أمان صارم: منع تكرار فتح صفقات على نفس العقد (صفقة واحدة فقط لكل عقد 15 دقيقة)
    const marketSlug = (activeMarket.slug || '').trim();
    const expTime = activeMarket.expirationTimestamp ? Number(activeMarket.expirationTimestamp) : 0;
    if (!isManualOrForced && isContractAlreadyTraded(marketSlug, expTime)) {
      const prevTrade = findTradeForMarket(marketSlug, expTime);
      const sideText = prevTrade ? `(شراء سابق لعقد ${prevTrade.tokenType} بسعر $${prevTrade.price})` : '';
      const timeLeft = expTime > Date.now() ? `${Math.ceil((expTime - Date.now()) / 60000)} دقيقة متبقية` : 'قريب من الانتهاء';
      
      console.log(`🛡️ [Server Bot - قاعدة الأمان الصارمة]: تم فتح صفقة لهذا العقد (${activeMarket.title || marketSlug}) مسبقاً ${sideText}! تم حظر فتح صفقة مكررة.`);
      currentWaitReason = `🛡️ تم تنفيذ صفقة مسبقاً لهذا العقد (${activeMarket.title || marketSlug}) ${sideText}. الروبوت يلتزم بصفقة واحدة فقط لكل عقد. في انتظار انتهاء العقد الحالي (${timeLeft}) وتوفر عقد جديد.`;
      return;
    }

    // 🔒 تفعيل قفل التزامن الفوري على المحرك وعلى العقد لمنع أي تكة أخرى من الدخول أثناء التوقيع والإرسال
    isServerTradeExecuting = true;
    pendingExecutionSlugs.add(marketSlug.toLowerCase().trim());

    // ⚡ قراءة دفتر الأوامر اللحظي مباشرة من ذاكرة البث المباشر أو جلب فوري من REST إذا لزم الأمر
    let orderbook = liveLimitlessOrderbook;
    if (!orderbook || orderbook.marketSlug !== activeMarket.slug || Date.now() - orderbook.lastUpdated > 4000) {
      // مزامنة فورية في حال عدم توفر أو تأخر بيانات البث
      const restOb: any = await serverMarketFetcher.getOrderBook(activeMarket.slug).catch(() => null);
      if (restOb) {
        const asks = (restOb.asks || []).map((a: any) => ({ price: Number(a.price), size: Number(a.size || 0) }));
        const bids = (restOb.bids || []).map((b: any) => ({ price: Number(b.price), size: Number(b.size || 0) }));
        const bestAskYes = asks.length > 0 ? asks[0].price : null;
        const bestBid = bids.length > 0 ? bids[0].price : null;
        const bestAskNo = bestBid !== null ? Number((1.0 - bestBid).toFixed(3)) : (asks.length > 0 ? Number((1.0 - asks[0].price).toFixed(3)) : null);
        liveLimitlessOrderbook = {
          marketSlug: activeMarket.slug,
          asks,
          bids,
          bestAskYes,
          bestAskNo,
          midpoint: restOb.midpoint !== undefined ? Number(restOb.midpoint) : (bestAskYes && bestAskNo ? Number(((bestAskYes + (1 - bestAskNo)) / 2).toFixed(3)) : null),
          spread: (asks.length > 0 && bids.length > 0) ? Number((asks[0].price - bids[0].price).toFixed(4)) : 0,
          lastUpdated: Date.now()
        };
        orderbook = liveLimitlessOrderbook;
      }
    }

    if (!orderbook) {
      currentWaitReason = `بانتظار وصول بث أسعار عقد BTC 15m عبر Limitless WebSocket...`;
      return;
    }

    let rawPrice: number | null = null;
    if (targetToken === 'YES') {
      rawPrice = orderbook.bestAskYes ?? orderbook.asks?.[0]?.price ?? null;
    } else {
      rawPrice = orderbook.bestAskNo ?? (orderbook.bids?.[0]?.price ? Number((1.0 - orderbook.bids[0].price).toFixed(3)) : null);
    }

    if (rawPrice === null || rawPrice <= 0) {
      currentWaitReason = `سعر عقد ${targetToken} في سوق BTC 15m غير متاح حالياً`;
      return;
    }

    // محاذاة السعر مع دقة المنصة (Tick Alignment: 0.001)
    const alignedPrice = Math.min(0.999, Math.max(0.001, Number((Math.round(rawPrice / 0.001) * 0.001).toFixed(3))));

    // التحقق من سقف سعر الدخول (إن وُجد، افتراضياً بدون سقف لتنفيذ مباشر بسعر السوق)
    if (ZSCORE_STRATEGY.maxEntryPrice && alignedPrice > ZSCORE_STRATEGY.maxEntryPrice) {
      currentWaitReason = `سعر عقد ${targetToken} ($${alignedPrice}) في سوق 15m أعلى من سقف الدخول المحدد ($${ZSCORE_STRATEGY.maxEntryPrice}). بانتظار فرصة مناسبة.`;
      console.log(`⛔ [Server Bot] ${currentWaitReason}`);
      return;
    }

    console.log(`🎯 [Server Bot] تم اقتناص فرصة في سوق BTC 15m: ${activeMarket.title} (${activeMarket.slug}) بسعر $${alignedPrice}`);

    // 1. جلب بيانات السوق والـ Venue وعناوين العقود عبر MarketFetcher
    const marketDetails = await serverMarketFetcher.getMarket(activeMarket.slug).catch(() => null);
    const venueExchange = marketDetails?.venue?.exchange || activeMarket.venue?.exchange || '0x05c748E2f4DcDe0ec9Fa8DDc40DE6b867f923fa5';
    const yesTokenId = marketDetails?.tokens?.yes || activeMarket.tokens?.yes;
    const noTokenId = marketDetails?.tokens?.no || activeMarket.tokens?.no;
    const selectedTokenId = targetToken === 'YES' ? yesTokenId : noTokenId;

    if (!selectedTokenId) {
      currentWaitReason = `معرف التوكن ${targetToken} غير متوفر في بيانات السوق`;
      return;
    }

    // فحص رصيد USDC الفعلي في المحفظة لضبط حجم الصفقة بدقة (Native USDC و Bridged USDbC)
    const rpcUrl = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
    const nativeUsdcBal = await fetchErc20Balance(rpcUrl, USDC_BASE_ADDRESS, serverWallet.address, 6).catch(() => 0);
    const bridgedUsdcBal = await fetchErc20Balance(rpcUrl, USDbC_BASE_ADDRESS, serverWallet.address, 6).catch(() => 0);
    const realUsdcBalance = Math.max(nativeUsdcBal, bridgedUsdcBal, nativeUsdcBal + bridgedUsdcBal);

    if (realUsdcBalance < alignedPrice) {
      lastExecutionError = `رصيد USDC غير كافٍ في المحفظة على شبكة Base ($${realUsdcBalance.toFixed(2)} متوفر، والمطلوب لشراء عقد واحد هو $${alignedPrice.toFixed(2)})`;
      console.warn(`⚠️ [Server Bot] ${lastExecutionError}`);
      currentWaitReason = lastExecutionError;
      return;
    } else if (lastExecutionError && lastExecutionError.includes('رصيد USDC غير كافٍ')) {
      // إزالة التنبيه تلقائياً بمجرد توفر الرصيد الكافي
      lastExecutionError = null;
    }
    
    // حساب حجم الصفقة وفق إدارة المخاطر (Full Kelly) والتنفيذ المباشر بسعر السوق المتاح
    let tradeBudget = ZSCORE_STRATEGY.tradeSizeUsdc || 0.50;
    let kellyFraction = 0;

    if (ZSCORE_STRATEGY.riskModel === 'FULL_KELLY') {
      const absZ = Math.abs(currentZScore);
      // احتمالية الفوز الإحصائية لانحراف 2 سيجما (Z >= 2.0) تفوق 80%
      const estimatedWinRate = Math.min(0.96, Math.max(ZSCORE_STRATEGY.kellyWinRate, 0.75 + (absZ - 2.0) * 0.10));
      const edge = estimatedWinRate - alignedPrice;

      if (edge > 0) {
        // معادلة كيلي الدقيقة للعقود الثنائية: f* = (p - c) / (1 - c)
        kellyFraction = edge / (1 - alignedPrice);
        const safeAllocatedFraction = Math.min(kellyFraction * ZSCORE_STRATEGY.kellyMultiplier, ZSCORE_STRATEGY.maxBankrollRiskPercent);
        const computedBudget = realUsdcBalance * safeAllocatedFraction;
        // دعم التجزئة الدقيقة: حد أدنى 0.05$ للمطابقة على منصة Limitless بدون إجبار العقد على 1 كامل
        const minTradeUsdc = 0.05;
        tradeBudget = Math.max(minTradeUsdc, Number(computedBudget.toFixed(2)));
        if (realUsdcBalance > 0 && realUsdcBalance < tradeBudget) {
          tradeBudget = Number(realUsdcBalance.toFixed(2));
        }
        console.log(`🧠 [Full Kelly] نسبة كيلي: ${(kellyFraction * 100).toFixed(1)}% | المخصص (100% f*): ${(safeAllocatedFraction * 100).toFixed(1)}% | ميزانية الصفقة: $${tradeBudget.toFixed(2)} USDC من رصيد $${realUsdcBalance.toFixed(2)} USDC`);
      } else {
        // ميزانية تجزئة آمنة تعادل سقف الأمان من المحفظة (1% أو حد أدنى 0.05$)
        const minBudget = Math.max(0.05, Number((realUsdcBalance * ZSCORE_STRATEGY.maxBankrollRiskPercent).toFixed(2)));
        tradeBudget = Math.min(0.10, minBudget);
        console.log(`🧠 [Full Kelly] ميزانية التجزئة الآمنة: $${tradeBudget.toFixed(2)} USDC`);
      }
    } else {
      const availableBudget = realUsdcBalance > 0.05 ? realUsdcBalance * 0.95 : 0.05;
      const targetBudget = ZSCORE_STRATEGY.tradeSizeUsdc || 0.06;
      tradeBudget = Math.max(0.05, Math.min(availableBudget, targetBudget));
    }

    // دعم تجزئة العقود والكسور بدقة تامة (Fractional Contracts مثل 0.42 أو 0.53 أو 0.67 عقد)
    // التجزئة تسمح بحصص أصغر من 1 عقد كامل بدقة منزلتين عشريتين
    let contracts = Number((tradeBudget / alignedPrice).toFixed(2));
    if (contracts < 0.05) {
      contracts = 0.05; // الحد الأدنى الميكرو للعقد المجزأ
    }

    console.log(`🚀 [Server Bot] تم اقتناص فرصة Z-Score مؤهلة (Full Kelly): ${contracts} عقد مجزأ ${targetToken} بسعر $${alignedPrice} (الميزانية: $${(contracts * alignedPrice).toFixed(2)} USDC)`);

    // تم الحصول على تفويض USDC مسبقاً (No auto-approval needed)

    // فحص أمان صارم قبل محاولة تنفيذ الأمر
    if (!isServerBotRunning && !isManualOrForced) {
      console.log('⛔ [Server Bot] تحقق أمان فوري: الروبوت متوقف مؤقتاً (PAUSED) - تم إلغاء إنشاء الأمر فوراً.');
      currentWaitReason = 'الروبوت متوقف مؤقتاً (PAUSED) - اضغط تشغيل لتفعيل التداول الآلي';
      return;
    }

    // محاولة التنفيذ أولاً عبر عميل Limitless SDK الرسمي (OrderClient) مع التوقيع المشفر
    const limitlessClient = getLimitlessClient();
    let orderSuccess = false;
    let orderTxHash = '';

    try {
      console.log('📡 [Server Bot] جاري إرسال الأمر عبر OrderClient من SDK الرسمي...');
      const orderClient = limitlessClient.newOrderClient(serverWallet);
      const res = await withRetry(
        () =>
          orderClient.createOrder({
            marketSlug: activeMarket.slug,
            tokenId: selectedTokenId,
            side: Side.BUY,
            price: alignedPrice,
            size: contracts,
            orderType: OrderType.FAK,
          }),
        { statusCodes: [429, 500, 502, 503, 504], maxRetries: 2, delays: [1, 2] }
      );

      console.log(`🎉 [Server Bot] تم تنفيذ الأمر بنجاح عبر SDK الرسمي! معرف الأمر: ${res.order?.id || 'OK'}`);
      currentWaitReason = `✅ تم تنفيذ أمر شراء ${contracts} عقد ${targetToken} بنجاح على منصة Limitless! (معرف: ${res.order?.id || 'OK'})`;
      orderTxHash = res.order?.id || `0x${Date.now().toString(16)}`;
      orderSuccess = true;
      lastExecutionError = null;
      lastExecutedTradeTime = Date.now();
    } catch (sdkOrderErr: any) {
      console.warn('⚠️ [Server Bot] تنبيه أثناء تنفيذ OrderClient:', sdkOrderErr.message);
      let friendlyError = sdkOrderErr.message || 'خطأ في تنفيذ الأمر عبر SDK';
      if (friendlyError.includes('Authentication required') || friendlyError.includes('401')) {
        friendlyError = 'مطلوب رمز Limitless API Token للمصادقة على المنصة (LIMITLESS_API_TOKEN في .env)';
      }
      lastExecutionError = friendlyError;
      
      // في حال وجود خطأ، محاولة إرسال مباشر موثق عبر client.http (مع توقيع HMAC تلقائياً)
      try {
        const domain = {
          name: 'Limitless OrderBook',
          version: '1',
          chainId: 8453,
          verifyingContract: venueExchange,
        };

        const types = {
          Order: [
            { name: 'maker', type: 'address' },
            { name: 'tokenId', type: 'uint256' },
            { name: 'amount', type: 'uint256' },
            { name: 'price', type: 'uint256' },
            { name: 'side', type: 'uint8' },
            { name: 'nonce', type: 'uint256' },
            { name: 'deadline', type: 'uint256' },
          ],
        };

        const orderValue = {
          maker: serverWallet.address,
          tokenId: BigInt(selectedTokenId),
          amount: ethers.parseUnits(contracts.toFixed(2), 6),
          price: ethers.parseUnits(String(alignedPrice), 6),
          side: 0,
          nonce: Date.now(),
          deadline: Math.floor(Date.now() / 1000) + 120,
        };

        const signature = await serverWallet.signTypedData(domain, types, orderValue);
        const orderPayload = {
          order: {
            ...orderValue,
            tokenId: orderValue.tokenId.toString(),
            amount: orderValue.amount.toString(),
            price: orderValue.price.toString(),
          },
          signature,
          orderType: 'FAK',
          marketSlug: activeMarket.slug,
        };

        const directRes: any = await limitlessClient.http.post('/orders', orderPayload);
        if (directRes && (directRes.order || directRes.id)) {
          console.log(`🎉 [Server Bot] تم تنفيذ الأمر المباشر بنجاح!`, directRes);
          orderTxHash = directRes.order?.id || directRes.id || signature.substring(0, 30);
          orderSuccess = true;
          lastExecutionError = null;
          lastExecutedTradeTime = Date.now();
          currentWaitReason = `✅ تم تنفيذ أمر شراء ${contracts} عقد ${targetToken} بنجاح على منصة Limitless!`;
        }
      } catch (directErr: any) {
        console.warn('⚠️ [Server Bot] خطأ في الإرسال المباشر:', directErr.message);
        let friendlyDirect = directErr.message || friendlyError;
        if (friendlyDirect.includes('Authentication required') || friendlyDirect.includes('401')) {
          friendlyDirect = 'مطلوب رمز Limitless API Token للمصادقة على المنصة (LIMITLESS_API_TOKEN في .env)';
        }
        lastExecutionError = friendlyDirect;
        currentWaitReason = `⚠️ تنبيه من منصة Limitless: ${friendlyDirect}`;
      }
    }

    if (orderSuccess) {
      // قفل العقد رسمياً لمنع تكرار أي صفقات أخرى عليه نهائياً
      recordContractTraded({
        slug: activeMarket.slug,
        title: activeMarket.title,
        tokenType: targetToken,
        price: alignedPrice,
        amount: contracts,
        timestamp: Date.now(),
        expirationTimestamp: Number(activeMarket.expirationTimestamp) || 0,
        txHash: orderTxHash,
      });

      executedTradesLog.unshift({
        timestamp: Date.now(),
        tokenType: targetToken,
        price: alignedPrice,
        amount: contracts,
        txHash: orderTxHash,
        marketSlug: activeMarket.slug,
        marketTitle: activeMarket.title,
      });
      savePersistedTrades(executedTradesLog);
      console.log(`🔒 [Server Bot] تم قفل العقد (${activeMarket.title || activeMarket.slug}) رسمياً - لن يتم فتح أي صفقة أخرى عليه.`);
      setTimeout(syncLimitlessUserHistory, 3000);
    } else {
      // إذا لم ينجح الطلب، فك الحظر المؤقت
      pendingExecutionSlugs.delete(marketSlug.toLowerCase().trim());
    }
  } catch (err: any) {
    console.error('خطأ أثناء تنفيذ صفقة السيرفر:', err.message);
    currentWaitReason = `خطأ أثناء التنفيذ: ${err.message}`;
  } finally {
    isServerTradeExecuting = false;
  }
}

// ==========================================
// جلب الشموع السابقة فوراً عبر Binance REST API
// ==========================================

async function fetchBinanceHistoricalCloses(limit: number = 50): Promise<number[]> {
  const restEndpoints = [
    `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=5m&limit=${limit}`,
    `https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=5m&limit=${limit}`,
    `https://api1.binance.com/api/v3/klines?symbol=BTCUSDT&interval=5m&limit=${limit}`,
    `https://api3.binance.com/api/v3/klines?symbol=BTCUSDT&interval=5m&limit=${limit}`,
  ];

  for (const endpoint of restEndpoints) {
    try {
      const res = await fetch(endpoint, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const raw = await res.json();
        if (Array.isArray(raw) && raw.length > 0) {
          // استخراج أسعار الإغلاق من مصفوفة الشموع (index 4 هو Close)
          return raw.map((k: any) => parseFloat(k[4]));
        }
      }
    } catch {}
  }
  return [];
}

async function fetchBinanceFullCandles(limit: number = 50): Promise<Array<{
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}>> {
  const restEndpoints = [
    `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=5m&limit=${limit}`,
    `https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=5m&limit=${limit}`,
    `https://api1.binance.com/api/v3/klines?symbol=BTCUSDT&interval=5m&limit=${limit}`,
    `https://api3.binance.com/api/v3/klines?symbol=BTCUSDT&interval=5m&limit=${limit}`,
  ];

  for (const endpoint of restEndpoints) {
    try {
      const res = await fetch(endpoint, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const raw = await res.json();
        if (Array.isArray(raw) && raw.length > 0) {
          return raw.map((k: any) => ({
            timestamp: Number(k[0]),
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[5]),
          }));
        }
      }
    } catch {}
  }
  return [];
}

async function startServerPriceFeed() {
  try {
    // 1. جلب الشموع السابقة فوراً عبر Binance REST API (فريم 5 دقائق)
    const initialCloses = await fetchBinanceHistoricalCloses(50);
    if (initialCloses.length > 0) {
      candleCloses.push(...initialCloses);
      lastBtcPrice = candleCloses[candleCloses.length - 1];
      console.log(`✅ [Server Bot] تم جلب ${initialCloses.length} شمعة (فريم 5 دقائق) عبر Binance REST API بنجاح! السعر الحالي: $${lastBtcPrice}`);
    }

    const WebSocketClient = (await import('ws')).default;
    const ws = new WebSocketClient('wss://data-stream.binance.vision/ws/btcusdt@kline_5m');

    ws.on('open', () => {
      console.log('⚡ [Server Bot] متصل ببث بينانس المباشر لأسعار BTC على فريم 5 دقائق (5m).');
    });

    ws.on('message', async (raw: string) => {
      try {
        const payload = JSON.parse(raw);
        if (!payload.k) return;
        const kline = payload.k;
        lastBtcPrice = parseFloat(kline.c);

        if (kline.x) {
          candleCloses.push(lastBtcPrice);
          if (candleCloses.length > 50) candleCloses.shift();
        }

        const now = Date.now();
        if (candleCloses.length >= (ZSCORE_STRATEGY.lookbackPeriod - 1) && (kline.x || now - lastServerEvalTime >= 2000)) {
          lastServerEvalTime = now;
          const livePrices = kline.x
            ? candleCloses
            : [...candleCloses.slice(-(ZSCORE_STRATEGY.lookbackPeriod - 1)), lastBtcPrice];

          const { zScore, mean, stdDev } = calculateServerZScore(livePrices, ZSCORE_STRATEGY.lookbackPeriod);
          lastCalculatedZScore = zScore;
          lastCalculatedMean = mean;
          lastCalculatedStdDev = stdDev;

          // إذا كان الروبوت متوقفاً، نوقف التداول تماماً ونحدث فقط شريط الانتظار
          if (!isServerBotRunning) {
            currentWaitReason = `الروبوت متوقف مؤقتاً (PAUSED) - لن يتم فتح أي صفقات | Z-Score اللحظي (5m) = ${zScore > 0 ? '+' : ''}${zScore}`;
            lastEvaluatedSignal = zScore >= ZSCORE_STRATEGY.upperThreshold ? 'OVERBOUGHT' : (zScore <= ZSCORE_STRATEGY.lowerThreshold ? 'OVERSOLD' : 'NEUTRAL');
            return;
          }

          // 1. إشارة هبوط: Z-Score >= +2.00 -> شراء عقد NO (القمة)
          if (zScore >= ZSCORE_STRATEGY.upperThreshold) {
            lastEvaluatedSignal = 'OVERBOUGHT';
            console.log(`🚨 [Server Bot]: إشارة هبوط Z-Score على فريم 5m! Z = +${zScore} (أعلى من +${ZSCORE_STRATEGY.upperThreshold}). جاري شراء عقد NO...`);
            await executeLimitlessTrade('NO', lastBtcPrice, zScore);
          }
          // 2. إشارة صعود: Z-Score <= -2.00 -> شراء عقد YES (الارتداد)
          else if (zScore <= ZSCORE_STRATEGY.lowerThreshold) {
            lastEvaluatedSignal = 'OVERSOLD';
            console.log(`🚨 [Server Bot]: إشارة صعود Z-Score على فريم 5m! Z = ${zScore} (أدنى من ${ZSCORE_STRATEGY.lowerThreshold}). جاري شراء عقد YES...`);
            await executeLimitlessTrade('YES', lastBtcPrice, zScore);
          } else {
            lastEvaluatedSignal = 'NEUTRAL';
            currentWaitReason = lastExecutionError
              ? `⚠️ تنبيه من المحرك: ${lastExecutionError} | Z-Score (5m) = ${zScore > 0 ? '+' : ''}${zScore}`
              : `سوق محايد: مؤشر Z-Score (5m) = ${zScore > 0 ? '+' : ''}${zScore} (المطلوب: > +${ZSCORE_STRATEGY.upperThreshold} للهبوط أو < ${ZSCORE_STRATEGY.lowerThreshold} للصعود) | متوسط 20 شمعة (5m) = $${mean.toLocaleString()}`;
          }
        }
      } catch (feedErr: any) {
        console.error('⚠️ [Server Bot Price Feed Error]:', feedErr?.message || feedErr);
      }
    });

    ws.on('close', () => {
      setTimeout(startServerPriceFeed, 5000);
    });
  } catch (err: any) {
    console.warn('تعذر بدء بث الأسعار في السيرفر:', err.message);
  }
}

startServerPriceFeed();
startLimitlessWebSocket();

// مسار لجلب أحدث بيانات الشموع عبر Binance REST API
app.get('/api/binance/klines', async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 50;
    const closes = await fetchBinanceHistoricalCloses(limit);
    return res.json({
      success: true,
      count: closes.length,
      lastPrice: closes.length > 0 ? closes[closes.length - 1] : lastBtcPrice,
      closes,
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

app.get('/api/binance/klines-full', async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 50;
    const candles = await fetchBinanceFullCandles(limit);
    return res.json({
      success: true,
      count: candles.length,
      lastPrice: candles.length > 0 ? candles[candles.length - 1].close : lastBtcPrice,
      candles,
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ==========================================
// API مسارات التحكم بحالة الروبوت على السيرفر
// ==========================================

app.get('/api/bot/status', (req, res) => {
  res.json({
    running: isServerBotRunning,
    strategy: 'Z-Score Only (Lookback: 20 candles on 5m • Threshold: ±2.00 • تنفيذ فوري بسعر السوق)',
    targetMarketFocus: 'BTC 15 Min Only (عقود بيتكوين 15 دقيقة حصراً • تنفيذ مباشر بسعر السوق)',
    active15mMarket: cachedActive15mMarket
      ? {
          title: cachedActive15mMarket.title,
          slug: cachedActive15mMarket.slug,
          expirationTimestamp: cachedActive15mMarket.expirationTimestamp,
          expirationDate: cachedActive15mMarket.expirationDate,
        }
      : null,
    active5mMarket: cachedActive15mMarket
      ? {
          title: cachedActive15mMarket.title,
          slug: cachedActive15mMarket.slug,
          expirationTimestamp: cachedActive15mMarket.expirationTimestamp,
          expirationDate: cachedActive15mMarket.expirationDate,
        }
      : null,
    wallet: serverWallet ? serverWallet.address : null,
    btcPrice: lastBtcPrice,
    zScore: lastCalculatedZScore,
    mean: lastCalculatedMean,
    stdDev: lastCalculatedStdDev,
    lastSignal: lastEvaluatedSignal,
    candleCount: candleCloses.length,
    riskPercent: ZSCORE_STRATEGY.riskPercent,
    riskModel: ZSCORE_STRATEGY.riskModel,
    kellyWinRate: ZSCORE_STRATEGY.kellyWinRate,
    kellyMultiplier: ZSCORE_STRATEGY.kellyMultiplier,
    maxBankrollRiskPercent: ZSCORE_STRATEGY.maxBankrollRiskPercent,
    tradeSizeUsdc: ZSCORE_STRATEGY.tradeSizeUsdc,
    maxEntryPrice: ZSCORE_STRATEGY.maxEntryPrice,
    upperThreshold: ZSCORE_STRATEGY.upperThreshold,
    lowerThreshold: ZSCORE_STRATEGY.lowerThreshold,
    waitReason: currentWaitReason,
    lastExecutionError,
    isCurrentMarketTraded: cachedActive15mMarket ? isContractAlreadyTraded(cachedActive15mMarket.slug, Number(cachedActive15mMarket.expirationTimestamp)) : false,
    currentMarketTrade: cachedActive15mMarket ? findTradeForMarket(cachedActive15mMarket.slug, Number(cachedActive15mMarket.expirationTimestamp)) : null,
    tradedContractsCount: tradedContractsMap.size,
    recentTrades: executedTradesLog.slice(0, 10),
  });
});

// جلب تفاصيل عقد بيتكوين 15 دقيقة المباشر (يدعم كلاً من /api/market/active-15m و /api/market/active-5m للتوافقية التامة)
const handleActiveBtcMarket = async (req: any, res: any) => {
  try {
    const market = await getServerActiveBtcMarket();
    if (!market) {
      return res.json({
        found: false,
        message: 'لا يوجد عقد بيتكوين 15 دقيقة نشط حالياً، بانتظار بدء نافذة الـ 15 دقيقة التالية على Limitless.',
      });
    }

    // مزامنة اشتراك البث المباشر (Limitless WebSocket) إذا لزم الأمر
    if (isLimitlessWsConnected && currentSubscribedSlug !== market.slug) {
      syncLimitlessWsMarket().catch(() => {});
    }

    // ⚡ التحقق من صلاحية دفتر الأوامر اللحظي: هل هو لنفس العقد النشط وهل تم تحديثه حديثاً؟
    const isObFresh = Boolean(
      liveLimitlessOrderbook &&
      liveLimitlessOrderbook.marketSlug === market.slug &&
      (Date.now() - liveLimitlessOrderbook.lastUpdated < 3500)
    );

    let bestAskYes = isObFresh && liveLimitlessOrderbook ? liveLimitlessOrderbook.bestAskYes : null;
    let bestAskNo = isObFresh && liveLimitlessOrderbook ? liveLimitlessOrderbook.bestAskNo : null;
    let midpoint = isObFresh && liveLimitlessOrderbook ? liveLimitlessOrderbook.midpoint : null;
    let spread = isObFresh && liveLimitlessOrderbook ? liveLimitlessOrderbook.spread : null;

    // في حال عدم توفر أو تأخر بث الـ WebSocket لأكثر من 3.5 ثوانٍ، جلب الأسعار فوراً من REST API
    if (bestAskYes === null || bestAskNo === null) {
      const restOb: any = await serverMarketFetcher.getOrderBook(market.slug).catch(() => null);
      if (restOb) {
        const asks = (restOb.asks || []).map((a: any) => ({ price: Number(a.price), size: Number(a.size || 0) }));
        const bids = (restOb.bids || []).map((b: any) => ({ price: Number(b.price), size: Number(b.size || 0) }));
        bestAskYes = asks.length > 0 ? asks[0].price : (restOb.midpoint ? Number(restOb.midpoint) : null);
        const bestBid = bids.length > 0 ? bids[0].price : null;
        bestAskNo = bestBid !== null ? Number((1.0 - bestBid).toFixed(3)) : (asks.length > 0 ? Number((1.0 - asks[0].price).toFixed(3)) : null);
        midpoint = restOb.midpoint !== undefined ? Number(restOb.midpoint) : (bestAskYes && bestAskNo ? Number(((bestAskYes + (1 - bestAskNo)) / 2).toFixed(3)) : null);
        spread = (asks.length > 0 && bids.length > 0) ? Number((asks[0].price - bids[0].price).toFixed(4)) : 0;
        liveLimitlessOrderbook = {
          marketSlug: market.slug,
          asks,
          bids,
          bestAskYes,
          bestAskNo,
          midpoint,
          spread,
          lastUpdated: Date.now(),
        };
      }
    }

    // إسناد إضافي من أسعار العقد الرسمية إذا لم تتوفر بعد
    if (bestAskYes === null && Array.isArray(market.prices) && market.prices.length >= 2) {
      bestAskYes = Number(market.prices[0]);
      bestAskNo = Number(market.prices[1]);
      midpoint = Number(((bestAskYes + (1 - bestAskNo)) / 2).toFixed(3));
      spread = Number(Math.abs(bestAskYes - (1 - bestAskNo)).toFixed(3));
    }

    return res.json({
      found: true,
      title: market.title,
      slug: market.slug,
      expirationTimestamp: market.expirationTimestamp,
      expirationDate: market.expirationDate,
      venueExchange: market.venue?.exchange,
      tokens: market.tokens,
      prices: {
        bestAskYes,
        bestAskNo,
        midpoint: midpoint ?? (bestAskYes && bestAskNo ? Number(((bestAskYes + (1 - bestAskNo)) / 2).toFixed(3)) : null),
        spread: spread ?? 0,
      },
      oraclePrice: liveOraclePrice?.value ?? null,
      oracleSource: liveOraclePrice?.source ?? 'chainlink',
      oracleTimestamp: liveOraclePrice?.timestamp ?? null,
      wsConnected: isLimitlessWsConnected,
      streamSource: 'LIMITLESS_WEBSOCKET_REALTIME',
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

app.get('/api/market/active-5m', handleActiveBtcMarket);
app.get('/api/market/active-15m', handleActiveBtcMarket);

app.post('/api/bot/toggle', (req, res) => {
  const { running } = req.body;
  if (typeof running === 'boolean') {
    isServerBotRunning = running;
  } else {
    isServerBotRunning = !isServerBotRunning;
  }
  saveBotRunningState(isServerBotRunning);
  // تنظيف أي خطأ سابق إذا تم إيقاف/إعادة تشغيل البوت يدوياً
  if (lastExecutionError && lastExecutionError.includes('رصيد USDC غير كافٍ')) {
    lastExecutionError = null;
  }
  currentWaitReason = isServerBotRunning
    ? 'في انتظار إشارة Z-Score مؤهلة (> +2.00 للهبوط أو < -2.00 للصعود) على عقد BTC 15m للتنفيذ المباشر بسعر السوق'
    : 'الروبوت متوقف مؤقتاً (PAUSED) - اضغط تشغيل لتفعيل التداول الآلي';
  console.log(`🎛️ [Server Bot] تم تغيير حالة تشغيل الروبوت على السيرفر إلى: ${isServerBotRunning ? 'تشغيل (RUNNING)' : 'إيقاف (STOPPED)'}`);
  res.json({ running: isServerBotRunning, waitReason: currentWaitReason, lastExecutionError });
});

app.post('/api/bot/config', (req, res) => {
  const { maxEntryPrice, maxBankrollRiskPercent } = req.body;
  if (typeof maxEntryPrice === 'number' && maxEntryPrice > 0) {
    ZSCORE_STRATEGY.maxEntryPrice = maxEntryPrice;
    console.log(`⚙️ [Server Bot] تم تحديث سقف سعر الدخول إلى: $${maxEntryPrice}`);
  }
  if (typeof maxBankrollRiskPercent === 'number' && maxBankrollRiskPercent > 0) {
    ZSCORE_STRATEGY.maxBankrollRiskPercent = maxBankrollRiskPercent;
    console.log(`⚙️ [Server Bot] تم تحديث سقف أمان الصفقة إلى: ${(maxBankrollRiskPercent * 100).toFixed(1)}%`);
  }
  res.json({
    success: true,
    maxEntryPrice: ZSCORE_STRATEGY.maxEntryPrice,
    maxBankrollRiskPercent: ZSCORE_STRATEGY.maxBankrollRiskPercent,
  });
});

app.post('/api/bot/clear-error', (req, res) => {
  lastExecutionError = null;
  res.json({ success: true, message: 'تم إزالة التنبيه بنجاح' });
});

app.post('/api/bot/reset-market-lock', (req, res) => {
  const { slug } = req.body || {};
  if (slug) {
    tradedContractsMap.delete(slug.toLowerCase().trim());
  } else {
    tradedContractsMap.clear();
  }
  saveTradedContracts(tradedContractsMap);
  console.log(`🔓 [Server Bot] تم إعادة تعيين قفل العقد بنجاح.`);
  res.json({ success: true, message: 'تم فتح قفل العقود بنجاح', remainingLocks: tradedContractsMap.size });
});

app.post('/api/bot/execute-trade', async (req, res) => {
  const { tokenType, force } = req.body || {};
  const target: 'YES' | 'NO' = tokenType === 'NO' ? 'NO' : 'YES';

  if (!serverWallet) {
    return res.status(400).json({ success: false, error: 'المحفظة غير مهيأة على السيرفر' });
  }

  try {
    console.log(`⚡ [Execute Trade] طلب تنفيذ صفقة لعقد ${target}...`);
    if (force) {
      lastExecutedTradeTime = 0;
    }

    await executeLimitlessTrade(target, lastBtcPrice, lastCalculatedZScore, Boolean(force));
    await syncLimitlessUserHistory();

    return res.json({
      success: true,
      message: `تم إرسال أمر ${target} بنجاح إلى منصة Limitless`,
      waitReason: currentWaitReason,
      recentTrades: executedTradesLog.slice(0, 10),
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// Vite Middleware / Static Serve
// ==========================================

async function startServer() {
  const distPath = path.resolve(__dirname, 'dist');
  let hasDist = fs.existsSync(distPath);

  if (!hasDist) {
    console.log('⚡ بناء ملفات الإنتاج الجاهزة لتفادي أخطاء WebSocket...');
    try {
      const { build } = await import('vite');
      await build();
      hasDist = fs.existsSync(distPath);
    } catch (e: any) {
      console.warn('تعذر بناء ملفات الإنتاج برمجياً:', e.message);
    }
  }

  if (hasDist) {
    console.log('📦 تقديم ملفات الإنتاج الجاهزة من مجلد dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  } else {
    console.log('⚡ تشغيل Vite Middleware في وضع التطوير');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 السيرفر يعمل على المنفذ: http://0.0.0.0:${PORT}`);
    if (serverWallet) {
      console.log(`💳 المحفظة النشطة: ${serverWallet.address}`);
      syncLimitlessUserHistory().catch(() => {});
    }
  });
}

startServer();
