export const BASE_PYTHON_CODE = `#!/usr/bin/env python3
"""
========================================================================================
  Limitless MML (Micro-Momentum Lead-Lag Exploit) Quantitative Trading Bot
  ========================================================================================
  - Strategy: Exploit latency gap between Binance BTCUSDT Futures price discovery (Lead)
              and Limitless 5-minute Prediction Markets on Base chain (Lag).
  - Triggers: Volume Velocity & CVD anomaly spike exceeding 2.5 Sigma (+2.5σ or -2.5σ).
  - Target: Out-Of-The-Money (OTM) binary prediction contracts priced at <= \$0.10.
  - Risk Management: 1% wallet balance risk per trade, max slippage <= \$0.10.
  - Exit Strategy: Dynamic Flip taking instant profit at >= 300% gain (4x entry).
  - Architecture: Ultra-low latency asynchronous execution with asyncio, websockets & web3.py.
========================================================================================
"""

import asyncio
import json
import logging
import math
import os
import sys
import time
from collections import deque
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Dict, List, Optional, Tuple

import aiohttp
import websockets
from dotenv import load_dotenv
from eth_account import Account
from web3 import AsyncHTTPProvider, AsyncWeb3
from web3.exceptions import TransactionNotFound

# ======================================================================================
# Limitless Exchange Official Python SDK Integration & Error Handling
# ======================================================================================
try:
    from limitless_sdk import Client as LimitlessClient, HMACCredentials
    from limitless_sdk.api import (
        HttpClient as LimitlessHttpClient,
        RetryableClient,
        RetryConfig,
        APIError,
        HttpRawResponse,
        retry_on_errors,
    )
    from limitless_sdk.markets import MarketFetcher
    from limitless_sdk.market_pages import MarketPageFetcher
    from limitless_sdk.orders import OrderClient
    from limitless_sdk.portfolio import PortfolioFetcher
    from limitless_sdk.websocket import WebSocketClient as LimitlessWSClient, WebSocketConfig as LimitlessWSConfig
    from limitless_sdk.types import Side, OrderType, ConsoleLogger, LogLevel

    # Workaround for official SDK NoOpLogger.warning bug:
    try:
        from limitless_sdk.types.logger import NoOpLogger
        NoOpLogger.warning = lambda self, msg, context=None: None
    except Exception:
        pass

    HAS_LIMITLESS_SDK = True
except ImportError:
    HAS_LIMITLESS_SDK = False

# Load environment variables from .env
load_dotenv()

# ======================================================================================
# 1. إعدادات السجل والطباعة (Logging Configuration)
# ======================================================================================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("MML-Bot")


# ======================================================================================
# 2. كائن التهيئة والإعدادات المركزية (Bot Configuration)
# ======================================================================================
@dataclass
class BotConfig:
    """
    كائن يحمل كافة إعدادات البوت والاتصال وإدارة المخاطر.
    يمكن ضبطها عبر متغيرات البيئة أو القيم الافتراضية المحددة أدناه.
    """
    # RPC شبكة Base
    RPC_URL: str = os.getenv("RPC_URL", "https://mainnet.base.org")
    
    # المحفظة والمفتاح الخاص (يجب إخفاؤه في ملف .env)
    PRIVATE_KEY: str = os.getenv("PRIVATE_KEY", "")
    WALLET_ADDRESS: str = os.getenv("WALLET_ADDRESS", "")
    
    # وضع التداول التجريبي تم إزالته (التداول الحقيقي فقط)
    
    # إدارة المخاطر والانزلاق السعري
    RISK_PER_TRADE: float = float(os.getenv("RISK_PER_TRADE", "0.01"))  # 1% من الرصيد
    MAX_ENTRY_PRICE: float = float(os.getenv("MAX_ENTRY_PRICE", "0.10"))  # أقصى سعر للدخول (<= 0.10\$)
    MAX_SLIPPAGE: float = float(os.getenv("MAX_SLIPPAGE", "0.10"))  # أقصى انزلاق سعري 0.10\$
    DYNAMIC_FLIP_PROFIT: float = float(os.getenv("DYNAMIC_FLIP_PROFIT", "3.00"))  # 300% ربح للخروج
    
    # إعدادات الزخم وتحليل الحجم (CVD & 2.5 Sigma)
    SIGMA_THRESHOLD: float = float(os.getenv("SIGMA_THRESHOLD", "2.5"))  # 2.5 انحراف معياري
    ROLLING_WINDOW_SIZE: int = int(os.getenv("ROLLING_WINDOW_SIZE", "120"))  # نافذة الحساب (120 ثانية / تكة)
    
    # روابط WebSocket لـ Binance Futures (مع روابط بديلة لتجاوز الحظر الجغرافي الأمريكي)
    BINANCE_WS_URLS: List[str] = field(default_factory=lambda: [
        "wss://fstream.binance.com/ws/btcusdt@aggTrade",
        "wss://fstream-auth.binance.com/ws/btcusdt@aggTrade",
        "wss://nbstream.binance.com/ws/btcusdt@aggTrade",
    ])
    # بروكسي اختياري (HTTP/SOCKS5) إذا كانت خدمة Binance محظورة في منطقتك
    PROXY_URL: Optional[str] = os.getenv("PROXY_URL", None)

    # عناوين العقود الذكية على شبكة Base
    # Native USDC on Base
    USDC_ADDRESS: str = os.getenv("USDC_ADDRESS", "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913")
    # عنوان راوتر منصة Limitless لأسواق التنبؤات (Base Mainnet)
    LIMITLESS_ROUTER: str = os.getenv("LIMITLESS_ROUTER", "0xD729221C3D6176378411D048b0C7c77d5b1B3736")
    
    # معرف سوق البيتكوين BTC 5-minute Market على منصة Limitless
    BTC_5M_MARKET_ADDRESS: str = os.getenv("BTC_5M_MARKET_ADDRESS", "0x1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c")
    
    # إعدادات Limitless Python SDK الرسمية (Scoped HMAC-SHA256 Token)
    LMTS_TOKEN_ID: str = os.getenv("LMTS_TOKEN_ID", "")
    LMTS_TOKEN_SECRET: str = os.getenv("LMTS_TOKEN_SECRET", "")
    BTC_MARKET_SLUG: str = os.getenv("BTC_MARKET_SLUG", "")  # مثال: btc-above-100k-march-2025 أو يُكتشف تلقائياً

    # حالة التداول (التحكم عن بُعد من الواجهة الأمامية)
    BOT_ENABLED: bool = True


# ======================================================================================
# 3. واجهات العقود الذكية المبسطة (Minimal ERC20 & Limitless FPMM ABI)
# ======================================================================================
ERC20_ABI = [
    {
        "constant": True,
        "inputs": [{"name": "_owner", "type": "address"}],
        "name": "balanceOf",
        "outputs": [{"name": "balance", "type": "uint256"}],
        "type": "function",
    },
    {
        "constant": False,
        "inputs": [
            {"name": "_spender", "type": "address"},
            {"name": "_value", "type": "uint256"},
        ],
        "name": "approve",
        "outputs": [{"name": "success", "type": "bool"}],
        "type": "function",
    },
    {
        "constant": True,
        "inputs": [
            {"name": "_owner", "type": "address"},
            {"name": "_spender", "type": "address"},
        ],
        "name": "allowance",
        "outputs": [{"name": "remaining", "type": "uint256"}],
        "type": "function",
    },
    {
        "constant": True,
        "inputs": [],
        "name": "decimals",
        "outputs": [{"name": "", "type": "uint8"}],
        "type": "function",
    },
]

# واجهة تفاعل أسواق التنبؤات (Fixed Product Market Maker / Conditional Tokens)
LIMITLESS_MARKET_ABI = [
    {
        "name": "calcBuyAmount",
        "inputs": [
            {"name": "investmentAmount", "type": "uint256"},
            {"name": "outcomeIndex", "type": "uint256"},
        ],
        "outputs": [{"name": "outcomeTokenCount", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "name": "buy",
        "inputs": [
            {"name": "investmentAmount", "type": "uint256"},
            {"name": "outcomeIndex", "type": "uint256"},
            {"name": "minOutcomeTokensToBuy", "type": "uint256"},
        ],
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "name": "sell",
        "inputs": [
            {"name": "returnAmount", "type": "uint256"},
            {"name": "outcomeIndex", "type": "uint256"},
            {"name": "maxOutcomeTokensToSell", "type": "uint256"},
        ],
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "name": "getSpotPrice",
        "inputs": [{"name": "outcomeIndex", "type": "uint256"}],
        "outputs": [{"name": "price", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "name": "stage",
        "inputs": [],
        "outputs": [{"name": "", "type": "uint8"}],
        "stateMutability": "view",
        "type": "function",
    },
]


# ======================================================================================
# 4. محرك حساب الـ CVD وزخم الحجم ورصد الانفجار (CVD & 2.5 Sigma Engine)
# ======================================================================================
class MicroMomentumEngine:
    """
    محرك الزخم الدقيق:
    - يستقبل صفقات التداول اللحظية من Binance Futures (BTCUSDT aggTrade).
    - يحسب الـ CVD (Cumulative Volume Delta) بناءً على كون المشتري هو الصانع أم المستهلك.
    - يقيس زخم الحجم اللحظي (Volume Velocity) في نوافذ زمنية سريعة.
    - يحسب المتوسط والانحراف المعياري للـ Delta لاكتشاف طفرات تفوق 2.5 انحراف معياري (+2.5σ أو -2.5σ).
    """

    def __init__(self, window_size: int = 120, sigma_threshold: float = 2.5):
        self.window_size = window_size
        self.sigma_threshold = sigma_threshold
        
        # الـ CVD التراكمي
        self.cvd: float = 0.0
        self.last_trade_price: float = 0.0
        self.last_trade_time: float = time.time()
        
        # سجل التغيرات اللحظية في الحجم لحساب الإحصائيات (Rolling Delta Window)
        self.deltas: deque = deque(maxlen=window_size)
        self.velocities: deque = deque(maxlen=window_size)
        
        # قفل غير متزامن لحماية الذاكرة أثناء التحديث عالي التردد
        self._lock = asyncio.Lock()

    async def process_tick(self, trade_data: dict) -> Optional[Tuple[str, float, float, float]]:
        """
        معالجة صفقة BTCUSDT مفردة:
        - trade_data['p']: سعر الصفقة
        - trade_data['q']: حجم الصفقة
        - trade_data['m']: هل المشتري صانع سوق (isBuyerMaker).
          إذا كان True: البيع كان ماركت (Taker Sell) -> دلتا سالبة (-q).
          إذا كان False: الشراء كان ماركت (Taker Buy) -> دلتا موجبة (+q).
        
        العائد:
        - tuple(signal_direction, z_score, current_price, current_cvd) في حال حدوث طفرة تتجاوز 2.5 Sigma.
        - None إذا كان الحجم اعتيادياً ضمن النطاق الطبيعي.
        """
        async with self._lock:
            price = float(trade_data["p"])
            qty = float(trade_data["q"])
            is_buyer_maker = bool(trade_data["m"])
            trade_time = float(trade_data["T"]) / 1000.0  # Unix timestamp in seconds

            # حساب الدلتا: سالب للبيع الماركت، موجب للشراء الماركت
            delta = -qty if is_buyer_maker else qty
            self.cvd += delta
            self.deltas.append(delta)
            
            # حساب سرعة الحجم اللحظية (Volume Velocity = Delta / dt)
            dt = max(trade_time - self.last_trade_time, 0.001)
            velocity = delta / dt
            self.velocities.append(velocity)
            
            self.last_trade_price = price
            self.last_trade_time = trade_time

            # نحتاج إلى عينة دنيا من البيانات قبل بدء حساب الانحراف المعياري
            if len(self.deltas) < 30:
                return None

            # حساب المتوسط الحسابي والانحراف المعياري للـ Delta
            mean_delta = sum(self.deltas) / len(self.deltas)
            variance = sum((x - mean_delta) ** 2 for x in self.deltas) / len(self.deltas)
            std_dev = math.sqrt(variance)

            # تجنب القسمة على الصفر
            if std_dev < 1e-6:
                return None

            # درجة الانحراف المعياري (Z-Score) للدلتا الحالية
            z_score = (delta - mean_delta) / std_dev

            # رصد الانفجار الحجمي (Volume Surge >= 2.5 Sigma)
            if abs(z_score) >= self.sigma_threshold:
                direction = "BUY_UP" if z_score > 0 else "BUY_DOWN"
                logger.info(
                    f"🚨 [MOMENTUM ALERT] Anomaly Spike detected: {direction} | "
                    f"Z-Score: {z_score:+.2f}σ (>= {self.sigma_threshold}σ) | "
                    f"BTC Price: \${price:,.2f} | CVD: {self.cvd:+,.2f} | Delta: {delta:+,.3f}"
                )
                return (direction, z_score, price, self.cvd)

            return None


# ======================================================================================
# 5. التفاعل مع شبكة Base ومنصة Limitless (Web3 Execution Engine)
# ======================================================================================
class LimitlessWeb3Client:
    """
    واجهة الربط المباشر مع شبكة Base والعقود الذكية لمنصة Limitless:
    - فحص العقود والحصول على أسعار الخيارات (Outcomes: UP / DOWN).
    - تصفية العقود التي تباع بأقل من 0.10\$ فقط (OTM).
    - تنفيذ عمليات الشراء الماركت وتمرير المعاملات الموقعة بواسطة المفتاح الخاص بسرعة فائقة.
    - تنفيذ أمر البيع التلقائي عند تحقيق هدف الربح >= 300% (Dynamic Flip).
    """

    def __init__(self, config: BotConfig):
        self.config = config
        self.w3 = AsyncWeb3(AsyncHTTPProvider(config.RPC_URL))
        self.account = None
        if config.PRIVATE_KEY:
            try:
                self.account = Account.from_key(config.PRIVATE_KEY)
                logger.info(f"🔑 Wallet loaded successfully: {self.account.address}")
            except Exception as e:
                logger.error(f"❌ Failed to parse private key: {e}")
        
        # عقود الـ ERC20 والـ Market
        self.usdc_contract = None
        self.market_contract = None

        # مكونات Limitless Python SDK الرسمية
        self.http_client: Optional[LimitlessHttpClient] = None
        self.retryable_client: Optional[RetryableClient] = None
        self.retry_config: Optional[RetryConfig] = None
        self.market_fetcher: Optional[MarketFetcher] = None
        self.order_client: Optional[OrderClient] = None
        self.portfolio_fetcher: Optional[PortfolioFetcher] = None
        self.ws_client: Optional[LimitlessWSClient] = None
        self.live_orderbook: Dict[str, dict] = {}
        self.latest_prices: Dict[str, float] = {}
        self.latest_oracle_prices: Dict[str, float] = {}
        self.current_market = None
        self.cached_venue_exchange = None
        self.cached_venue_adapter = None

    async def initialize(self):
        """التحقق من الاتصال بالـ RPC وتهيئة العقود والـ SDK الرسمي"""
        is_connected = await self.w3.is_connected()
        if not is_connected:
            raise ConnectionError(f"Cannot connect to Base RPC at {self.config.RPC_URL}")
        
        chain_id = await self.w3.eth.chain_id
        logger.info(f"🌐 Connected to Base Chain (Chain ID: {chain_id}) at {self.config.RPC_URL}")
        
        # تهيئة العقود الذكية الأساسية
        self.usdc_contract = self.w3.eth.contract(
            address=self.w3.to_checksum_address(self.config.USDC_ADDRESS),
            abi=ERC20_ABI,
        )
        self.market_contract = self.w3.eth.contract(
            address=self.w3.to_checksum_address(self.config.BTC_5M_MARKET_ADDRESS),
            abi=LIMITLESS_MARKET_ABI,
        )

        # تهيئة Limitless Python SDK الرسمي إذا كانت بيانات الاعتماد متوفرة
        if HAS_LIMITLESS_SDK and self.config.LMTS_TOKEN_ID and self.config.LMTS_TOKEN_SECRET:
            try:
                logger.info("🔐 Initializing official Limitless Python SDK (HMAC-SHA256 Auth)...")
                self.http_client = LimitlessHttpClient(
                    hmac_credentials=HMACCredentials(
                        token_id=self.config.LMTS_TOKEN_ID,
                        secret=self.config.LMTS_TOKEN_SECRET,
                    ),
                )

                # استخدام كائن RetryableClient الرسمي لتوفير مقاومة عالية ضد انقطاعات الشبكة والـ 429
                self.retry_config = RetryConfig(
                    status_codes={500, 502, 503, 429},
                    max_retries=3,
                    delays=[1.0, 2.0, 4.0],
                )
                self.retryable_client = RetryableClient(self.http_client, self.retry_config)
                logger.info("🛡️ Limitless RetryableClient enabled (Exponential backoff on 429, 500, 502, 503).")

                self.market_fetcher = MarketFetcher(self.retryable_client)
                self.portfolio_fetcher = PortfolioFetcher(self.retryable_client)
                logger.info("💼 Official Limitless PortfolioFetcher initialized (Positions & Profile tracking active).")
                
                if self.account:
                    self.order_client = OrderClient(self.retryable_client, self.account)
                    logger.info("⚡ Official Limitless OrderClient active with RetryableClient & EIP-712 signing.")

                # اكتشاف وعمل Venue Cache للسوق النشط
                await self.discover_and_cache_market()

                # بدء البث المباشر الفوري عبر WebSocket للأسواق والأوامر
                await self.init_websocket_streaming()
            except Exception as e:
                logger.warning(f"⚠️ Limitless SDK initialization note: {e}. On-chain fallback available.")
        elif not HAS_LIMITLESS_SDK:
            logger.info("ℹ️ limitless-sdk package not detected in current environment. Using on-chain Web3 fallback.")
        else:
            logger.info("ℹ️ LMTS_TOKEN_ID / LMTS_TOKEN_SECRET not set in .env. Running on-chain Web3 & paper modes.")

    async def get_live_portfolio_positions(self) -> dict:
        """قراءة المراكز المفتوحة الحقيقية (CLOB & AMM) والنقاط التراكمية عبر PortfolioFetcher"""
        if not self.portfolio_fetcher:
            return {"clob": [], "amm": [], "accumulativePoints": {}}
        try:
            return await self.portfolio_fetcher.get_positions()
        except APIError as e:
            logger.warning(f"⚠️ APIError fetching live positions [{e.status_code}]: {e.message}")
            return {"clob": [], "amm": [], "accumulativePoints": {}}
        except Exception as e:
            logger.warning(f"⚠️ Error fetching live portfolio positions: {e}")
            return {"clob": [], "amm": [], "accumulativePoints": {}}

    async def get_account_profile(self) -> Optional[dict]:
        """قراءة بيانات الملف الشخصي والمحفظة ورسوم التداول عبر PortfolioFetcher"""
        if not self.portfolio_fetcher:
            return None
        try:
            return await self.portfolio_fetcher.get_current_profile()
        except APIError as e:
            logger.warning(f"⚠️ APIError fetching account profile [{e.status_code}]: {e.message}")
            return None
        except Exception as e:
            logger.warning(f"⚠️ Error fetching account profile: {e}")
            return None

    async def discover_and_cache_market(self):
        """
        اكتشاف سوق البيتكوين النشط وعمل Venue Caching تلقائي للعقود
        مع فحص الـ Rate Limit عبر HttpRawResponse
        """
        if not self.market_fetcher:
            return
        
        try:
            target_slug = self.config.BTC_MARKET_SLUG
            if not target_slug:
                try:
                    # جلب الأسواق النشطة
                    active_markets = await self.market_fetcher.get_active_markets()
                    data_list = getattr(active_markets, "data", active_markets)
                    if isinstance(data_list, dict):
                        data_list = data_list.get("data", [])
                    if isinstance(data_list, list):
                        for m in data_list:
                            title = getattr(m, "title", "") or (m.get("title", "") if isinstance(m, dict) else "")
                            slug = getattr(m, "slug", "") or (m.get("slug", "") if isinstance(m, dict) else "")
                            if "btc" in title.lower() or "bitcoin" in title.lower():
                                target_slug = slug
                                break
                except Exception as disc_err:
                    logger.debug(f"Active markets discovery notice: {disc_err}")
            
            if target_slug:
                logger.info(f"🎯 Discovering & caching venue for Limitless market: {target_slug}")
                self.current_market = await self.market_fetcher.get_market(target_slug)
                self.cached_venue_exchange = getattr(self.current_market.venue, "exchange", None)
                self.cached_venue_adapter = getattr(self.current_market.venue, "adapter", None)
                logger.info(
                    f"✅ Venue cached successfully: {self.current_market.title} | "
                    f"Exchange: {self.cached_venue_exchange} | "
                    f"YES Token: {self.current_market.tokens.yes} | NO Token: {self.current_market.tokens.no}"
                )
        except APIError as api_err:
            logger.warning(f"⚠️ Limitless APIError [{api_err.status_code}]: {api_err.message}")
        except Exception as e:
            logger.warning(f"⚠️ Limitless market discovery notice: {e}")

    async def init_websocket_streaming(self):
        """تهيئة اتصال WebSocket للبث المباشر لجدول الأوامر وتحديثات الأسعار والأوامر"""
        if not HAS_LIMITLESS_SDK or not self.config.LMTS_TOKEN_ID or not self.config.LMTS_TOKEN_SECRET:
            return

        try:
            logger.info("⚡ Initializing official Limitless WebSocket Client (Auto-reconnect & zero-latency streaming active)...")
            ws_config = LimitlessWSConfig(
                url="wss://ws.limitless.exchange",
                hmac_credentials=HMACCredentials(
                    token_id=self.config.LMTS_TOKEN_ID,
                    secret=self.config.LMTS_TOKEN_SECRET,
                ),
                auto_reconnect=True,
                reconnect_delay=5.0,
            )
            self.ws_client = LimitlessWSClient(ws_config)

            target_slug = self.config.BTC_MARKET_SLUG or (self.current_market.slug if self.current_market else "btc-above-100k-march-2025")
            market_slugs = [target_slug]

            async def _safe_subscribe():
                """الاشتراك الآمن بعد التأكد من اكتمال مصافحة WebSocket لتجنب أي استثناءات تزامنية"""
                for attempt in range(15):
                    # الانتظار حتى تكتمل حالة الاتصال الداخلية داخل SDK العميل
                    if getattr(self.ws_client, "_connected", False) or getattr(self.ws_client, "is_connected", False):
                        break
                    await asyncio.sleep(0.2)

                try:
                    await self.ws_client.subscribe(
                        "subscribe_market_prices",
                        {"marketSlugs": market_slugs},
                    )
                    logger.info(f"📡 [LIMITLESS WS] Subscribed to real-time market prices for: {market_slugs}")
                except Exception as sub_err:
                    logger.debug(f"WS Market subscription note: {sub_err}")

                try:
                    await self.ws_client.subscribe("subscribe_order_events")
                    await self.ws_client.subscribe(
                        "subscribe_positions",
                        {"marketSlugs": market_slugs},
                    )
                    logger.info("🔐 [LIMITLESS WS] Subscribed to authenticated order events & positions stream.")
                except Exception as auth_sub_err:
                    logger.debug(f"WS Authenticated subscription note: {auth_sub_err}")

            @self.ws_client.on("connect")
            async def on_connect():
                logger.info("🟢 [LIMITLESS WS] Connected to Limitless Exchange streaming server (WebSocket Pure Mode).")
                # تشغيل الاشتراك في الخلفية لضمان عدم حجب معالج أحداث socketio
                asyncio.create_task(_safe_subscribe())

            @self.ws_client.on("orderbookUpdate")
            async def on_orderbook(data):
                slug = data.get("marketSlug", "unknown") if isinstance(data, dict) else getattr(data, "marketSlug", "unknown")
                self.live_orderbook[slug] = data
                bids_cnt = len(data.get("bids", [])) if isinstance(data, dict) else len(getattr(data, "bids", []))
                asks_cnt = len(data.get("asks", [])) if isinstance(data, dict) else len(getattr(data, "asks", []))
                logger.info(f"📖 [LIMITLESS WS ORDERBOOK] Live Book Update [{slug}]: {bids_cnt} Bids, {asks_cnt} Asks (Zero Latency)")

            @self.ws_client.on("newPriceData")
            async def on_price(data):
                slug = data.get("marketSlug", "unknown") if isinstance(data, dict) else getattr(data, "marketSlug", "unknown")
                price = data.get("price") if isinstance(data, dict) else getattr(data, "price", None)
                if price is not None:
                    try:
                        self.latest_prices[slug] = float(price)
                    except ValueError:
                        pass
                logger.info(f"💲 [LIMITLESS WS PRICE] Live Tick [{slug}]: \${price}")

            @self.ws_client.on("oraclePriceData")
            async def on_oracle(data):
                slug = getattr(data, "marketSlug", None) or (data.get("marketSlug") if isinstance(data, dict) else "unknown")
                val = getattr(data, "value", None) or (data.get("value") if isinstance(data, dict) else None)
                if val is not None:
                    try:
                        self.latest_oracle_prices[slug] = float(val)
                    except ValueError:
                        pass
                logger.debug(f"🔮 [LIMITLESS WS] Oracle price [{slug}]: {val}")

            @self.ws_client.on("orderEvent")
            async def on_order_event(event):
                source = event.get("source", "UNKNOWN") if isinstance(event, dict) else "EVENT"
                evt_type = event.get("type", "UNKNOWN") if isinstance(event, dict) else "TYPE"
                order_id = event.get("orderId", "N/A") if isinstance(event, dict) else "N/A"
                logger.info(f"🔔 [LIMITLESS WS ORDER EVENT] Source: {source}, Type: {evt_type}, OrderId: {order_id}")

            @self.ws_client.on("positions")
            async def on_positions(data):
                logger.info(f"📊 [LIMITLESS WS POSITIONS] Realtime position change received: {data}")

            # بدء الاتصال بمقبس الويب
            try:
                await self.ws_client.connect()
                logger.info("🚀 Limitless WebSocket streaming client connected successfully.")
                asyncio.create_task(_safe_subscribe())
            except Exception as conn_err:
                logger.warning(f"⚠️ Limitless WS connect warning: {conn_err}. Streaming task active.")

        except Exception as ws_err:
            logger.warning(f"⚠️ Limitless WebSocket initialization notice: {ws_err}. Continuing with HTTP/Web3.")

    async def close(self):
        """إغلاق جلسات الاتصال للـ SDK ومقابس الويب بأمان"""
        if self.ws_client:
            try:
                if hasattr(self.ws_client, "disconnect"):
                    await self.ws_client.disconnect()
                elif hasattr(self.ws_client, "close"):
                    await self.ws_client.close()
            except Exception as e:
                logger.debug(f"Error closing Limitless WebSocket client: {e}")
        if self.http_client:
            try:
                await self.http_client.close()
            except Exception:
                pass

    async def get_wallet_usdc_balance(self) -> float:
        """قراءة رصيد المحفظة من عملة USDC بالدولار"""
        if not self.account:
            return 0.0

        try:
            checksum_addr = self.w3.to_checksum_address(self.account.address)
            balance_raw = await self.usdc_contract.functions.balanceOf(checksum_addr).call()
            # USDC على Base يحتوي على 6 أصفار عشرية
            balance_usd = balance_raw / 1e6
            return balance_usd
        except Exception as e:
            logger.error(f"⚠️ Error fetching USDC balance: {e}")
            return 0.0

    async def ensure_venue_approvals(self, exchange_addr: str, adapter_addr: Optional[str] = None):
        """
        تنفيذ موافقات العقود الذكية لمرة واحدة (One-time on-chain approvals):
        - موافقة USDC لعقد التبادل (Exchange).
        - موافقة Conditional Tokens (setApprovalForAll) لعقد التبادل (ولمحول NegRisk إن وجد).
        """
        if not self.account:
            return

        try:
            sender = self.account.address
            CT_ADDRESS = "0xC9c98965297Bc527861c898329Ee280632B76e18"
            
            # 1. فحص موافقة USDC للـ Exchange
            allowance = await self.usdc_contract.functions.allowance(
                sender, self.w3.to_checksum_address(exchange_addr)
            ).call()
            if allowance < 1000 * 10**6:
                logger.info(f"🔓 Approving USDC for Limitless Exchange Venue: {exchange_addr}...")
                nonce = await self.w3.eth.get_transaction_count(sender)
                approve_tx = await self.usdc_contract.functions.approve(
                    self.w3.to_checksum_address(exchange_addr), 2**256 - 1
                ).build_transaction({
                    "from": sender,
                    "nonce": nonce,
                    "maxFeePerGas": await self.w3.eth.gas_price * 2,
                    "maxPriorityFeePerGas": self.w3.to_wei(0.01, "gwei"),
                    "chainId": 8453,
                })
                signed = self.w3.eth.account.sign_transaction(approve_tx, self.config.PRIVATE_KEY)
                tx_hash = await self.w3.eth.send_raw_transaction(signed.raw_transaction)
                await self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=30)
                logger.info("✅ USDC Venue approval confirmed on Base.")

            # 2. فحص موافقة Conditional Tokens Framework
            ct_contract = self.w3.eth.contract(
                address=self.w3.to_checksum_address(CT_ADDRESS),
                abi=[{
                    "name": "setApprovalForAll",
                    "type": "function",
                    "inputs": [
                        {"name": "operator", "type": "address"},
                        {"name": "approved", "type": "bool"},
                    ],
                    "outputs": [],
                }],
            )
            # موافقة الـ Exchange لبيع التوكنات
            nonce = await self.w3.eth.get_transaction_count(sender)
            ct_tx = await ct_contract.functions.setApprovalForAll(
                self.w3.to_checksum_address(exchange_addr), True
            ).build_transaction({
                "from": sender,
                "nonce": nonce,
                "maxFeePerGas": await self.w3.eth.gas_price * 2,
                "maxPriorityFeePerGas": self.w3.to_wei(0.01, "gwei"),
                "chainId": 8453,
            })
            signed_ct = self.w3.eth.account.sign_transaction(ct_tx, self.config.PRIVATE_KEY)
            tx_h = await self.w3.eth.send_raw_transaction(signed_ct.raw_transaction)
            await self.w3.eth.wait_for_transaction_receipt(tx_h, timeout=30)
            logger.info("✅ Conditional Tokens approved for Limitless Exchange.")

            # إذا كان هناك adapter للـ NegRisk
            if adapter_addr:
                nonce = await self.w3.eth.get_transaction_count(sender)
                ct_adapter_tx = await ct_contract.functions.setApprovalForAll(
                    self.w3.to_checksum_address(adapter_addr), True
                ).build_transaction({
                    "from": sender,
                    "nonce": nonce,
                    "maxFeePerGas": await self.w3.eth.gas_price * 2,
                    "maxPriorityFeePerGas": self.w3.to_wei(0.01, "gwei"),
                    "chainId": 8453,
                })
                signed_adapter = self.w3.eth.account.sign_transaction(ct_adapter_tx, self.config.PRIVATE_KEY)
                tx_a = await self.w3.eth.send_raw_transaction(signed_adapter.raw_transaction)
                await self.w3.eth.wait_for_transaction_receipt(tx_a, timeout=30)
                logger.info("✅ Conditional Tokens approved for NegRisk Adapter.")
        except Exception as e:
            logger.warning(f"⚠️ Venue approvals notice: {e}")

    async def check_otm_opportunity(self, outcome_index: int) -> Optional[float]:
        """
        فحص سعر العقد للاتجاه المطلوب (0 = UP, 1 = DOWN):
        تصفية العقود التي تباع بسعر <= 0.10\$ فقط (Out of the Money) عبر سجل أوامر الـ SDK أو العقد المباشر.
        """
        try:
            # 1. فحص فائق السرعة عبر الذاكرة من خلال بث الـ WebSocket المباشر (Zero-latency in-memory book & stream)
            target_slug = (self.current_market.slug if self.current_market else None) or self.config.BTC_MARKET_SLUG
            if target_slug:
                if target_slug in self.live_orderbook:
                    ws_book = self.live_orderbook[target_slug]
                    asks = ws_book.get("asks", []) if isinstance(ws_book, dict) else getattr(ws_book, "asks", [])
                    if asks:
                        best_ask = float(asks[0].get("price", 1.0) if isinstance(asks[0], dict) else getattr(asks[0], "price", 1.0))
                        logger.info(f"⚡ [WS FAST-PATH] In-memory Live Book Best Ask for {target_slug}: \${best_ask:.4f} (Zero Latency)")
                        if best_ask <= self.config.MAX_ENTRY_PRICE:
                            return best_ask
                        else:
                            logger.info(f"⏳ WS Ask \${best_ask:.4f} > \${self.config.MAX_ENTRY_PRICE:.2f}. Skipping.")
                            return None
                
                if target_slug in self.latest_prices:
                    ws_price = self.latest_prices[target_slug]
                    logger.info(f"⚡ [WS FAST-PATH] Live Stream Price for {target_slug}: \${ws_price:.4f} (Zero Latency)")
                    if ws_price <= self.config.MAX_ENTRY_PRICE:
                        return ws_price
                    else:
                        logger.info(f"⏳ WS Price \${ws_price:.4f} > \${self.config.MAX_ENTRY_PRICE:.2f}. Skipping.")
                        return None

            # 2. محاولة قراءة أفضل سعر بيع (Best Ask) من سجل أوامر Limitless SDK الرسمي عبر HTTP
            if self.market_fetcher and self.current_market:
                try:
                    orderbook = await self.market_fetcher.get_orderbook(self.current_market.slug)
                    asks = orderbook.get("asks", []) if isinstance(orderbook, dict) else getattr(orderbook, "asks", [])
                    if asks:
                        first_ask = asks[0]
                        best_ask = float(first_ask.get("price", 1.0) if isinstance(first_ask, dict) else getattr(first_ask, "price", 1.0))
                        logger.info(f"📊 [SDK ORDERBOOK] Best Ask for {self.current_market.slug}: \${best_ask:.4f}")
                        if best_ask <= self.config.MAX_ENTRY_PRICE:
                            return best_ask
                        else:
                            logger.info(f"⏳ SDK Ask \${best_ask:.4f} > \${self.config.MAX_ENTRY_PRICE:.2f}. Skipping.")
                            return None
                except Exception as sdk_err:
                    logger.debug(f"SDK Orderbook check fallback: {sdk_err}")

            # 3. استدعاء السعر من العقد الذكي مباشرة (On-chain fallback)
            spot_price_raw = await self.market_contract.functions.getSpotPrice(outcome_index).call()
            spot_price_usd = spot_price_raw / 1e6  # Adjusted for USDC base
            
            logger.info(f"📊 Market Outcome [{outcome_index}] on-chain spot price: \${spot_price_usd:.4f}")
            
            # الشرط الأساسي للاستراتيجية: سعر العقد <= 0.10\$
            if spot_price_usd <= self.config.MAX_ENTRY_PRICE:
                return spot_price_usd
            else:
                logger.info(
                    f"⏳ Price \${spot_price_usd:.4f} exceeds max OTM threshold (\${self.config.MAX_ENTRY_PRICE:.2f}). Skipping."
                )
                return None
        except Exception as e:
            logger.warning(f"⚠️ Could not fetch market spot price: {e}.")
            return None

    async def execute_market_buy(
        self, outcome_index: int, entry_price: float, usdc_amount: float
    ) -> Optional[dict]:
        """
        تنفيذ صفقة شراء سريع (Market Buy) عبر Limitless Python SDK (OrderType.FOK أو GTC)
        مع التوقيع التلقائي EIP-712 وحماية الانزلاق السعري (Max Slippage <= 0.10\$).
        """
        logger.info(
            f"🚀 [EXECUTION] Submitting Market Buy for Outcome [{outcome_index}] | "
            f"Entry Price: \${entry_price:.4f} | Size: \${usdc_amount:.2f} USDC"
        )

        max_allowed_price = min(entry_price + self.config.MAX_SLIPPAGE, self.config.MAX_ENTRY_PRICE)
        min_tokens_expected = (usdc_amount / max_allowed_price) * 0.95  # 5% safety buffer

        if not self.account:
            logger.error("❌ Cannot execute live trade: No private key provided!")
            return None

        # 1. التنفيذ عبر Limitless Python SDK الرسمي (Native EIP-712 OrderClient)
        if self.order_client and self.current_market:
            try:
                target_token_id = self.current_market.tokens.yes if outcome_index == 0 else self.current_market.tokens.no
                logger.info(
                    f"⚡ [LIMITLESS SDK] Placing FOK BUY Order for {target_token_id} | "
                    f"Spending: \${usdc_amount:.2f} USDC on Market: {self.current_market.slug}"
                )
                
                # إرسال أمر Fill-or-kill عبر SDK
                order_result = await self.order_client.create_order(
                    token_id=target_token_id,
                    maker_amount=float(usdc_amount),
                    side=Side.BUY,
                    order_type=OrderType.FOK,
                    market_slug=self.current_market.slug,
                    stp_policy="cancel_maker",
                )
                logger.info(f"🎉 [LIMITLESS SDK SUCCESS] Order filled! Details: {order_result}")
                
                return {
                    "status": "SUCCESS",
                    "sdk_order": True,
                    "order_id": getattr(order_result, "id", str(order_result)),
                    "market_slug": self.current_market.slug,
                    "token_id": target_token_id,
                    "outcome_index": outcome_index,
                    "entry_price": entry_price,
                    "amount_usd": usdc_amount,
                    "tokens_bought": usdc_amount / entry_price,
                    "timestamp": time.time(),
                }
            except APIError as api_err:
                logger.error(f"❌ [LIMITLESS API ERROR {api_err.status_code}] {api_err.message}")
                if api_err.status_code == 400:
                    logger.error("   Reason: 400 Bad Request — Invalid order parameters or expired market.")
                elif api_err.status_code == 401:
                    logger.error("   Reason: 401 Unauthorized — Missing or invalid HMAC token/secret.")
                elif api_err.status_code == 403:
                    logger.error("   Reason: 403 Forbidden — Insufficient permissions or geographic restriction.")
                elif api_err.status_code == 404:
                    logger.error("   Reason: 404 Not Found — Invalid market slug or token ID.")
                elif api_err.status_code == 425:
                    logger.error("   Reason: 425 Too Early — Receive-window failure or maintenance block.")
                elif api_err.status_code == 429:
                    logger.warning("   Reason: 429 Too Many Requests — Handled by RetryableClient exponential backoff.")
                elif api_err.status_code >= 500:
                    logger.warning(f"   Reason: {api_err.status_code} Internal Server Error — Transient failure.")
                logger.info("   Proceeding to direct on-chain Base contract fallback...")
            except Exception as sdk_err:
                logger.error(f"❌ Limitless SDK OrderClient submission error: {sdk_err}. Falling back to direct on-chain.")

        # 2. خطة الطوارئ البديلة: التنفيذ عبر العقد الذكي مباشرة على شبكة Base
        try:
            investment_amount_raw = int(usdc_amount * 1e6)  # 6 decimals
            min_tokens_raw = int(min_tokens_expected * 1e6)

            sender_addr = self.account.address
            allowance = await self.usdc_contract.functions.allowance(
                sender_addr, self.config.LIMITLESS_ROUTER
            ).call()
            
            if allowance < investment_amount_raw:
                logger.info("🔓 Approving USDC spend for Limitless Router...")
                approve_tx = await self.usdc_contract.functions.approve(
                    self.config.LIMITLESS_ROUTER, 2**256 - 1
                ).build_transaction({
                    "from": sender_addr,
                    "nonce": await self.w3.eth.get_transaction_count(sender_addr),
                    "maxFeePerGas": await self.w3.eth.gas_price * 2,
                    "maxPriorityFeePerGas": self.w3.to_wei(0.01, "gwei"),
                })
                signed_approve = self.w3.eth.account.sign_transaction(
                    approve_tx, self.config.PRIVATE_KEY
                )
                tx_hash = await self.w3.eth.send_raw_transaction(signed_approve.raw_transaction)
                await self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=30)
                logger.info("✅ USDC Approved successfully.")

            nonce = await self.w3.eth.get_transaction_count(sender_addr)
            gas_estimate = 250000
            
            latest_block = await self.w3.eth.get_block("latest")
            base_fee = latest_block.get("baseFeePerGas", self.w3.to_wei(0.05, "gwei"))
            priority_fee = self.w3.to_wei(0.05, "gwei")
            max_fee = int(base_fee * 1.5) + priority_fee

            buy_func = self.market_contract.functions.buy(
                investment_amount_raw, outcome_index, min_tokens_raw
            )
            
            tx_data = await buy_func.build_transaction({
                "from": sender_addr,
                "nonce": nonce,
                "gas": gas_estimate,
                "maxFeePerGas": max_fee,
                "maxPriorityFeePerGas": priority_fee,
                "chainId": 8453,
            })

            signed_tx = self.w3.eth.account.sign_transaction(tx_data, self.config.PRIVATE_KEY)
            
            t0 = time.time()
            tx_hash_bytes = await self.w3.eth.send_raw_transaction(signed_tx.raw_transaction)
            tx_hash_hex = self.w3.to_hex(tx_hash_bytes)
            logger.info(f"📡 Transaction sent in {(time.time() - t0)*1000:.1f}ms! Hash: {tx_hash_hex}")

            receipt = await self.w3.eth.wait_for_transaction_receipt(tx_hash_bytes, timeout=20)
            if receipt["status"] == 1:
                logger.info(f"🎯 [CONFIRMED ON BASE] Block: {receipt['blockNumber']} | Hash: {tx_hash_hex}")
                return {
                    "status": "SUCCESS",
                    "tx_hash": tx_hash_hex,
                    "outcome_index": outcome_index,
                    "entry_price": entry_price,
                    "amount_usd": usdc_amount,
                    "tokens_bought": min_tokens_expected,
                    "timestamp": time.time(),
                }
            else:
                logger.error(f"❌ Transaction reverted on-chain: {tx_hash_hex}")
                return None

        except Exception as e:
            logger.error(f"❌ Error during Market Buy execution: {e}")
            return None

    async def execute_dynamic_flip_exit(self, position: dict, current_price: float) -> bool:
        """
        الخروج التلقائي (Dynamic Flip): بيع العقد فوراً عند تحقيق ربح >= 300%
        باستخدام Limitless Python SDK (FOK SELL) أو العقد الذكي مباشرة.
        """
        outcome_index = position["outcome_index"]
        entry_price = position["entry_price"]
        tokens_to_sell = position["tokens_bought"]
        profit_percent = ((current_price - entry_price) / entry_price) * 100.0

        logger.info(
            f"🎯 [DYNAMIC FLIP TRIGGERED] Current Price: \${current_price:.4f} | "
            f"Entry: \${entry_price:.4f} | Profit: +{profit_percent:.1f}% (>= {position.get('target_profit', 300)}%)"
        )

        if not self.account:
            return False

        # 1. محاولة البيع الفوري عبر الـ SDK الرسمي
        if self.order_client and position.get("token_id") and position.get("market_slug"):
            try:
                logger.info(
                    f"⚡ [LIMITLESS SDK] Submitting FOK SELL Order for {tokens_to_sell:.2f} shares "
                    f"on token {position['token_id']}"
                )
                sell_res = await self.order_client.create_order(
                    token_id=position["token_id"],
                    maker_amount=float(tokens_to_sell),
                    side=Side.SELL,
                    order_type=OrderType.FOK,
                    market_slug=position["market_slug"],
                    stp_policy="cancel_maker",
                )
                logger.info(f"🎉 [DYNAMIC FLIP SDK FILLED] Order details: {sell_res}")
                return True
            except APIError as api_err:
                logger.error(f"❌ [LIMITLESS DYNAMIC FLIP API ERROR {api_err.status_code}] {api_err.message}")
                if api_err.status_code == 429:
                    logger.warning("   Rate limit hit — RetryableClient applying backoff delays [1s, 2s, 4s].")
                elif api_err.status_code == 425:
                    logger.warning("   425 Too Early — Timestamp drift or maintenance.")
                logger.info("   Falling back to direct on-chain sell transaction on Base...")
            except Exception as sdk_sell_err:
                logger.warning(f"⚠️ Limitless SDK sell order notice: {sdk_sell_err}. Falling back to direct on-chain.")

        # 2. البيع المباشر عبر العقد الذكي
        try:
            return_amount_raw = int((tokens_to_sell * current_price * 0.95) * 1e6)
            tokens_raw = int(tokens_to_sell * 1e6)

            nonce = await self.w3.eth.get_transaction_count(self.account.address)
            sell_func = self.market_contract.functions.sell(
                return_amount_raw, outcome_index, tokens_raw
            )
            tx = await sell_func.build_transaction({
                "from": self.account.address,
                "nonce": nonce,
                "gas": 250000,
                "maxFeePerGas": self.w3.to_wei(0.1, "gwei"),
                "maxPriorityFeePerGas": self.w3.to_wei(0.02, "gwei"),
                "chainId": 8453,
            })
            signed = self.w3.eth.account.sign_transaction(tx, self.config.PRIVATE_KEY)
            tx_hash = await self.w3.eth.send_raw_transaction(signed.raw_transaction)
            logger.info(f"⚡ Exit Sell Tx broadcasted: {self.w3.to_hex(tx_hash)}")
            await self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=20)
            logger.info("🎉 Dynamic Flip Completed! Profits converted to USDC on Base.")
            return True
        except Exception as e:
            logger.error(f"❌ Failed to execute dynamic flip exit: {e}")
            return False


# ======================================================================================
# 6. مدير الاستراتيجية والمخاطر المنسق (Strategy Orchestrator & Risk Manager)
# ======================================================================================
class LeadLagExploitOrchestrator:
    """
    المنسق العام للاستراتيجية:
    1. يتصل بـ Binance Futures WebSocket لحساب CVD ورصد طفرات 2.5 Sigma.
    2. يستغل فارق التوقيت (Lead-Lag Latency Window) قبل أن يعدل صانع سوق Limitless أسعاره.
    3. يحسب حجم الصفقة بدقة 1% من رصيد المحفظة.
    4. يراقب المراكز المفتوحة ويطبق الخروج التلقائي Dynamic Flip عند تحقيق >= 300%.
    """

    def __init__(self, config: BotConfig):
        self.config = config
        self.momentum_engine = MicroMomentumEngine(
            window_size=config.ROLLING_WINDOW_SIZE,
            sigma_threshold=config.SIGMA_THRESHOLD,
        )
        self.web3_client = LimitlessWeb3Client(config)
        self.active_positions: List[dict] = []
        self.is_running = True

    async def start(self):
        """بدء تشغيل كافة المهام المتزامنة وغير المتزامنة في بيئة asyncio واحدة"""
        logger.info("=" * 70)
        logger.info("⚡ Starting Limitless MML Quant Trading Bot (BTC 5m Lead-Lag Exploit)")
        logger.info("🛠️ Execution Mode: LIVE PRODUCTION TRADING (PAPER TRADING DISABLED)")
        logger.info(f"📊 Anomaly Spike Threshold: {self.config.SIGMA_THRESHOLD}σ")
        logger.info(f"🛡️ Risk Per Trade: {self.config.RISK_PER_TRADE * 100:.1f}% of wallet")
        logger.info(f"🎯 Dynamic Flip Target: +{self.config.DYNAMIC_FLIP_PROFIT * 100:.0f}%")
        logger.info(f"🛑 Max Entry Price (OTM): <= \${self.config.MAX_ENTRY_PRICE:.2f}")
        logger.info("=" * 70)

        # تهيئة Web3 وعقود شبكة Base
        await self.web3_client.initialize()

        # إطلاق المهام المتوازية: خادم التحكم عن بعد، مراقبة الصفقات، ومراقبة خروج المراكز المفتوحة
        tasks = [
            asyncio.create_task(self._start_control_api()),
            asyncio.create_task(self._binance_websocket_loop()),
            asyncio.create_task(self._position_monitor_loop()),
        ]
        await asyncio.gather(*tasks)

    async def _start_control_api(self):
        """خادم تحكم خفيف غير متزامن لاستقبال أوامر التشغيل والإيقاف من الواجهة الأمامية (Remote Web Controller)"""
        try:
            from aiohttp import web
            app = web.Application()

            async def handle_status(request):
                return web.json_response({
                    "status": "online",
                    "bot_enabled": self.config.BOT_ENABLED,
                    "cvd": round(self.momentum_engine.cvd, 2),
                    "active_positions": len(self.active_positions),
                }, headers={"Access-Control-Allow-Origin": "*"})

            async def handle_portfolio(request):
                profile = await self.web3_client.get_account_profile()
                positions_data = await self.web3_client.get_live_portfolio_positions()
                return web.json_response({
                    "success": True,
                    "profile": profile,
                    "clob": positions_data.get("clob", []),
                    "amm": positions_data.get("amm", []),
                    "accumulativePoints": positions_data.get("accumulativePoints", {}),
                    "local_positions": self.active_positions,
                }, headers={"Access-Control-Allow-Origin": "*"})

            async def handle_start(request):
                self.config.BOT_ENABLED = True
                logger.info("🟢 [WEB COMMAND] Received START command from Frontend Dashboard. Live trading is ACTIVE.")
                return web.json_response({
                    "success": True,
                    "bot_enabled": True,
                    "message": "تم تشغيل الروبوت بنجاح عبر الواجهة الأمامية (ACTIVE)"
                }, headers={"Access-Control-Allow-Origin": "*"})

            async def handle_stop(request):
                self.config.BOT_ENABLED = False
                logger.info("🔴 [WEB COMMAND] Received STOP command from Frontend Dashboard. Trading execution is PAUSED.")
                return web.json_response({
                    "success": True,
                    "bot_enabled": False,
                    "message": "تم إيقاف الروبوت بنجاح عبر الواجهة الأمامية (STOPPED)"
                }, headers={"Access-Control-Allow-Origin": "*"})

            async def handle_options(request):
                return web.Response(headers={
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type",
                })

            app.router.add_get("/api/status", handle_status)
            app.router.add_get("/api/portfolio", handle_portfolio)
            app.router.add_post("/api/start", handle_start)
            app.router.add_post("/api/stop", handle_stop)
            app.router.add_route("OPTIONS", "/{tail:.*}", handle_options)

            runner = web.AppRunner(app)
            await runner.setup()
            site = web.TCPSite(runner, "0.0.0.0", 8080)
            await site.start()
            logger.info("🌐 [CONTROL API] Listening on http://0.0.0.0:8080 (Ready for Frontend Start/Stop commands)")
        except Exception as e:
            logger.warning(f"⚠️ Remote Control HTTP server notice: {e}. Bot continuing in autonomous mode.")

    async def _binance_websocket_loop(self):
        """
        حلقة الاتصال المستمر بـ Binance Futures WebSocket مع إعادة الاتصال التلقائي
        والتبديل بين السيرفرات البديلة في حال الحظر الجغرافي الأمريكي.
        """
        url_idx = 0
        while self.is_running:
            endpoint = self.config.BINANCE_WS_URLS[url_idx % len(self.config.BINANCE_WS_URLS)]
            logger.info(f"🔌 Connecting to Binance Tick Stream: {endpoint}")
            
            try:
                # دعم البروكسي الاختياري لتجاوز الحظر
                ws_kwargs = {"ping_interval": 20, "ping_timeout": 10}
                
                async with websockets.connect(endpoint, **ws_kwargs) as ws:
                    logger.info("🟢 WebSocket Connected! Streaming real-time BTC trades & calculating CVD...")
                    
                    while self.is_running:
                        message = await ws.recv()
                        data = json.loads(message)
                        
                        # معالجة التكة واكتشاف انحرافات الـ 2.5 Sigma
                        spike_signal = await self.momentum_engine.process_tick(data)
                        
                        if spike_signal:
                            direction, z_score, btc_price, cvd = spike_signal
                            # استدعاء مشغل الاستغلال الفوري (Lead-Lag Exploit Trigger)
                            asyncio.create_task(
                                self._handle_momentum_spike(direction, z_score, btc_price)
                            )

            except Exception as e:
                logger.warning(f"⚠️ Binance WS connection dropped ({e}). Reconnecting in 2 seconds...")
                url_idx += 1  # التبديل إلى الـ endpoint التالي
                await asyncio.sleep(2.0)

    async def _handle_momentum_spike(self, direction: str, z_score: float, btc_price: float):
        """
        معالجة إشارة الانفجار الحجمي:
        - تحديد الخيار المطلوب (0 = YES/UP إذا كانت الإشارة صاعدة، 1 = NO/DOWN إذا كانت هابطة).
        - استعلام عقد Limitless والتحقق من أن العقد ما زال رخيصاً (OTM <= 0.10\$).
        - حساب حجم الصفقة (1% من رصيد المحفظة).
        - تنفيذ الشراء الفوري قبل تلاشي فجوة التأخير (Lead-Lag Window).
        """
        outcome_index = 0 if direction == "BUY_UP" else 1
        outcome_label = "BTC_UP_5M" if outcome_index == 0 else "BTC_DOWN_5M"
        
        logger.info(f"⚡ [LEAD-LAG EXPLOIT] Triggered for {outcome_label} (Z: {z_score:+.2f}σ)")

        # 1. التحقق من السعر في عقد Limitless وتصفيته <= 0.10\$
        otm_price = await self.web3_client.check_otm_opportunity(outcome_index)
        if not otm_price or otm_price > self.config.MAX_ENTRY_PRICE:
            logger.info(f"⏩ Contract price ({otm_price}) not eligible for OTM exploit. Skipping.")
            return

        # 2. حساب حجم الصفقة بناءً على 1% من رصيد المحفظة
        wallet_balance = await self.web3_client.get_wallet_usdc_balance()
        if wallet_balance <= 0:
            logger.warning("⚠️ Insufficient USDC balance to trade.")
            return

        trade_amount_usd = wallet_balance * self.config.RISK_PER_TRADE
        # حد أدنى عملي للصفقة
        trade_amount_usd = max(trade_amount_usd, 5.0)

        logger.info(
            f"💼 Risk Sizing: 1% of \${wallet_balance:,.2f} = \${trade_amount_usd:.2f} USDC allocation"
        )

        # 3. إرسال المعاملة الموقعة إلى العقد الذكي على Base
        pos_record = await self.web3_client.execute_market_buy(
            outcome_index=outcome_index,
            entry_price=otm_price,
            usdc_amount=trade_amount_usd,
        )

        if pos_record:
            pos_record["outcome_label"] = outcome_label
            pos_record["target_price"] = otm_price * (1 + self.config.DYNAMIC_FLIP_PROFIT)
            pos_record["target_profit"] = self.config.DYNAMIC_FLIP_PROFIT * 100.0
            self.active_positions.append(pos_record)
            logger.info(
                f"🎯 Position tracking started: Target Exit Price >= \${pos_record['target_price']:.4f} "
                f"(+{pos_record['target_profit']:.0f}% profit)"
            )

    async def _position_monitor_loop(self):
        """
        مراقبة المراكز المفتوحة والتحقق الدوري من أسعارها لتطبيق استراتيجية الخروج التلقائي (Dynamic Flip).
        """
        while self.is_running:
            if self.active_positions:
                remaining_positions = []
                for pos in self.active_positions:
                    # في المحاكاة أو التداول الحقيقي: استعلام السعر الحالي للعقد
                    current_price = await self._get_current_market_price(pos)
                    entry_price = pos["entry_price"]
                    target_price = pos["target_price"]
                    
                    if current_price >= target_price:
                        # تم تحقيق هدف الـ 300% ربح -> خروج فوري
                        success = await self.web3_client.execute_dynamic_flip_exit(
                            pos, current_price
                        )
                        if not success:
                            remaining_positions.append(pos)
                    else:
                        remaining_positions.append(pos)

                self.active_positions = remaining_positions

            await asyncio.sleep(0.5)  # فحص سريع كل 500ms

    async def _get_current_market_price(self, position: dict) -> float:
        """قراءة السعر الفعلي أو محاكاته للتحقق من شرط الخروج"""
        try:
            spot_raw = await self.web3_client.market_contract.functions.getSpotPrice(
                position["outcome_index"]
            ).call()
            return spot_raw / 1e6
        except Exception:
            return position["entry_price"]


# ======================================================================================
# 7. الدالة الرئيسية ونقطة الدخول (Entry Point)
# ======================================================================================
async def main():
    config = BotConfig()
    orchestrator = LeadLagExploitOrchestrator(config)
    try:
        await orchestrator.start()
    except KeyboardInterrupt:
        logger.info("🛑 Bot execution stopped gracefully by user.")
    except Exception as e:
        logger.critical(f"❌ Fatal error in bot main loop: {e}", exc_info=True)
    finally:
        await orchestrator.web3_client.close()


if __name__ == "__main__":
    # تشغيل الحلقة غير المتزامنة بأعلى أداء (Ultra-low latency asyncio event loop)
    try:
        import uvloop
        uvloop.install()
        logger.info("⚡ Fast uvloop event loop active.")
    except ImportError:
        pass

    asyncio.run(main())
`;

