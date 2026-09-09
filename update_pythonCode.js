const fs = require('fs');
const pythonCode = fs.readFileSync('limitless_mml_bot.py', 'utf8');
let tsCode = fs.readFileSync('src/data/pythonCode.ts', 'utf8');

// The file src/data/pythonCode.ts has this structure:
// export const BASE_PYTHON_CODE = `...`;
// followed by the export function generateCustomPythonScript...

const newTsCode = `export const BASE_PYTHON_CODE = \`${pythonCode.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`;

export function generateCustomPythonScript(config: any): string {
  return BASE_PYTHON_CODE.replace(
    /RPC_URL: str = os\\.getenv\\("RPC_URL", "[^"]*"\\)/,
    \`RPC_URL: str = os.getenv("RPC_URL", "\${config.rpcUrl}")\`
  )
    .replace(
      /WALLET_ADDRESS: str = os\\.getenv\\("WALLET_ADDRESS", "[^"]*"\\)/,
      \`WALLET_ADDRESS: str = os.getenv("WALLET_ADDRESS", "\${config.walletAddress}")\`
    )
    .replace(
      /BOT_ENABLED: bool = os\\.getenv\\("BOT_ENABLED", "[^"]*"\\)/,
      \`BOT_ENABLED: bool = os.getenv("BOT_ENABLED", "\${config.isBotRunning ? 'true' : 'false'}")\`
    )
    .replace(
      /RISK_PER_TRADE: float = float\\(os\\.getenv\\("RISK_PER_TRADE", "[^"]*"\\)\\)/,
      \`RISK_PER_TRADE: float = float(os.getenv("RISK_PER_TRADE", "\${config.riskPerTrade}"))\`
    )
    .replace(
      /MAX_ENTRY_PRICE: float = float\\(os\\.getenv\\("MAX_ENTRY_PRICE", "[^"]*"\\)\\)/,
      \`MAX_ENTRY_PRICE: float = float(os.getenv("MAX_ENTRY_PRICE", "\${config.maxEntryPrice}"))\`
    )
    .replace(
      /MAX_SLIPPAGE: float = float\\(os\\.getenv\\("MAX_SLIPPAGE", "[^"]*"\\)\\)/,
      \`MAX_SLIPPAGE: float = float(os.getenv("MAX_SLIPPAGE", "\${config.maxSlippage}"))\`
    )
    .replace(
      /DYNAMIC_FLIP_PROFIT: float = float\\(os\\.getenv\\("DYNAMIC_FLIP_PROFIT", "[^"]*"\\)\\)/,
      \`DYNAMIC_FLIP_PROFIT: float = float(os.getenv("DYNAMIC_FLIP_PROFIT", "\${config.dynamicFlipProfit}"))\`
    )
    .replace(
      /SIGMA_THRESHOLD: float = float\\(os\\.getenv\\("SIGMA_THRESHOLD", "[^"]*"\\)\\)/,
      \`SIGMA_THRESHOLD: float = float(os.getenv("SIGMA_THRESHOLD", "\${config.sigmaThreshold}"))\`
    )
    .replace(
      /ROLLING_WINDOW_SIZE: int = int\\(os\\.getenv\\("ROLLING_WINDOW_SIZE", "[^"]*"\\)\\)/,
      \`ROLLING_WINDOW_SIZE: int = int(os.getenv("ROLLING_WINDOW_SIZE", "\${config.rollingWindowSize}"))\`
    );
}
`;
fs.writeFileSync('src/data/pythonCode.ts', newTsCode);
