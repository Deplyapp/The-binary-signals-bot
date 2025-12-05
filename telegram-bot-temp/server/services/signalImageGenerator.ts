import { createCanvas, CanvasRenderingContext2D as NodeCanvasRenderingContext2D } from "canvas";
import { createLogger } from "../utils/logger";

const logger = createLogger("SignalImageGenerator");

const IMAGE_WIDTH = 800;
const IMAGE_HEIGHT = 280;

interface SignalImageConfig {
  direction: "CALL" | "PUT" | "NO_TRADE" | "WARNING";
  symbol: string;
  confidence: number;
  timeframe: string;
  suggestedDirection?: "CALL" | "PUT";
  isLowConfidence?: boolean;
  isWarning?: boolean;
}

const COLORS = {
  CALL: {
    primary: "#10B981",
    secondary: "#059669",
    gradient: ["#10B981", "#047857"],
    text: "#FFFFFF",
    arrow: "#FFFFFF"
  },
  PUT: {
    primary: "#EF4444",
    secondary: "#DC2626",
    gradient: ["#EF4444", "#B91C1C"],
    text: "#FFFFFF",
    arrow: "#FFFFFF"
  },
  NO_TRADE: {
    primary: "#F59E0B",
    secondary: "#D97706",
    gradient: ["#F59E0B", "#B45309"],
    text: "#FFFFFF",
    arrow: "#FFFFFF"
  },
  WARNING: {
    primary: "#DC2626",
    secondary: "#991B1B",
    gradient: ["#DC2626", "#7F1D1D"],
    text: "#FFFFFF",
    arrow: "#FFFFFF"
  }
};

