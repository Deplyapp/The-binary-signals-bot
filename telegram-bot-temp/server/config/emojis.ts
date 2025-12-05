export const EMOJIS = {
  CALL: '📈',
  PUT: '📉',
  NO_TRADE: '⏸️',
  
  SIGNAL_UP: '🟢',
  SIGNAL_DOWN: '🔴',
  SIGNAL_NEUTRAL: '🟡',
  
  CONFIDENCE_HIGH: '💎',
  CONFIDENCE_MEDIUM: '⭐',
  CONFIDENCE_LOW: '🎯',
  
  VOLATILITY_HIGH: '🔥',
  VOLATILITY_WARNING: '⚠️',
  VOLATILITY_SAFE: '✅',
  
  CHART: '📊',
  CANDLE: '🕯️',
  TREND_UP: '📈',
  TREND_DOWN: '📉',
  
  CLOCK: '🕐',
  TIMEZONE: '🌍',
  CALENDAR: '📅',
  
  START: '🚀',
  STOP: '🛑',
  REFRESH: '🔄',
  SETTINGS: '⚙️',
  
  FOREX: '💱',
  CRYPTO: '🪙',
  SYNTHETIC: '🎰',
  
  SUCCESS: '✅',
  ERROR: '❌',
  WARNING: '⚠️',
  INFO: 'ℹ️',
  
  MONEY: '💰',
  FIRE: '🔥',
  ROCKET: '🚀',
  STAR: '⭐',
  DIAMOND: '💎',
  TARGET: '🎯',
  CROWN: '👑',
  LIGHTNING: '⚡',
  
  PAIR_EUR_USD: '🇪🇺/🇺🇸',
  PAIR_GBP_USD: '🇬🇧/🇺🇸',
  PAIR_USD_JPY: '🇺🇸/🇯🇵',
  PAIR_AUD_USD: '🇦🇺/🇺🇸',
  PAIR_USD_CHF: '🇺🇸/🇨🇭',
  PAIR_USD_CAD: '🇺🇸/🇨🇦',
  PAIR_EUR_GBP: '🇪🇺/🇬🇧',
  PAIR_EUR_JPY: '🇪🇺/🇯🇵',
  
  BITCOIN: '₿',
  ETHEREUM: 'Ξ',
} as const;

export const ASSET_EMOJIS: Record<string, string> = {
  'frxEURUSD': '🇪🇺🇺🇸',
  'frxGBPUSD': '🇬🇧🇺🇸',
  'frxUSDJPY': '🇺🇸🇯🇵',
  'frxAUDUSD': '🇦🇺🇺🇸',
  'frxUSDCAD': '🇺🇸🇨🇦',
  'frxEURGBP': '🇪🇺🇬🇧',
  'frxEURJPY': '🇪🇺🇯🇵',
  'frxUSDCHF': '🇺🇸🇨🇭',
  'R_10': '🎰',
  'R_25': '🎰',
  'R_50': '🎰',
  'R_75': '🎰',
  'R_100': '🎰',
  '1HZ10V': '⚡',
  '1HZ25V': '⚡',
  '1HZ50V': '⚡',
  '1HZ75V': '⚡',
  '1HZ100V': '⚡',
  'cryBTCUSD': '₿',
  'cryETHUSD': 'Ξ',
};

export function getAssetEmoji(assetId: string): string {
  return ASSET_EMOJIS[assetId] || '📊';
}

export function getDirectionEmoji(direction: 'CALL' | 'PUT' | 'NO_TRADE'): string {
  switch (direction) {
    case 'CALL':
      return EMOJIS.CALL;
    case 'PUT':
      return EMOJIS.PUT;
    case 'NO_TRADE':
      return EMOJIS.NO_TRADE;
  }
}

export function getConfidenceEmoji(confidence: number): string {
  if (confidence >= 95) return EMOJIS.DIAMOND;
  if (confidence >= 90) return EMOJIS.STAR;
  if (confidence >= 80) return EMOJIS.TARGET;
  return EMOJIS.INFO;
}

export function getVolatilityEmoji(isVolatile: boolean, severity?: 'low' | 'medium' | 'high'): string {
  if (!isVolatile) return EMOJIS.VOLATILITY_SAFE;
  if (severity === 'high') return EMOJIS.FIRE;
  if (severity === 'medium') return EMOJIS.VOLATILITY_WARNING;
  return EMOJIS.WARNING;
}

export function getCategoryEmoji(category: string): string {
  switch (category) {
    case 'forex':
      return EMOJIS.FOREX;
    case 'crypto':
      return EMOJIS.CRYPTO;
    case 'synthetic':
      return EMOJIS.SYNTHETIC;
    default:
      return EMOJIS.CHART;
  }
}