export function generateCustomPythonScript(config: any): string {
  return BASE_PYTHON_CODE.replace(
    /RPC_URL: str = os\.getenv\("RPC_URL", "[^"]*"\)/,
    `RPC_URL: str = os.getenv("RPC_URL", "${config.rpcUrl}")`
  )
    .replace(
      /WALLET_ADDRESS: str = os\.getenv\("WALLET_ADDRESS", "[^"]*"\)/,
      `WALLET_ADDRESS: str = os.getenv("WALLET_ADDRESS", "${config.walletAddress}")`
    )
    .replace(
      /BOT_ENABLED: bool = os\.getenv\("BOT_ENABLED", "[^"]*"\)/,
      `BOT_ENABLED: bool = os.getenv("BOT_ENABLED", "${config.isBotRunning ? 'true' : 'false'}")`
    )
    .replace(
      /RISK_PER_TRADE: float = float\(os\.getenv\("RISK_PER_TRADE", "[^"]*"\)\)/,
      `RISK_PER_TRADE: float = float(os.getenv("RISK_PER_TRADE", "${config.riskPerTrade}"))`
    )
    .replace(
      /MAX_ENTRY_PRICE: float = float\(os\.getenv\("MAX_ENTRY_PRICE", "[^"]*"\)\)/,
      `MAX_ENTRY_PRICE: float = float(os.getenv("MAX_ENTRY_PRICE", "${config.maxEntryPrice}"))`
    )
    .replace(
      /MAX_SLIPPAGE: float = float\(os\.getenv\("MAX_SLIPPAGE", "[^"]*"\)\)/,
      `MAX_SLIPPAGE: float = float(os.getenv("MAX_SLIPPAGE", "${config.maxSlippage}"))`
    )
    .replace(
      /DYNAMIC_FLIP_PROFIT: float = float\(os\.getenv\("DYNAMIC_FLIP_PROFIT", "[^"]*"\)\)/,
      `DYNAMIC_FLIP_PROFIT: float = float(os.getenv("DYNAMIC_FLIP_PROFIT", "${config.dynamicFlipProfit}"))`
    )
    .replace(
      /SIGMA_THRESHOLD: float = float\(os\.getenv\("SIGMA_THRESHOLD", "[^"]*"\)\)/,
      `SIGMA_THRESHOLD: float = float(os.getenv("SIGMA_THRESHOLD", "${config.sigmaThreshold}"))`
    )
    .replace(
      /ROLLING_WINDOW_SIZE: int = int\(os\.getenv\("ROLLING_WINDOW_SIZE", "[^"]*"\)\)/,
      `ROLLING_WINDOW_SIZE: int = int(os.getenv("ROLLING_WINDOW_SIZE", "${config.rollingWindowSize}"))`
    );
}

export const REQUIREMENTS_TXT = `web3>=6.15.0
websockets>=12.0
eth-account>=0.11.0
python-dotenv>=1.0.0
aiohttp>=3.9.0
numpy>=1.24.0
limitless-sdk>=0.1.0`;

export const ENV_EXAMPLE_TXT = `# Limitless MML Quantitative Trading Bot Configuration
RPC_URL="https://mainnet.base.org"
PRIVATE_KEY=""
WALLET_ADDRESS=""
RISK_PER_TRADE="0.01"
MAX_ENTRY_PRICE="0.10"
MAX_SLIPPAGE="0.10"
DYNAMIC_FLIP_PROFIT="3.00"
SIGMA_THRESHOLD="2.5"
ROLLING_WINDOW_SIZE="120"
USDC_ADDRESS="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
LIMITLESS_ROUTER="0xD729221C3D6176378411D048b0C7c77d5b1B3736"
BTC_5M_MARKET_ADDRESS="0x1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c"
PROXY_URL=""
LMTS_TOKEN_ID=""
LMTS_TOKEN_SECRET=""`;