function drawRoundedRect(
  ctx: NodeCanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawCallArrow(ctx: NodeCanvasRenderingContext2D, centerX: number, centerY: number, size: number): void {
  ctx.fillStyle = COLORS.CALL.arrow;
  ctx.strokeStyle = COLORS.CALL.arrow;
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  
  ctx.beginPath();
  ctx.moveTo(centerX, centerY - size);
  ctx.lineTo(centerX - size * 0.6, centerY + size * 0.2);
  ctx.lineTo(centerX - size * 0.25, centerY + size * 0.2);
  ctx.lineTo(centerX - size * 0.25, centerY + size);
  ctx.lineTo(centerX + size * 0.25, centerY + size);
  ctx.lineTo(centerX + size * 0.25, centerY + size * 0.2);
  ctx.lineTo(centerX + size * 0.6, centerY + size * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawPutArrow(ctx: NodeCanvasRenderingContext2D, centerX: number, centerY: number, size: number): void {
  ctx.fillStyle = COLORS.PUT.arrow;
  ctx.strokeStyle = COLORS.PUT.arrow;
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  
  ctx.beginPath();
  ctx.moveTo(centerX, centerY + size);
  ctx.lineTo(centerX - size * 0.6, centerY - size * 0.2);
  ctx.lineTo(centerX - size * 0.25, centerY - size * 0.2);
  ctx.lineTo(centerX - size * 0.25, centerY - size);
  ctx.lineTo(centerX + size * 0.25, centerY - size);
  ctx.lineTo(centerX + size * 0.25, centerY - size * 0.2);
  ctx.lineTo(centerX + size * 0.6, centerY - size * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawPauseIcon(ctx: NodeCanvasRenderingContext2D, centerX: number, centerY: number, size: number): void {
  ctx.fillStyle = COLORS.NO_TRADE.arrow;
  ctx.strokeStyle = COLORS.NO_TRADE.arrow;
  ctx.lineWidth = 4;
  
  const barWidth = size * 0.3;
  const barHeight = size * 1.4;
  const gap = size * 0.35;
  
  drawRoundedRect(ctx, centerX - gap - barWidth, centerY - barHeight / 2, barWidth, barHeight, 8);
  ctx.fill();
  ctx.stroke();
  
  drawRoundedRect(ctx, centerX + gap, centerY - barHeight / 2, barWidth, barHeight, 8);
  ctx.fill();
  ctx.stroke();
}

function drawWarningIcon(ctx: NodeCanvasRenderingContext2D, centerX: number, centerY: number, size: number): void {
  ctx.fillStyle = COLORS.WARNING.arrow;
  ctx.strokeStyle = COLORS.WARNING.arrow;
  ctx.lineWidth = 4;
  
  ctx.beginPath();
  ctx.moveTo(centerX, centerY - size);
  ctx.lineTo(centerX + size * 0.9, centerY + size * 0.7);
  ctx.lineTo(centerX - size * 0.9, centerY + size * 0.7);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  
  ctx.fillStyle = COLORS.WARNING.gradient[0];
  ctx.font = `bold ${size}px Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("!", centerX, centerY + size * 0.1);
}

export function generateSignalImage(config: SignalImageConfig): Buffer {
  const isNoTradeWithSuggestion = config.direction === "NO_TRADE" && config.suggestedDirection && config.isLowConfidence;
  const isWarningSignal = config.direction === "WARNING" || config.isWarning;
  const imageHeight = isNoTradeWithSuggestion ? 380 : IMAGE_HEIGHT;
  
  const canvas = createCanvas(IMAGE_WIDTH, imageHeight);
  const ctx = canvas.getContext("2d");
  
  const colorKey = isWarningSignal ? "WARNING" : config.direction === "WARNING" ? "WARNING" : config.direction;
  const colors = COLORS[colorKey as keyof typeof COLORS] || COLORS.NO_TRADE;
  
  const gradient = ctx.createLinearGradient(0, 0, IMAGE_WIDTH, imageHeight);
  gradient.addColorStop(0, colors.gradient[0]);
  gradient.addColorStop(1, colors.gradient[1]);
  
  drawRoundedRect(ctx, 0, 0, IMAGE_WIDTH, imageHeight, 24);
  ctx.fillStyle = gradient;
  ctx.fill();
  
  ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 10;
  
  const iconCenterX = 120;
  const iconCenterY = isNoTradeWithSuggestion ? 120 : IMAGE_HEIGHT / 2;
  const iconSize = 60;
  
  ctx.shadowBlur = 16;
  ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
  
  if (config.direction === "CALL") {
    drawCallArrow(ctx, iconCenterX, iconCenterY, iconSize);
  } else if (config.direction === "PUT") {
    drawPutArrow(ctx, iconCenterX, iconCenterY, iconSize);
  } else if (isWarningSignal) {
    drawWarningIcon(ctx, iconCenterX, iconCenterY, iconSize);
  } else {
    drawPauseIcon(ctx, iconCenterX, iconCenterY, iconSize);
  }
  
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  
  ctx.fillStyle = colors.text;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  
  let directionText: string;
  let directionFontSize = 72;
  let directionX = 220;
  
  if (isWarningSignal) {
    directionText = "WARNING";
    directionFontSize = 64;
  } else if (config.direction === "NO_TRADE") {
    directionText = "NO TRADE";
    directionFontSize = 58;
  } else {
    directionText = config.direction;
  }
  
  ctx.font = `bold ${directionFontSize}px Arial, sans-serif`;
  
  const directionTextWidth = ctx.measureText(directionText).width;
  const maxTextWidth = 340;
  
  if (directionTextWidth > maxTextWidth) {
    directionFontSize = Math.floor(directionFontSize * (maxTextWidth / directionTextWidth));
    ctx.font = `bold ${directionFontSize}px Arial, sans-serif`;
  }
  
  ctx.fillText(directionText, directionX, iconCenterY - 25);
  
  ctx.font = "32px Arial, sans-serif";
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.fillText(`${config.symbol}`, directionX, iconCenterY + 40);
  
  ctx.font = "22px Arial, sans-serif";
  ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
  ctx.textAlign = "left";
  ctx.fillText(config.timeframe, directionX, iconCenterY + 75);
  
  const confidenceX = IMAGE_WIDTH - 50;
  const confidenceText = `${config.confidence}%`;
  ctx.font = "bold 52px Arial, sans-serif";
  ctx.textAlign = "right";
  ctx.fillStyle = colors.text;
  ctx.fillText(confidenceText, confidenceX, iconCenterY - 15);
  
  ctx.font = "18px Arial, sans-serif";
  ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
  ctx.fillText("Confidence", confidenceX, iconCenterY + 20);
  
  ctx.font = "16px Arial, sans-serif";
  ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
  ctx.fillText(config.timeframe, confidenceX, iconCenterY + 45);
  
  if (isNoTradeWithSuggestion && config.suggestedDirection) {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(40, 230);
    ctx.lineTo(IMAGE_WIDTH - 40, 230);
    ctx.stroke();
    
    const suggestionColor = config.suggestedDirection === "CALL" ? "#10B981" : "#EF4444";
    const suggestionArrow = config.suggestedDirection === "CALL" ? "↑" : "↓";
    
    ctx.font = "bold 28px Arial, sans-serif";
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    ctx.fillText("Bot Thinking:", 40, 280);
    
    ctx.fillStyle = suggestionColor;
    ctx.font = "bold 40px Arial, sans-serif";
    ctx.fillText(`${suggestionArrow} ${config.suggestedDirection}`, 260, 280);
    
    ctx.font = "bold 22px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText("⚠ AT YOUR OWN RISK ⚠", IMAGE_WIDTH / 2, 340);
  }
  
  if (isWarningSignal && !isNoTradeWithSuggestion) {
    ctx.font = "bold 24px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText("EXTREME LOW CONFIDENCE - DO NOT TRADE", IMAGE_WIDTH / 2, imageHeight - 30);
  }
  
  return canvas.toBuffer("image/png");
}

export function generateWarningImage(type: "pre_session" | "in_session", symbol: string): Buffer {
  const canvas = createCanvas(IMAGE_WIDTH, 180);
  const ctx = canvas.getContext("2d");
  
  const gradient = ctx.createLinearGradient(0, 0, IMAGE_WIDTH, 180);
  if (type === "pre_session") {
    gradient.addColorStop(0, "#F59E0B");
    gradient.addColorStop(1, "#D97706");
  } else {
    gradient.addColorStop(0, "#EF4444");
    gradient.addColorStop(1, "#DC2626");
  }
  
  drawRoundedRect(ctx, 0, 0, IMAGE_WIDTH, 180, 20);
  ctx.fillStyle = gradient;
  ctx.fill();
  
  ctx.font = "56px Arial, sans-serif";
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  
  const warningSymbol = type === "pre_session" ? "⚠" : "⚠⚠";
  ctx.fillText(warningSymbol, 70, 90);
  
  ctx.font = "bold 36px Arial, sans-serif";
  ctx.textAlign = "left";
  const title = type === "pre_session" 
    ? "VOLATILITY WARNING" 
    : "MARKET UNSTABLE";
  ctx.fillText(title, 130, 70);
  
  ctx.font = "26px Arial, sans-serif";
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  const message = type === "pre_session"
    ? `${symbol} is currently volatile. Consider alternatives.`
    : `${symbol} has become unstable. Exercise caution.`;
  ctx.fillText(message, 130, 115);
  
  return canvas.toBuffer("image/png");
}

export function generateLowConfidenceWarningImage(symbol: string, confidence: number, suggestedDirection?: "CALL" | "PUT"): Buffer {
  const canvas = createCanvas(IMAGE_WIDTH, 280);
  const ctx = canvas.getContext("2d");
  
  const gradient = ctx.createLinearGradient(0, 0, IMAGE_WIDTH, 280);
  gradient.addColorStop(0, "#DC2626");
  gradient.addColorStop(1, "#7F1D1D");
  
  drawRoundedRect(ctx, 0, 0, IMAGE_WIDTH, 280, 24);
  ctx.fillStyle = gradient;
  ctx.fill();
  
  ctx.font = "72px Arial, sans-serif";
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("⚠", 100, 100);
  
  ctx.font = "bold 48px Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("WARNING", 180, 70);
  
  ctx.font = "28px Arial, sans-serif";
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.fillText(`${symbol}`, 180, 120);
  
  ctx.font = "bold 44px Arial, sans-serif";
  ctx.textAlign = "right";
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText(`${confidence}%`, IMAGE_WIDTH - 50, 80);
  
  ctx.font = "18px Arial, sans-serif";
  ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
  ctx.fillText("Confidence", IMAGE_WIDTH - 50, 115);
  
  ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(40, 170);
  ctx.lineTo(IMAGE_WIDTH - 40, 170);
  ctx.stroke();
  
  ctx.font = "bold 26px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText("EXTREME LOW CONFIDENCE - AVOID TRADING", IMAGE_WIDTH / 2, 210);
  
  if (suggestedDirection) {
    const suggestionColor = suggestedDirection === "CALL" ? "#10B981" : "#EF4444";
    const suggestionArrow = suggestedDirection === "CALL" ? "↑" : "↓";
    ctx.font = "20px Arial, sans-serif";
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    ctx.fillText(`Bot leaning: `, IMAGE_WIDTH / 2 - 60, 250);
    ctx.fillStyle = suggestionColor;
    ctx.fillText(`${suggestionArrow} ${suggestedDirection}`, IMAGE_WIDTH / 2 + 40, 250);
  }
  
  return canvas.toBuffer("image/png");
}

export function generateBestPairImage(pairs: Array<{ symbol: string; stability: number; trend: string }>): Buffer {
  const height = 220 + pairs.length * 70;
  const canvas = createCanvas(IMAGE_WIDTH, height);
  const ctx = canvas.getContext("2d");
  
  const gradient = ctx.createLinearGradient(0, 0, IMAGE_WIDTH, height);
  gradient.addColorStop(0, "#3B82F6");
  gradient.addColorStop(1, "#1D4ED8");
  
  drawRoundedRect(ctx, 0, 0, IMAGE_WIDTH, height, 24);
  ctx.fillStyle = gradient;
  ctx.fill();
  
  ctx.font = "bold 44px Arial, sans-serif";
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("BEST PAIRS", IMAGE_WIDTH / 2, 60);
  
  ctx.font = "24px Arial, sans-serif";
  ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
  ctx.fillText("Real-time stability analysis", IMAGE_WIDTH / 2, 110);
  
  ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(40, 150);
  ctx.lineTo(IMAGE_WIDTH - 40, 150);
  ctx.stroke();
  
  pairs.forEach((pair, index) => {
    const y = 200 + index * 70;
    
    ctx.font = "bold 30px Arial, sans-serif";
    ctx.textAlign = "left";
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(`${index + 1}. ${pair.symbol}`, 50, y);
    
    const trendColor = pair.trend === "UP" ? "#10B981" : 
                       pair.trend === "DOWN" ? "#EF4444" : "#F59E0B";
    ctx.fillStyle = trendColor;
    ctx.font = "24px Arial, sans-serif";
    ctx.fillText(pair.trend, 400, y);
    
    const stabilityWidth = 180;
    const stabilityHeight = 18;
    const stabilityX = IMAGE_WIDTH - 220;
    const stabilityY = y - 9;
    
    ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
    drawRoundedRect(ctx, stabilityX, stabilityY, stabilityWidth, stabilityHeight, 9);
    ctx.fill();
    
    const filledWidth = (pair.stability / 100) * stabilityWidth;
    const stabilityGradient = ctx.createLinearGradient(stabilityX, stabilityY, stabilityX + filledWidth, stabilityY);
    if (pair.stability >= 70) {
      stabilityGradient.addColorStop(0, "#10B981");
      stabilityGradient.addColorStop(1, "#059669");
    } else if (pair.stability >= 40) {
      stabilityGradient.addColorStop(0, "#F59E0B");
      stabilityGradient.addColorStop(1, "#D97706");
    } else {
      stabilityGradient.addColorStop(0, "#EF4444");
      stabilityGradient.addColorStop(1, "#DC2626");
    }
    
    ctx.fillStyle = stabilityGradient;
    drawRoundedRect(ctx, stabilityX, stabilityY, filledWidth, stabilityHeight, 9);
    ctx.fill();
  });
  
  return canvas.toBuffer("image/png");
}

export function generateWinLossImage(wins: number, losses: number, winRate: number): Buffer {
  const canvas = createCanvas(IMAGE_WIDTH, 200);
  const ctx = canvas.getContext("2d");
  
  const gradient = ctx.createLinearGradient(0, 0, IMAGE_WIDTH, 200);
  gradient.addColorStop(0, "#1F2937");
  gradient.addColorStop(1, "#111827");
  
  drawRoundedRect(ctx, 0, 0, IMAGE_WIDTH, 200, 20);
  ctx.fillStyle = gradient;
  ctx.fill();
  
  ctx.strokeStyle = "#374151";
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, 0, 0, IMAGE_WIDTH, 200, 20);
  ctx.stroke();
  
  ctx.font = "bold 26px Arial, sans-serif";
  ctx.fillStyle = "#9CA3AF";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText("SESSION STATS", IMAGE_WIDTH / 2, 20);
  
  const sectionWidth = IMAGE_WIDTH / 3;
  
  ctx.font = "bold 56px Arial, sans-serif";
  ctx.fillStyle = "#10B981";
  ctx.fillText(wins.toString(), sectionWidth / 2, 75);
  ctx.font = "22px Arial, sans-serif";
  ctx.fillStyle = "#6B7280";
  ctx.fillText("WINS", sectionWidth / 2, 140);
  
  ctx.font = "bold 56px Arial, sans-serif";
  ctx.fillStyle = "#EF4444";
  ctx.fillText(losses.toString(), sectionWidth + sectionWidth / 2, 75);
  ctx.font = "22px Arial, sans-serif";
  ctx.fillStyle = "#6B7280";
  ctx.fillText("LOSSES", sectionWidth + sectionWidth / 2, 140);
  
  ctx.font = "bold 56px Arial, sans-serif";
  ctx.fillStyle = winRate >= 60 ? "#10B981" : winRate >= 40 ? "#F59E0B" : "#EF4444";
  ctx.fillText(`${winRate.toFixed(0)}%`, sectionWidth * 2 + sectionWidth / 2, 75);
  ctx.font = "22px Arial, sans-serif";
  ctx.fillStyle = "#6B7280";
  ctx.fillText("WIN RATE", sectionWidth * 2 + sectionWidth / 2, 140);
  
  return canvas.toBuffer("image/png");
}

logger.info("Signal image generator initialized with enhanced dimensions and warning support");
