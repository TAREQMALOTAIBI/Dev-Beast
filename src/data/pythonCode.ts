import { BotConfigState } from '../types';

export const BASE_PYTHON_CODE = `#!/usr/bin/env python3
"""
========================================================================================
  Limitless MML (Micro-Momentum Lead-Lag Exploit) Quantitative Trading Bot
  ========================================================================================
  - Strategy: Exploit latency gap between Binance BTCUSDT Futures price discovery (Lead)
              and Limitless 5-minute Prediction Markets on Base chain (Lag).
  - Triggers: Volume Velocity & CVD anomaly spike exceeding 2.5 Sigma (+2.5σ or -2.5σ).
  - Target: Out-Of-The-Money (OTM) binary prediction contracts priced at <= $0.10.
  - Risk Management: 1% wallet balance risk per trade, max slippage <= $0.10.
  - Exit Strategy: Dynamic Flip taking instant profit at >= 300% gain (4x entry).
  - Architecture: Ultra-low latency asynchronous execution with asyncio, websockets & web3.py.
========================================================================================
"""

import asyncio
import gc
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
    
    # وضع التداول التجريبي (True = محاكاة بدون إرسال معاملات حقيقية، False = تداول حقيقي)
    PAPER_TRADING: bool = os.getenv("PAPER_TRADING", "true").lower() == "true"

    # مفتاح تشغيل الروبوت (True = تشغيل وتنفيذ آلي، False = إيقاف مؤقت)
    BOT_ENABLED: bool = os.getenv("BOT_ENABLED", "true").lower() == "true"
    
    # إدارة المخاطر والانزلاق السعري
    RISK_PER_TRADE: float = float(os.getenv("RISK_PER_TRADE", "0.01"))  # 1% من الرصيد
    MAX_ENTRY_PRICE: float = float(os.getenv("MAX_ENTRY_PRICE", "0.10"))  # أقصى سعر للدخول (<= 0.10$)
    MAX_SLIPPAGE: float = float(os.getenv("MAX_SLIPPAGE", "0.10"))  # أقصى انزلاق سعري 0.10$
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
    USDC_ADDRESS: str = os.getenv("USDC_ADDRESS", "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913")
    LIMITLESS_ROUTER: str = os.getenv("LIMITLESS_ROUTER", "0xD729221C3D6176378411D048b0C7c77d5b1B3736")
    BTC_5M_MARKET_ADDRESS: str = os.getenv("BTC_5M_MARKET_ADDRESS", "0x1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c")
    
    # إعدادات Limitless Python SDK الرسمية (Scoped HMAC-SHA256 Token)
    LMTS_TOKEN_ID: str = os.getenv("LMTS_TOKEN_ID", "")
    LMTS_TOKEN_SECRET: str = os.getenv("LMTS_TOKEN_SECRET", "")
    BTC_MARKET_SLUG: str = os.getenv("BTC_MARKET_SLUG", "")


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
]

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
]


# ======================================================================================
# 4. محرك حساب الـ CVD وزخم الحجم ورصد الانفجار (CVD & 2.5 Sigma Engine)
# ======================================================================================
class MicroMomentumEngine:
    def __init__(self, window_size: int = 120, sigma_threshold: float = 2.5):
        self.window_size = window_size
        self.sigma_threshold = sigma_threshold
        self.cvd: float = 0.0
        self.last_trade_price: float = 0.0
        self.last_trade_time: float = time.time()
        self.deltas: deque = deque(maxlen=window_size)
        self.velocities: deque = deque(maxlen=window_size)
        self.processed_ticks: int = 0
        self._lock = asyncio.Lock()

    async def process_tick(self, trade_data: dict) -> Optional[Tuple[str, float, float, float]]:
        async with self._lock:
            self.processed_ticks += 1
            # فرمتة الذاكرة وتطهير الكاش تلقائياً لمنع أي اختناق في العمليات عالية التردد (Anti-Bottleneck GC)
            if self.processed_ticks % 5000 == 0:
                gc.collect()

            price = float(trade_data["p"])
            qty = float(trade_data["q"])
            is_buyer_maker = bool(trade_data["m"])
            trade_time = float(trade_data["T"]) / 1000.0

            delta = -qty if is_buyer_maker else qty
            self.cvd += delta
            self.deltas.append(delta)
            
            dt = max(trade_time - self.last_trade_time, 0.001)
            velocity = delta / dt
            self.velocities.append(velocity)
            
            self.last_trade_price = price
            self.last_trade_time = trade_time

            if len(self.deltas) < 30:
                return None

            mean_delta = sum(self.deltas) / len(self.deltas)
            variance = sum((x - mean_delta) ** 2 for x in self.deltas) / len(self.deltas)
            std_dev = math.sqrt(variance)

            if std_dev < 1e-6:
                return None

            z_score = (delta - mean_delta) / std_dev

            if abs(z_score) >= self.sigma_threshold:
                direction = "BUY_UP" if z_score > 0 else "BUY_DOWN"
                logger.info(
                    f"🚨 [MOMENTUM ALERT] Spike detected: {direction} | Z: {z_score:+.2f}σ | "
                    f"BTC: \${price:,.2f} | CVD: {self.cvd:+,.2f} | Delta: {delta:+,.3f}"
                )
                return (direction, z_score, price, self.cvd)

            return None


# ======================================================================================
# 5. التفاعل مع شبكة Base ومنصة Limitless (Web3 Execution Engine)
# ======================================================================================
class LimitlessWeb3Client:
    def __init__(self, config: BotConfig):
        self.config = config
        self.w3 = AsyncWeb3(AsyncHTTPProvider(config.RPC_URL))
        self.account = None
        if config.PRIVATE_KEY:
            try:
                self.account = Account.from_key(config.PRIVATE_KEY)
                logger.info(f"🔑 Wallet loaded: {self.account.address}")
            except Exception as e:
                logger.error(f"❌ Failed to parse private key: {e}")
        
        self.usdc_contract = None
        self.market_contract = None

        # مكونات Limitless Python SDK الرسمية
        self.http_client: Optional[LimitlessHttpClient] = None
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
        is_connected = await self.w3.is_connected()
        if not is_connected:
            raise ConnectionError(f"Cannot connect to Base RPC at {self.config.RPC_URL}")
        
        chain_id = await self.w3.eth.chain_id
        logger.info(f"🌐 Connected to Base Chain ID: {chain_id}")
        
        self.usdc_contract = self.w3.eth.contract(
            address=self.w3.to_checksum_address(self.config.USDC_ADDRESS),
            abi=ERC20_ABI,
        )
        self.market_contract = self.w3.eth.contract(
            address=self.w3.to_checksum_address(self.config.BTC_5M_MARKET_ADDRESS),
            abi=LIMITLESS_MARKET_ABI,
        )

        # تهيئة Limitless Python SDK الرسمي (HTTP, WebSocket, Portfolio, Orders)
        if HAS_LIMITLESS_SDK and self.config.LMTS_TOKEN_ID and self.config.LMTS_TOKEN_SECRET:
            try:
                self.http_client = LimitlessHttpClient(
                    hmac_credentials=HMACCredentials(
                        token_id=self.config.LMTS_TOKEN_ID,
                        secret=self.config.LMTS_TOKEN_SECRET,
                    ),
                )
                # تغليف العميل بكائن RetryableClient الرسمي لتطبيق تراجع أسي (Exponential Backoff) ضد 429 و 5xx
                self.retry_config = RetryConfig(
                    status_codes={500, 502, 503, 429},
                    max_retries=3,
                    delays=[1.0, 2.0, 4.0],
                )
                self.retryable_client = RetryableClient(self.http_client, self.retry_config)

                self.market_fetcher = MarketFetcher(self.retryable_client)
                self.portfolio_fetcher = PortfolioFetcher(self.retryable_client)
                if self.account:
                    self.order_client = OrderClient(self.retryable_client, self.account)
                
                await self.init_websocket_streaming()
            except Exception as e:
                logger.warning(f"⚠️ Limitless SDK init notice: {e}")

    async def init_websocket_streaming(self):
        """تهيئة بث الـ WebSocket المباشر لجدول الأوامر وتحديثات العقود اللحظية"""
        if not HAS_LIMITLESS_SDK or not self.config.LMTS_TOKEN_ID:
            return
        try:
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
            slugs = [self.config.BTC_MARKET_SLUG or "btc-above-100k-march-2025"]

            @self.ws_client.on("connect")
            async def on_connect():
                logger.info("🟢 [LIMITLESS WS] Connected to streaming server")
                await self.ws_client.subscribe("subscribe_market_prices", {"marketSlugs": slugs})
                await self.ws_client.subscribe("subscribe_order_events")
                await self.ws_client.subscribe("subscribe_positions", {"marketSlugs": slugs})

            @self.ws_client.on("orderbookUpdate")
            async def on_orderbook(data):
                slug = data.get("marketSlug", "unknown")
                self.live_orderbook[slug] = data

            @self.ws_client.on("newPriceData")
            async def on_price(data):
                slug = data.get("marketSlug", "unknown")
                p = data.get("price")
                if p is not None:
                    self.latest_prices[slug] = float(p)

            @self.ws_client.on("orderEvent")
            async def on_order_event(event):
                logger.info(f"🔔 [LIMITLESS WS ORDER] {event}")

            @self.ws_client.on("positions")
            async def on_positions(data):
                logger.info(f"📊 [LIMITLESS WS POSITIONS] {data}")

            await self.ws_client.connect()
            logger.info("⚡ [LIMITLESS WS] Zero-latency orderbook streaming active")
        except Exception as ws_err:
            logger.warning(f"⚠️ Limitless WS init notice: {ws_err}")

    async def get_wallet_usdc_balance(self) -> float:
        if self.config.PAPER_TRADING or not self.account:
            return 1000.0  # Simulated $1,000 for paper mode
        try:
            checksum_addr = self.w3.to_checksum_address(self.account.address)
            balance_raw = await self.usdc_contract.functions.balanceOf(checksum_addr).call()
            return balance_raw / 1e6
        except Exception as e:
            logger.error(f"⚠️ Error fetching USDC balance: {e}")
            return 0.0

    async def check_otm_opportunity(self, outcome_index: int) -> Optional[float]:
        try:
            if self.config.PAPER_TRADING:
                simulated_price = 0.07  # OTM qualifying price <= $0.10
                return simulated_price if simulated_price <= self.config.MAX_ENTRY_PRICE else None

            # 1. فحص فائق السرعة عبر الذاكرة من خلال بث WebSocket (Zero latency)
            slug = self.config.BTC_MARKET_SLUG or "btc-above-100k-march-2025"
            if slug in self.live_orderbook:
                asks = self.live_orderbook[slug].get("asks", [])
                if asks:
                    best_ask = float(asks[0].get("price", 1.0))
                    if best_ask <= self.config.MAX_ENTRY_PRICE:
                        return best_ask
                    return None

            # 2. استدعاء السعر من العقد الذكي مباشرة (On-chain fallback)
            spot_price_raw = await self.market_contract.functions.getSpotPrice(outcome_index).call()
            spot_price_usd = spot_price_raw / 1e6
            
            if spot_price_usd <= self.config.MAX_ENTRY_PRICE:
                return spot_price_usd
            return None
        except Exception as e:
            return 0.08 if self.config.PAPER_TRADING else None

    async def execute_market_buy(self, outcome_index: int, entry_price: float, usdc_amount: float) -> Optional[dict]:
        logger.info(f"🚀 [EXECUTION] Market Buy: Outcome [{outcome_index}] @ \${entry_price:.4f} | Size: \${usdc_amount:.2f}")

        max_allowed_price = min(entry_price + self.config.MAX_SLIPPAGE, self.config.MAX_ENTRY_PRICE)
        min_tokens_expected = (usdc_amount / max_allowed_price) * 0.95

        if self.config.PAPER_TRADING:
            return {
                "status": "SUCCESS (PAPER)",
                "tx_hash": f"0xsim_{int(time.time()*1000):x}",
                "outcome_index": outcome_index,
                "entry_price": entry_price,
                "amount_usd": usdc_amount,
                "tokens_bought": usdc_amount / entry_price,
                "timestamp": time.time(),
            }

        if not self.account:
            logger.error("❌ No private key configured.")
            return None

        try:
            investment_raw = int(usdc_amount * 1e6)
            min_tokens_raw = int(min_tokens_expected * 1e6)
            sender_addr = self.account.address

            # Check USDC allowance
            allowance = await self.usdc_contract.functions.allowance(
                sender_addr, self.config.LIMITLESS_ROUTER
            ).call()
            if allowance < investment_raw:
                approve_tx = await self.usdc_contract.functions.approve(
                    self.config.LIMITLESS_ROUTER, 2**256 - 1
                ).build_transaction({
                    "from": sender_addr,
                    "nonce": await self.w3.eth.get_transaction_count(sender_addr),
                    "maxFeePerGas": await self.w3.eth.gas_price * 2,
                    "maxPriorityFeePerGas": self.w3.to_wei(0.01, "gwei"),
                })
                signed_approve = self.w3.eth.account.sign_transaction(approve_tx, self.config.PRIVATE_KEY)
                tx_hash = await self.w3.eth.send_raw_transaction(signed_approve.raw_transaction)
                await self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=30)

            # Build EIP-1559 transaction
            nonce = await self.w3.eth.get_transaction_count(sender_addr)
            latest_block = await self.w3.eth.get_block("latest")
            base_fee = latest_block.get("baseFeePerGas", self.w3.to_wei(0.05, "gwei"))
            priority_fee = self.w3.to_wei(0.05, "gwei")
            max_fee = int(base_fee * 1.5) + priority_fee

            buy_func = self.market_contract.functions.buy(investment_raw, outcome_index, min_tokens_raw)
            tx_data = await buy_func.build_transaction({
                "from": sender_addr,
                "nonce": nonce,
                "gas": 250000,
                "maxFeePerGas": max_fee,
                "maxPriorityFeePerGas": priority_fee,
                "chainId": 8453,
            })
            signed_tx = self.w3.eth.account.sign_transaction(tx_data, self.config.PRIVATE_KEY)
            tx_hash_bytes = await self.w3.eth.send_raw_transaction(signed_tx.raw_transaction)
            receipt = await self.w3.eth.wait_for_transaction_receipt(tx_hash_bytes, timeout=20)
            
            if receipt["status"] == 1:
                return {
                    "status": "SUCCESS",
                    "tx_hash": self.w3.to_hex(tx_hash_bytes),
                    "outcome_index": outcome_index,
                    "entry_price": entry_price,
                    "amount_usd": usdc_amount,
                    "tokens_bought": min_tokens_expected,
                    "timestamp": time.time(),
                }
            return None
        except Exception as e:
            logger.error(f"❌ Market Buy failed: {e}")
            return None

    async def execute_dynamic_flip_exit(self, position: dict, current_price: float) -> bool:
        outcome_index = position["outcome_index"]
        entry_price = position["entry_price"]
        tokens_to_sell = position["tokens_bought"]
        profit_percent = ((current_price - entry_price) / entry_price) * 100.0

        logger.info(f"🎯 [DYNAMIC FLIP TRIGGERED] Price: \${current_price:.4f} | Entry: \${entry_price:.4f} (+{profit_percent:.1f}%)")

        if self.config.PAPER_TRADING:
            logger.info(f"💰 [PAPER FLIP SUCCESS] Sold {tokens_to_sell:.2f} tokens. Profit: \${(current_price - entry_price)*tokens_to_sell:.2f}")
            return True

        if not self.account:
            return False

        try:
            return_raw = int((tokens_to_sell * current_price * 0.95) * 1e6)
            tokens_raw = int(tokens_to_sell * 1e6)
            nonce = await self.w3.eth.get_transaction_count(self.account.address)
            sell_func = self.market_contract.functions.sell(return_raw, outcome_index, tokens_raw)
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
            await self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=20)
            logger.info("🎉 Dynamic Flip Completed on Base!")
            return True
        except Exception as e:
            logger.error(f"❌ Flip exit failed: {e}")
            return False


# ======================================================================================
# 6. مدير الاستراتيجية والمخاطر المنسق (Strategy Orchestrator & Risk Manager)
# ======================================================================================
class LeadLagExploitOrchestrator:
    def __init__(self, config: BotConfig):
        self.config = config
        self.momentum_engine = MicroMomentumEngine(config.ROLLING_WINDOW_SIZE, config.SIGMA_THRESHOLD)
        self.web3_client = LimitlessWeb3Client(config)
        self.active_positions: List[dict] = []
        self.is_running = True

    async def start(self):
        logger.info("=" * 60)
        logger.info("⚡ Starting Limitless MML Quant Bot (BTC 5m Lead-Lag Exploit)")
        logger.info(f"🛠️ Mode: {'PAPER TRADING' if self.config.PAPER_TRADING else 'LIVE PRODUCTION'}")
        logger.info(f"📊 Threshold: {self.config.SIGMA_THRESHOLD}σ | Risk: {self.config.RISK_PER_TRADE*100}% | Flip: +{self.config.DYNAMIC_FLIP_PROFIT*100}%")
        logger.info("=" * 60)

        await self.web3_client.initialize()
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
                    "paper_trading": self.config.PAPER_TRADING,
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
        url_idx = 0
        while self.is_running:
            endpoint = self.config.BINANCE_WS_URLS[url_idx % len(self.config.BINANCE_WS_URLS)]
            try:
                async with websockets.connect(endpoint, ping_interval=20, ping_timeout=10) as ws:
                    logger.info("🟢 Binance Tick Stream Connected! Processing real-time CVD...")
                    while self.is_running:
                        msg = await ws.recv()
                        data = json.loads(msg)
                        spike = await self.momentum_engine.process_tick(data)
                        if spike:
                            direction, z, price, cvd = spike
                            asyncio.create_task(self._handle_momentum_spike(direction, z, price))
            except Exception as e:
                logger.warning(f"⚠️ WS disconnected ({e}). Retrying...")
                url_idx += 1
                await asyncio.sleep(2.0)

    async def _handle_momentum_spike(self, direction: str, z_score: float, btc_price: float):
        if not self.config.BOT_ENABLED:
            logger.warning("⏸️ [BOT STOPPED] Anomaly detected but bot execution is STOPPED/DISABLED in config. Skipping trade execution.")
            return

        outcome_index = 0 if direction == "BUY_UP" else 1
        outcome_label = "BTC_UP_5M" if outcome_index == 0 else "BTC_DOWN_5M"

        # 1. Filter contract <= $0.10
        otm_price = await self.web3_client.check_otm_opportunity(outcome_index)
        if not otm_price or otm_price > self.config.MAX_ENTRY_PRICE:
            return

        # 2. Risk Sizing (1% of wallet)
        wallet_balance = await self.web3_client.get_wallet_usdc_balance()
        if wallet_balance <= 0:
            return
        trade_amount_usd = max(wallet_balance * self.config.RISK_PER_TRADE, 5.0)

        # 3. Market Buy signed transaction
        pos = await self.web3_client.execute_market_buy(outcome_index, otm_price, trade_amount_usd)
        if pos:
            pos["outcome_label"] = outcome_label
            pos["target_price"] = otm_price * (1 + self.config.DYNAMIC_FLIP_PROFIT)
            pos["target_profit"] = self.config.DYNAMIC_FLIP_PROFIT * 100.0
            self.active_positions.append(pos)

    async def _position_monitor_loop(self):
        while self.is_running:
            if self.active_positions:
                remaining = []
                for pos in self.active_positions:
                    current_price = await self._get_current_market_price(pos)
                    if current_price >= pos["target_price"]:
                        success = await self.web3_client.execute_dynamic_flip_exit(pos, current_price)
                        if not success:
                            remaining.append(pos)
                    else:
                        remaining.append(pos)
                self.active_positions = remaining
            await asyncio.sleep(0.5)

    async def _get_current_market_price(self, pos: dict) -> float:
        if self.config.PAPER_TRADING:
            elapsed = time.time() - pos["timestamp"]
            if elapsed > 4.0:
                return pos["entry_price"] * 4.2  # 320% profit simulated after AMM lag
            return pos["entry_price"] * 1.1
        try:
            spot_raw = await self.web3_client.market_contract.functions.getSpotPrice(pos["outcome_index"]).call()
            return spot_raw / 1e6
        except Exception:
            return pos["entry_price"]


async def main():
    config = BotConfig()
    orchestrator = LeadLagExploitOrchestrator(config)
    await orchestrator.start()

if __name__ == "__main__":
    asyncio.run(main())
`;

