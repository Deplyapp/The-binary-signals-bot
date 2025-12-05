import type { Asset } from "@shared/schema";
import { getAssetEmoji, getCategoryEmoji, EMOJIS } from "./emojis";

export const SUPPORTED_ASSETS: Asset[] = [
  { id: "frxEURUSD", name: "EUR / USD", emoji: "🇪🇺🇺🇸", category: "forex" },
  { id: "frxGBPUSD", name: "GBP / USD", emoji: "🇬🇧🇺🇸", category: "forex" },
  { id: "frxUSDJPY", name: "USD / JPY", emoji: "🇺🇸🇯🇵", category: "forex" },
  { id: "frxAUDUSD", name: "AUD / USD", emoji: "🇦🇺🇺🇸", category: "forex" },
  { id: "frxUSDCAD", name: "USD / CAD", emoji: "🇺🇸🇨🇦", category: "forex" },
  { id: "frxEURGBP", name: "EUR / GBP", emoji: "🇪🇺🇬🇧", category: "forex" },
  { id: "frxEURJPY", name: "EUR / JPY", emoji: "🇪🇺🇯🇵", category: "forex" },
  { id: "frxUSDCHF", name: "USD / CHF", emoji: "🇺🇸🇨🇭", category: "forex" },
  { id: "R_10", name: "Volatility 10", emoji: "🎰", category: "synthetic" },
  { id: "R_25", name: "Volatility 25", emoji: "🎰", category: "synthetic" },
  { id: "R_50", name: "Volatility 50", emoji: "🎰", category: "synthetic" },
  { id: "R_75", name: "Volatility 75", emoji: "🎰", category: "synthetic" },
  { id: "R_100", name: "Volatility 100", emoji: "🎰", category: "synthetic" },
  { id: "1HZ10V", name: "V10 (1s)", emoji: "⚡", category: "synthetic" },
  { id: "1HZ25V", name: "V25 (1s)", emoji: "⚡", category: "synthetic" },
  { id: "1HZ50V", name: "V50 (1s)", emoji: "⚡", category: "synthetic" },
  { id: "1HZ75V", name: "V75 (1s)", emoji: "⚡", category: "synthetic" },
  { id: "1HZ100V", name: "V100 (1s)", emoji: "⚡", category: "synthetic" },
  { id: "cryBTCUSD", name: "BTC / USD", emoji: "₿", category: "crypto" },
  { id: "cryETHUSD", name: "ETH / USD", emoji: "Ξ", category: "crypto" },
];

export const TIMEFRAMES = [
  { value: 60, label: "1m", emoji: "🕐" },
  { value: 120, label: "2m", emoji: "🕑" },
  { value: 300, label: "5m", emoji: "🕔" },
  { value: 900, label: "15m", emoji: "🕒" },
  { value: 1800, label: "30m", emoji: "🕧" },
  { value: 3600, label: "1h", emoji: "🕐" },
];

export function getAssetById(id: string): Asset | undefined {
  return SUPPORTED_ASSETS.find(asset => asset.id === id);
}

export function getTimeframeLabel(seconds: number): string {
  const tf = TIMEFRAMES.find(t => t.value === seconds);
  return tf?.label || `${seconds}s`;
}

export function getTimeframeEmoji(seconds: number): string {
  const tf = TIMEFRAMES.find(t => t.value === seconds);
  return tf?.emoji || "🕐";
}

export function getAssetDisplayName(asset: Asset): string {
  const emoji = asset.emoji || getAssetEmoji(asset.id);
  return `${emoji} ${asset.name}`;
}

export function getCategoryHeader(category: string): string {
  const emoji = getCategoryEmoji(category);
  const name = category.toUpperCase();
  return `${emoji} ${name}`;
}

export function getAssetsByCategory(category: string): Asset[] {
  return SUPPORTED_ASSETS.filter(a => a.category === category);
}

export function getAllCategories(): string[] {
  const categories = new Set<string>();
  SUPPORTED_ASSETS.forEach(a => {
    if (a.category) categories.add(a.category);
  });
  return Array.from(categories);
}