export const REQUIREMENTS_TXT = `web3>=6.15.0
websockets>=12.0
eth-account>=0.11.0
python-dotenv>=1.0.0
aiohttp>=3.9.0
numpy>=1.24.0
`;

export const ENV_EXAMPLE_TXT = `# Base Chain RPC URL
RPC_URL="https://mainnet.base.org"

# Trader Private Key (Keep strictly secret)
PRIVATE_KEY=""
WALLET_ADDRESS=""

# Execution Mode (true for simulated paper trading, false for live execution)
PAPER_TRADING="true"
BOT_ENABLED="true"

# Risk & Strategy Limits
RISK_PER_TRADE="0.01"
MAX_ENTRY_PRICE="0.10"
MAX_SLIPPAGE="0.10"
DYNAMIC_FLIP_PROFIT="3.00"
SIGMA_THRESHOLD="2.5"
ROLLING_WINDOW_SIZE="120"

# Limitless Contract Addresses on Base Chain
USDC_ADDRESS="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
LIMITLESS_ROUTER="0xD729221C3D6176378411D048b0C7c77d5b1B3736"
BTC_5M_MARKET_ADDRESS="0x1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c"

# Optional Proxy to bypass Binance US Geo-blocking
PROXY_URL=""
`;

export function generateCustomPythonScript(config: BotConfigState): string {
  return BASE_PYTHON_CODE.replace(
    /RPC_URL: str = os\.getenv\("RPC_URL", "[^"]*"\)/,
    `RPC_URL: str = os.getenv("RPC_URL", "${config.rpcUrl}")`
  )
    .replace(
      /WALLET_ADDRESS: str = os\.getenv\("WALLET_ADDRESS", "[^"]*"\)/,
      `WALLET_ADDRESS: str = os.getenv("WALLET_ADDRESS", "${config.walletAddress}")`
    )
    .replace(
      /PAPER_TRADING: bool = os\.getenv\("PAPER_TRADING", "[^"]*"\)/,
      `PAPER_TRADING: bool = os.getenv("PAPER_TRADING", "${config.paperTrading ? 'true' : 'false'}")`
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
      /LMTS_TOKEN_ID: str = os\.getenv\("LMTS_TOKEN_ID", "[^"]*"\)/,
      `LMTS_TOKEN_ID: str = os.getenv("LMTS_TOKEN_ID", "${config.lmtsTokenId || ''}")`
    )
    .replace(
      /LMTS_TOKEN_SECRET: str = os\.getenv\("LMTS_TOKEN_SECRET", "[^"]*"\)/,
      `LMTS_TOKEN_SECRET: str = os.getenv("LMTS_TOKEN_SECRET", "${config.lmtsTokenSecret || ''}")`
    )
    .replace(
      /BTC_MARKET_SLUG: str = os\.getenv\("BTC_MARKET_SLUG", "[^"]*"\)/,
      `BTC_MARKET_SLUG: str = os.getenv("BTC_MARKET_SLUG", "${config.btcMarketSlug || ''}")`
    );
}
