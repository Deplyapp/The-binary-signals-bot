import TelegramBot from "node-telegram-bot-api";
import { sessionManager } from "../services/sessionManager";
import { SUPPORTED_ASSETS, getAssetById, getTimeframeLabel, getAssetDisplayName } from "../config/assets";
import { storage } from "../storage";
import { createLogger } from "../utils/logger";
import { formatTimestampWithTimezone, formatTimeOnlyWithTimezone, formatDuration, nowEpoch } from "../utils/time";
import { EMOJIS, getDirectionEmoji, getConfidenceEmoji, getVolatilityEmoji, getAssetEmoji } from "../config/emojis";
import type { SignalResult, Session, ConfidenceFilter, UserPreferences, MarketVolatility, SessionStats, InsertVolatilityData } from "@shared/schema";
import { TIMEZONES } from "@shared/schema";
import { 
  generateSignalImage, 
  generateWarningImage, 
  generateBestPairImage,
  generateWinLossImage,
  generateLowConfidenceWarningImage
} from "../services/signalImageGenerator";
import {
  createStartKeyboard,
  createAssetKeyboard,
  createTimeframeKeyboard,
  createTimezoneKeyboard,
  createConfidenceFilterKeyboard,
  createSettingsKeyboard,
  createConfirmSessionKeyboard,
  createSessionControlKeyboard,
  createSignalActionKeyboard,
  createStoppedSessionKeyboard,
  createVolatilityWarningKeyboard,
  createChartViewKeyboard,
  createTermsKeyboard,
} from "./keyboards";

const logger = createLogger("TelegramHandlers");

interface UserState {
  selectedAsset?: string;
  selectedTimeframe?: number;
  activeSessionId?: string;
  preferences: UserPreferences;
  pendingSetup?: {
    assetId: string;
    timeframe: number;
  };
}

const userStates: Map<number, UserState> = new Map();
let renderService: { renderChart: (data: unknown) => Promise<Buffer> } | null = null;
let marketVolatilityCache: Map<string, MarketVolatility> = new Map();

interface PendingSignal {
  signal: SignalResult;
  entryPrice: number;
  expiryTime: number;
  chatId: number;
  sessionId: string;
}
const pendingSignals: Map<string, PendingSignal> = new Map();
const sessionStatsCache: Map<string, SessionStats> = new Map();

export function getSessionStats(sessionId: string): SessionStats {
  if (!sessionStatsCache.has(sessionId)) {
    sessionStatsCache.set(sessionId, {
      wins: 0,
      losses: 0,
      winRate: 0,
      totalSignals: 0
    });
  }
  return sessionStatsCache.get(sessionId)!;
}

export function updateSessionStats(sessionId: string, outcome: 'WIN' | 'LOSS'): SessionStats {
  const stats = getSessionStats(sessionId);
  stats.totalSignals++;
  if (outcome === 'WIN') {
    stats.wins++;
  } else {
    stats.losses++;
  }
  stats.winRate = stats.totalSignals > 0 ? (stats.wins / stats.totalSignals) * 100 : 0;
  sessionStatsCache.set(sessionId, stats);
  return stats;
}

export function addPendingSignal(signalKey: string, pending: PendingSignal): void {
  pendingSignals.set(signalKey, pending);
}

export function getPendingSignal(signalKey: string): PendingSignal | undefined {
  return pendingSignals.get(signalKey);
}

export function removePendingSignal(signalKey: string): void {
  pendingSignals.delete(signalKey);
}

export function getAllPendingSignals(): Map<string, PendingSignal> {
  return pendingSignals;
}

export function setRenderService(service: { renderChart: (data: unknown) => Promise<Buffer> }): void {
  renderService = service;
}


export function updateMarketVolatility(volatility: MarketVolatility): void {
  marketVolatilityCache.set(volatility.symbol, volatility);
}

export function getMarketVolatility(symbol: string): MarketVolatility | undefined {
  return marketVolatilityCache.get(symbol);
}

export function getStablePairs(): string[] {
  const stablePairs: string[] = [];
  for (const [symbol, vol] of marketVolatilityCache) {
    if (vol.isStable) {
      stablePairs.push(symbol);
    }
  }
  return stablePairs.slice(0, 4);
}

function getUserState(chatId: number): UserState {
  if (!userStates.has(chatId)) {
    userStates.set(chatId, {
      preferences: {
        timezone: 'UTC',
        confidenceFilter: 80
      }
    });
  }
  return userStates.get(chatId)!;
}

async function ensureUserExists(chatId: number, msg: TelegramBot.Message): Promise<boolean> {
  try {
    let user = await storage.getTelegramUser(chatId);
    
    if (!user) {
      try {
        user = await storage.createTelegramUser({
          chatId,
          username: msg.from?.username || null,
          firstName: msg.from?.first_name || null,
          lastName: msg.from?.last_name || null,
          termsAccepted: false,
          termsAcceptedAt: null,
          preferences: null,
        });
        logger.info(`Created new user for chatId: ${chatId}`);
      } catch (createError: unknown) {
        const error = createError as { code?: string };
        if (error.code === '23505') {
          user = await storage.getTelegramUser(chatId);
          if (!user) {
            throw createError;
          }
        } else {
          throw createError;
        }
      }
    } else {
      await storage.updateTelegramUser(chatId, {
        username: msg.from?.username || user.username,
        firstName: msg.from?.first_name || user.firstName,
        lastName: msg.from?.last_name || user.lastName,
      });
    }
    
    return user.termsAccepted;
  } catch (error) {
    logger.error(`Failed to ensure user exists: ${chatId}`, error);
    return false;
  }
}

async function showTermsAcceptance(bot: TelegramBot, chatId: number): Promise<void> {
  const termsText = `${EMOJIS.INFO} *Terms & Conditions*\n\n` +
    `Before using this bot, please read and accept the following terms:\n\n` +
    `${EMOJIS.WARNING} *Risk Disclaimer:*\n` +
    `Trading binary options involves substantial risk and may not be suitable for all investors. ` +
    `Past performance is not indicative of future results.\n\n` +
    `${EMOJIS.CHART} *Signal Disclaimer:*\n` +
    `Signals provided by this bot are for informational purposes only. ` +
    `They do not constitute financial advice. You are solely responsible for your trading decisions.\n\n` +
    `${EMOJIS.SUCCESS} *By accepting, you agree that:*\n` +
    `- You understand the risks involved in trading\n` +
    `- Signals are algorithmic predictions, not guarantees\n` +
    `- You will not hold the bot or its developer liable for any losses\n` +
    `- You are of legal age to trade in your jurisdiction\n\n` +
    `_Made by Kaif_`;

  await bot.sendMessage(chatId, termsText, {
    parse_mode: "Markdown",
    reply_markup: createTermsKeyboard(),
  });
}

export async function handleStart(bot: TelegramBot, msg: TelegramBot.Message): Promise<void> {
  const chatId = msg.chat.id;
  
  const hasAcceptedTerms = await ensureUserExists(chatId, msg);
  
  if (!hasAcceptedTerms) {
    await showTermsAcceptance(bot, chatId);
    return;
  }
  
  const existingSessions = sessionManager.getSessionsByChatId(chatId);
  if (existingSessions.length > 0) {
    const state = getUserState(chatId);
    const tzEmoji = TIMEZONES.find(t => t.id === state.preferences.timezone)?.emoji || '🌍';
    
    let sessionsList = `${EMOJIS.INFO} *Active Sessions (${existingSessions.length})*\n\n`;
    
    const inlineKeyboard: Array<Array<{text: string, callback_data: string}>> = [];
    
    for (let i = 0; i < existingSessions.length; i++) {
      const session = existingSessions[i];
      const asset = getAssetById(session.symbol);
      const tfLabel = getTimeframeLabel(session.timeframe);
      sessionsList += `${i + 1}. ${getAssetEmoji(session.symbol)} *${asset?.name || session.symbol}* - ${tfLabel}\n`;
      
      inlineKeyboard.push([
        { text: `${EMOJIS.INFO} View #${i + 1}`, callback_data: `view:${session.id}` },
        { text: `${EMOJIS.STOP} Stop #${i + 1}`, callback_data: `stop:${session.id}` }
      ]);
    }
    
    sessionsList += `\n${tzEmoji} Timezone: *${state.preferences.timezone}*\n`;
    sessionsList += `${getConfidenceEmoji(state.preferences.confidenceFilter)} Filter: *${state.preferences.confidenceFilter}%+*\n\n`;
    sessionsList += `What would you like to do?`;
    
    inlineKeyboard.push([{ text: `${EMOJIS.ROCKET} Start New Session`, callback_data: "begin" }]);
    
    await bot.sendMessage(
      chatId,
      sessionsList,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: inlineKeyboard
        }
      }
    );
    return;
  }
  
  await bot.sendMessage(
    chatId,
    `${EMOJIS.ROCKET} *Welcome to Trading Signal Bot*\n\n` +
    `${EMOJIS.CHART} Receive algorithmic trading signals powered by *35+ technical indicators* and candlestick pattern analysis.\n\n` +
    `${EMOJIS.DIAMOND} Features:\n` +
    `${EMOJIS.SUCCESS} Real-time market monitoring\n` +
    `${EMOJIS.SUCCESS} Smart volatility detection\n` +
    `${EMOJIS.SUCCESS} Confidence-based filtering\n` +
    `${EMOJIS.SUCCESS} Multiple timezone support\n\n` +
    `_Made by Kaif_\n\n` +
    `Tap the button below to begin ${EMOJIS.LIGHTNING}`,
    {
      parse_mode: "Markdown",
      reply_markup: createStartKeyboard()
    }
  );
}

export async function handleCallback(bot: TelegramBot, query: TelegramBot.CallbackQuery): Promise<void> {
  const chatId = query.message?.chat.id;
  const messageId = query.message?.message_id;
  const data = query.data;
  
  if (!chatId || !messageId || !data) {
    await bot.answerCallbackQuery(query.id);
    return;
  }
  
  const state = getUserState(chatId);
  
  try {
    if (data === "accept_terms") {
      await handleAcceptTerms(bot, chatId, messageId);
    } else if (data === "decline_terms") {
      await handleDeclineTerms(bot, chatId, messageId);
    } else if (data === "begin") {
      await handleBegin(bot, chatId, messageId);
    } else if (data.startsWith("asset:")) {
      const assetId = data.replace("asset:", "");
      await handleAssetSelection(bot, chatId, messageId, assetId, state);
    } else if (data.startsWith("asset_confirmed:")) {
      const assetId = data.replace("asset_confirmed:", "");
      await handleAssetConfirmed(bot, chatId, messageId, assetId, state);
    } else if (data.startsWith("timeframe:")) {
      const [, assetId, tf] = data.split(":");
      await handleTimeframeSelection(bot, chatId, messageId, assetId, parseInt(tf), state);
    } else if (data.startsWith("settings:")) {
      const [, assetId, tf] = data.split(":");
      state.pendingSetup = { assetId, timeframe: parseInt(tf) };
      await handleSettings(bot, chatId, messageId, state);
    } else if (data === "change_timezone") {
      await handleTimezoneMenu(bot, chatId, messageId);
    } else if (data.startsWith("timezone:")) {
      const tzId = data.replace("timezone:", "");
      await handleTimezoneSelection(bot, chatId, messageId, tzId, state);
    } else if (data === "change_confidence") {
      await handleConfidenceMenu(bot, chatId, messageId, state);
    } else if (data.startsWith("confidence:")) {
      const filter = parseInt(data.replace("confidence:", "")) as ConfidenceFilter;
      await handleConfidenceSelection(bot, chatId, messageId, filter, state);
    } else if (data === "confidence_done" || data === "settings_done") {
      if (state.pendingSetup) {
        await handleTimeframeSelection(
          bot, chatId, messageId,
          state.pendingSetup.assetId,
          state.pendingSetup.timeframe,
          state
        );
      }
    } else if (data.startsWith("start_session:")) {
      const [, assetId, tf] = data.split(":");
      await handleStartSession(bot, chatId, messageId, assetId, parseInt(tf), state, query.id);
    } else if (data.startsWith("stop:")) {
      const sessionId = data.replace("stop:", "");
      await handleStopSession(bot, chatId, messageId, sessionId, state);
    } else if (data.startsWith("view:")) {
      const sessionId = data.replace("view:", "");
      await handleViewSession(bot, chatId, sessionId, state);
    } else if (data.startsWith("chart:")) {
      const sessionId = data.replace("chart:", "");
      await handleShowChart(bot, chatId, sessionId, state);
    } else if (data.startsWith("rerun:")) {
      const sessionId = data.replace("rerun:", "");
      await handleRerunSignal(bot, chatId, sessionId, state);
    } else if (data.startsWith("session_settings:")) {
      const sessionId = data.replace("session_settings:", "");
      const session = sessionManager.getSession(sessionId);
      if (session) {
        state.pendingSetup = { assetId: session.symbol, timeframe: session.timeframe };
        await handleSettings(bot, chatId, messageId, state);
      }
    } else if (data === "cancel") {
      await handleCancel(bot, chatId, messageId, state);
    } else if (data === "best_pair") {
      await sendBestPairSuggestion(bot, chatId);
    } else if (data.startsWith("header_")) {
    }
    
    await bot.answerCallbackQuery(query.id);
  } catch (error) {
    logger.error("Error handling callback", error);
    await bot.answerCallbackQuery(query.id, { text: `${EMOJIS.ERROR} An error occurred` });
  }
}

async function handleAcceptTerms(bot: TelegramBot, chatId: number, messageId: number): Promise<void> {
  try {
    await storage.acceptTerms(chatId);
    logger.info(`User ${chatId} accepted terms`);
    
    await bot.editMessageText(
      `${EMOJIS.SUCCESS} *Terms Accepted*\n\n` +
      `Thank you for accepting the terms and conditions.\n\n` +
      `You can now start using the trading signal bot.\n\n` +
      `_Made by Kaif_`,
      {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "Markdown",
        reply_markup: createStartKeyboard()
      }
    );
  } catch (error) {
    logger.error(`Failed to accept terms for user ${chatId}`, error);
    await bot.sendMessage(chatId, `${EMOJIS.ERROR} An error occurred. Please try /start again.`);
  }
}

async function handleDeclineTerms(bot: TelegramBot, chatId: number, messageId: number): Promise<void> {
  await bot.editMessageText(
    `${EMOJIS.WARNING} *Terms Declined*\n\n` +
    `You cannot use this bot without accepting the terms and conditions.\n\n` +
    `If you change your mind, use /start to try again.\n\n` +
    `_Made by Kaif_`,
    {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "Markdown"
    }
  );
}

async function handleBegin(bot: TelegramBot, chatId: number, messageId: number): Promise<void> {
  await bot.editMessageText(
    `${EMOJIS.FOREX} *Select a Trading Pair*\n\n` +
    `Choose from our supported markets:\n` +
    `${EMOJIS.VOLATILITY_SAFE} Green = Stable\n` +
    `${EMOJIS.WARNING} Yellow = Moderate volatility\n` +
    `${EMOJIS.FIRE} Red = High volatility`,
    {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "Markdown",
      reply_markup: createAssetKeyboard(SUPPORTED_ASSETS)
    }
  );
}

async function handleAssetSelection(
  bot: TelegramBot,
  chatId: number,
  messageId: number,
  assetId: string,
  state: UserState
): Promise<void> {
  const asset = getAssetById(assetId);
  if (!asset) {
    await bot.editMessageText(`${EMOJIS.ERROR} Asset not found. Please try again.`, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: createAssetKeyboard(SUPPORTED_ASSETS)
    });
    return;
  }
  
  const volatility = getMarketVolatility(assetId);
  if (volatility && !volatility.isStable && volatility.volatilityScore > 0.7) {
    const stablePairs = getStablePairs();
    await bot.editMessageText(
      `${EMOJIS.FIRE} *High Volatility Detected!*\n\n` +
      `${getAssetEmoji(assetId)} *${asset.name}* is experiencing high volatility.\n\n` +
      `${EMOJIS.WARNING} Volatility Score: ${(volatility.volatilityScore * 100).toFixed(0)}%\n` +
      `${EMOJIS.WARNING} Wick Ratio: ${(volatility.wickRatio * 100).toFixed(1)}%\n\n` +
      `Trading during high volatility can be risky. Consider waiting or choosing a more stable pair.`,
      {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "Markdown",
        reply_markup: createVolatilityWarningKeyboard(assetId, stablePairs)
      }
    );
    return;
  }
  
  await handleAssetConfirmed(bot, chatId, messageId, assetId, state);
}

async function handleAssetConfirmed(
  bot: TelegramBot,
  chatId: number,
  messageId: number,
  assetId: string,
  state: UserState
): Promise<void> {
  const asset = getAssetById(assetId);
  if (!asset) return;
  
  state.selectedAsset = assetId;
  
  await bot.editMessageText(
    `${EMOJIS.SUCCESS} *Selected:* ${getAssetDisplayName(asset)}\n\n` +
    `${EMOJIS.CLOCK} Choose your preferred timeframe:`,
    {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "Markdown",
      reply_markup: createTimeframeKeyboard(assetId)
    }
  );
}

async function handleTimeframeSelection(
  bot: TelegramBot,
  chatId: number,
  messageId: number,
  assetId: string,
  timeframe: number,
  state: UserState
): Promise<void> {
  const asset = getAssetById(assetId);
  if (!asset) return;
  
  state.selectedAsset = assetId;
  state.selectedTimeframe = timeframe;
  state.pendingSetup = { assetId, timeframe };
  
  const tfLabel = getTimeframeLabel(timeframe);
  const tzInfo = TIMEZONES.find(t => t.id === state.preferences.timezone);
  
  await bot.editMessageText(
    `${EMOJIS.ROCKET} *Ready to Start Trading*\n\n` +
    `${getAssetEmoji(assetId)} Pair: *${asset.name}*\n` +
    `${EMOJIS.CLOCK} Timeframe: *${tfLabel}*\n` +
    `${tzInfo?.emoji || '🌍'} Timezone: *${state.preferences.timezone}*\n` +
    `${getConfidenceEmoji(state.preferences.confidenceFilter)} Min Confidence: *${state.preferences.confidenceFilter}%*\n\n` +
    `${EMOJIS.INFO} Signals sent 1 second before candle close (real-time)\n` +
    `${EMOJIS.WARNING} NO TRADE shown if confidence < 75% (with direction - at your own risk)`,
    {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "Markdown",
      reply_markup: createConfirmSessionKeyboard(assetId, timeframe)
    }
  );
}

async function handleSettings(
  bot: TelegramBot,
  chatId: number,
  messageId: number,
  state: UserState
): Promise<void> {
  const tzInfo = TIMEZONES.find(t => t.id === state.preferences.timezone);
  
  await bot.editMessageText(
    `${EMOJIS.SETTINGS} *Settings*\n\n` +
    `Configure your preferences:\n\n` +
    `${tzInfo?.emoji || '🌍'} *Timezone:* ${state.preferences.timezone}\n` +
    `${getConfidenceEmoji(state.preferences.confidenceFilter)} *Confidence Filter:* ${state.preferences.confidenceFilter}%+`,
    {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "Markdown",
      reply_markup: createSettingsKeyboard(state.preferences.timezone, state.preferences.confidenceFilter)
    }
  );
}

async function handleTimezoneMenu(bot: TelegramBot, chatId: number, messageId: number): Promise<void> {
  await bot.editMessageText(
    `${EMOJIS.TIMEZONE} *Select Your Timezone*\n\n` +
    `Choose your local timezone for accurate signal times:`,
    {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "Markdown",
      reply_markup: createTimezoneKeyboard()
    }
  );
}

async function handleTimezoneSelection(
  bot: TelegramBot,
  chatId: number,
  messageId: number,
  tzId: string,
  state: UserState
): Promise<void> {
  state.preferences.timezone = tzId;
  const tzInfo = TIMEZONES.find(t => t.id === tzId);
  
  await bot.editMessageText(
    `${EMOJIS.SUCCESS} Timezone set to *${tzInfo?.emoji} ${tzId}*\n\n` +
    `All signal times will now display in ${tzInfo?.name || tzId}.`,
    {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "Markdown",
      reply_markup: createSettingsKeyboard(state.preferences.timezone, state.preferences.confidenceFilter)
    }
  );
}

async function handleConfidenceMenu(
  bot: TelegramBot,
  chatId: number,
  messageId: number,
  state: UserState
): Promise<void> {
  await bot.editMessageText(
    `${EMOJIS.TARGET} *Confidence Filter*\n\n` +
    `Set minimum confidence for signals:\n\n` +
    `${EMOJIS.TARGET} *80%+* - More signals, balanced approach\n` +
    `${EMOJIS.STAR} *90%+* - Fewer, higher quality signals\n` +
    `${EMOJIS.DIAMOND} *95%+* - Only premium signals\n\n` +
    `${EMOJIS.WARNING} Signals below 75% always show NO TRADE`,
    {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "Markdown",
      reply_markup: createConfidenceFilterKeyboard(state.preferences.confidenceFilter)
    }
  );
}

async function handleConfidenceSelection(
  bot: TelegramBot,
  chatId: number,
  messageId: number,
  filter: ConfidenceFilter,
  state: UserState
): Promise<void> {
  state.preferences.confidenceFilter = filter;
  
  await bot.editMessageText(
    `${EMOJIS.SUCCESS} Confidence filter set to *${filter}%+*\n\n` +
    `You will only receive signals with ${filter}% or higher confidence.`,
    {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "Markdown",
      reply_markup: createSettingsKeyboard(state.preferences.timezone, state.preferences.confidenceFilter)
    }
  );
}

async function handleStartSession(
  bot: TelegramBot,
  chatId: number,
  messageId: number,
  assetId: string,
  timeframe: number,
  state: UserState,
  queryId: string
): Promise<void> {
  const asset = getAssetById(assetId);
  if (!asset) return;
  
  const existingSessions = sessionManager.getSessionsByChatId(chatId);
  const duplicateSession = existingSessions.find(s => s.symbol === assetId && s.timeframe === timeframe);
  if (duplicateSession) {
    await bot.answerCallbackQuery(queryId, { 
      text: `${EMOJIS.WARNING} You already have an active session for this pair/timeframe. Stop it first.`,
      show_alert: true
    });
    return;
  }
  
  const sessionId = `${chatId}_${Date.now()}`;
  
  try {
    const session = await sessionManager.startSession(
      sessionId,
      chatId,
      assetId,
      timeframe,
      state.preferences
    );
    
    state.activeSessionId = sessionId;
    state.pendingSetup = undefined;
    
    const tfLabel = getTimeframeLabel(timeframe);
    const tzInfo = TIMEZONES.find(t => t.id === state.preferences.timezone);
    
    await bot.editMessageText(
      `${EMOJIS.SUCCESS} *Session Started!*\n\n` +
      `${getAssetEmoji(assetId)} Pair: *${asset.name}*\n` +
      `${EMOJIS.CLOCK} Timeframe: *${tfLabel}*\n` +
      `${tzInfo?.emoji || '🌍'} Timezone: *${state.preferences.timezone}*\n` +
      `${getConfidenceEmoji(state.preferences.confidenceFilter)} Filter: *${state.preferences.confidenceFilter}%+*\n` +
      `${EMOJIS.SIGNAL_UP} Status: *Active*\n\n` +
      `${EMOJIS.LIGHTNING} Signals will arrive before each candle closes!`,
      {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "Markdown",
        reply_markup: createSessionControlKeyboard(sessionId)
      }
    );
    
    logger.info(`Session started: ${sessionId} for chat ${chatId}`);
  } catch (error) {
    logger.error("Failed to start session", error);
    await bot.answerCallbackQuery(queryId, { 
      text: `${EMOJIS.ERROR} Failed to start session. Please try again.`,
      show_alert: true
    });
  }
}

async function handleStopSession(
  bot: TelegramBot,
  chatId: number,
  messageId: number,
  sessionId: string,
  state: UserState
): Promise<void> {
  const session = sessionManager.getSession(sessionId);
  
  await sessionManager.stopSession(sessionId);
  
  if (state.activeSessionId === sessionId) {
    state.activeSessionId = undefined;
  }
  
  const asset = session ? getAssetById(session.symbol) : null;
  const tfLabel = session ? getTimeframeLabel(session.timeframe) : "";
  
  const stopMessage = `${EMOJIS.STOP} *Session Stopped*\n\n` +
    `${asset?.emoji || '📊'} Pair: ${asset?.name || "Unknown"}\n` +
    `${EMOJIS.CLOCK} Timeframe: ${tfLabel}\n\n` +
    `${EMOJIS.INFO} You can start a new session anytime.`;
  
  // Try to edit the message first, if it fails (e.g., it's a photo), send a new message
  try {
    await bot.editMessageText(stopMessage, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "Markdown",
      reply_markup: createStoppedSessionKeyboard()
    });
  } catch (error) {
    // If editing fails (likely because it's a photo message), send a new message
    await bot.sendMessage(chatId, stopMessage, {
      parse_mode: "Markdown",
      reply_markup: createStoppedSessionKeyboard()
    });
  }
}

async function handleViewSession(
  bot: TelegramBot,
  chatId: number,
  sessionId: string,
  state: UserState
): Promise<void> {
  const session = sessionManager.getSession(sessionId);
  
  if (!session) {
    await bot.sendMessage(chatId, `${EMOJIS.ERROR} Session not found or has expired.`);
    return;
  }
  
  const asset = getAssetById(session.symbol);
  const tfLabel = getTimeframeLabel(session.timeframe);
  const duration = formatDuration(nowEpoch() - session.startedAt);
  const { closed, forming } = sessionManager.getSessionCandles(sessionId);
  const tzInfo = TIMEZONES.find(t => t.id === state.preferences.timezone);
  
  let statusText = `${EMOJIS.CHART} *Session Status*\n\n`;
  statusText += `${getAssetEmoji(session.symbol)} Pair: *${asset?.name || session.symbol}*\n`;
  statusText += `${EMOJIS.CLOCK} Timeframe: *${tfLabel}*\n`;
  statusText += `${session.status === "active" ? EMOJIS.SIGNAL_UP : EMOJIS.STOP} Status: *${session.status === "active" ? "Active" : "Stopped"}*\n`;
  statusText += `${EMOJIS.CALENDAR} Duration: ${duration}\n`;
  statusText += `${EMOJIS.CANDLE} Candles: ${closed.length}\n`;
  statusText += `${tzInfo?.emoji || '🌍'} Timezone: ${state.preferences.timezone}\n`;
  statusText += `${getConfidenceEmoji(state.preferences.confidenceFilter)} Filter: ${state.preferences.confidenceFilter}%+\n`;
  
  if (forming) {
    statusText += `\n${EMOJIS.CANDLE} *Current Candle:*\n`;
    statusText += `O: ${forming.open.toFixed(5)} | H: ${forming.high.toFixed(5)}\n`;
    statusText += `L: ${forming.low.toFixed(5)} | C: ${forming.close.toFixed(5)}`;
  }
  
  if (session.lastSignalAt) {
    statusText += `\n\n${EMOJIS.CLOCK} Last signal: ${formatTimeOnlyWithTimezone(session.lastSignalAt, state.preferences.timezone)}`;
  }
  
  await bot.sendMessage(chatId, statusText, {
    parse_mode: "Markdown",
    reply_markup: createSessionControlKeyboard(sessionId)
  });
}

async function handleShowChart(
  bot: TelegramBot,
  chatId: number,
  sessionId: string,
  state: UserState
): Promise<void> {
  const session = sessionManager.getSession(sessionId);
  
  if (!session) {
    await bot.sendMessage(chatId, `${EMOJIS.ERROR} Session not found.`);
    return;
  }
  
  if (!renderService) {
    await bot.sendMessage(chatId, `${EMOJIS.WARNING} Chart rendering is not available.`);
    return;
  }
  
  const asset = getAssetById(session.symbol);
  const { closed, forming } = sessionManager.getSessionCandles(sessionId);
  
  if (closed.length < 10) {
    await bot.sendMessage(chatId, `${EMOJIS.WARNING} Not enough candle data yet. Please wait for more data to accumulate.`);
    return;
  }
  
  try {
    const chartCandles = closed.slice(-100);
    
    const chartBuffer = await renderService.renderChart({
      candles: chartCandles,
      formingCandle: forming,
      overlays: ["ema21", "ema50", "sma20", "bollingerBands"],
    });
    
    const tzInfo = TIMEZONES.find(t => t.id === state.preferences.timezone);
    const currentTime = formatTimeOnlyWithTimezone(nowEpoch(), state.preferences.timezone);
    
    await bot.sendPhoto(chatId, chartBuffer, {
      caption: `${EMOJIS.CHART} *${asset?.name || session.symbol}* - ${getTimeframeLabel(session.timeframe)}\n` +
               `${tzInfo?.emoji || '🌍'} ${currentTime}\n` +
               `${EMOJIS.CANDLE} Showing last ${chartCandles.length} candles`,
      parse_mode: "Markdown",
      reply_markup: createChartViewKeyboard(sessionId)
    });
  } catch (error) {
    logger.error("Failed to render chart", error);
    await bot.sendMessage(chatId, `${EMOJIS.ERROR} Failed to generate chart. Please try again.`);
  }
}

async function handleRerunSignal(
  bot: TelegramBot,
  chatId: number,
  sessionId: string,
  state: UserState
): Promise<void> {
  const session = sessionManager.getSession(sessionId);
  
  if (!session || session.status !== "active") {
    await bot.sendMessage(chatId, `${EMOJIS.WARNING} Session is not active.`);
    return;
  }
  
  const signal = sessionManager.getDebugSignal(session.symbol, session.timeframe);
  
  if (!signal) {
    await bot.sendMessage(chatId, `${EMOJIS.WARNING} Not enough data for signal generation yet.`);
    return;
  }
  
  await sendSignalToChat(bot, chatId, session, signal, state.preferences);
}

async function handleCancel(
  bot: TelegramBot,
  chatId: number,
  messageId: number,
  state: UserState
): Promise<void> {
  state.selectedAsset = undefined;
  state.selectedTimeframe = undefined;
  state.pendingSetup = undefined;
  
  await bot.editMessageText(
    `${EMOJIS.ERROR} Operation cancelled.\n\nTap /start to begin again.`,
    {
      chat_id: chatId,
      message_id: messageId
    }
  );
}

export async function sendSignalToChat(
  bot: TelegramBot,
  chatId: number,
  session: Session,
  signal: SignalResult,
  preferences?: UserPreferences
): Promise<void> {
  if (session.chatId !== chatId) {
    logger.warn(`[PAIR ISOLATION] Attempted to send signal to wrong chat. Session chat: ${session.chatId}, Target chat: ${chatId}`);
    return;
  }
  
  if (signal.symbol !== session.symbol) {
    logger.warn(`[PAIR ISOLATION] Signal symbol mismatch. Signal: ${signal.symbol}, Session: ${session.symbol}. Discarding signal.`);
    return;
  }
  
  if (signal.timeframe !== session.timeframe) {
    logger.warn(`[PAIR ISOLATION] Timeframe mismatch. Signal: ${signal.timeframe}s, Session: ${session.timeframe}s. Discarding signal.`);
    return;
  }
  
  const userPrefs = preferences || getUserState(chatId).preferences;
  
  let suggestedDirection: "CALL" | "PUT" | undefined = undefined;
  let isLowConfidence = false;
  let isWarning = false;
  
  if (signal.confidence >= 75) {
    if (signal.direction === 'NO_TRADE') {
      signal.direction = signal.pUp > 0.5 ? 'CALL' : 'PUT';
      logger.info(`[HIGH_CONFIDENCE] Forced direction to ${signal.direction} due to high confidence: ${signal.confidence}%`);
    }
  } else if (signal.confidence >= 10) {
    suggestedDirection = signal.pUp > 0.5 ? 'CALL' : 'PUT';
    isLowConfidence = true;
    signal.direction = 'NO_TRADE';
    signal.volatilityOverride = true;
    signal.volatilityReason = signal.volatilityReason || 'Low confidence signal (below 75% threshold)';
    logger.info(`[NO_TRADE] Signal forced to NO_TRADE due to low confidence: ${signal.confidence}%. Bot thinking: ${suggestedDirection}`);
  } else {
    suggestedDirection = signal.pUp > 0.5 ? 'CALL' : 'PUT';
    isWarning = true;
    isLowConfidence = true;
    signal.volatilityOverride = true;
    signal.volatilityReason = 'Extremely low confidence - avoid trading';
    logger.info(`[WARNING] Extremely low confidence: ${signal.confidence}%. Showing warning signal.`);
  }
  
  if (signal.direction !== 'NO_TRADE' && !isWarning && signal.confidence < userPrefs.confidenceFilter) {
    logger.info(`[FILTER] Signal filtered out. Confidence ${signal.confidence}% below user threshold ${userPrefs.confidenceFilter}%`);
    return;
  }
  
  const asset = getAssetById(signal.symbol);
  const tfLabel = getTimeframeLabel(signal.timeframe);
  const tzInfo = TIMEZONES.find(t => t.id === userPrefs.timezone);
  
  try {
    let signalImage: Buffer;
    
    if (isWarning) {
      signalImage = generateLowConfidenceWarningImage(
        asset?.name || signal.symbol,
        Math.round(signal.confidence),
        suggestedDirection
      );
    } else {
      signalImage = generateSignalImage({
        direction: signal.direction,
        symbol: asset?.name || signal.symbol,
        confidence: Math.round(signal.confidence),
        timeframe: tfLabel,
        suggestedDirection,
        isLowConfidence,
        isWarning
      });
    }
    
    const topVotes = signal.votes
      .filter(v => v.direction !== "NEUTRAL")
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 2);
    
    let caption = ``;
    caption += `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n`;
    caption += `${getAssetEmoji(signal.symbol)} *${asset?.name || signal.symbol}* | ${tfLabel}\n`;
    caption += `${tzInfo?.emoji || ''} ${formatTimeOnlyWithTimezone(signal.timestamp, userPrefs.timezone)} | ${getConfidenceEmoji(signal.confidence)} ${Math.round(signal.confidence)}%\n`;
    caption += `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n`;
    
    if (topVotes.length > 0) {
      caption += `${EMOJIS.CHART} *Key Signals:*\n`;
      for (const vote of topVotes) {
        const arrow = vote.direction === "UP" ? EMOJIS.SIGNAL_UP : EMOJIS.SIGNAL_DOWN;
        const name = vote.indicator.replace(/_/g, " ").slice(0, 20);
        caption += `  ${arrow} ${name}\n`;
      }
    }
    
    if (signal.psychology.patterns.length > 0) {
      const pattern = signal.psychology.patterns[0];
      const patternEmoji = pattern.type === 'bullish' ? EMOJIS.SIGNAL_UP : 
                           pattern.type === 'bearish' ? EMOJIS.SIGNAL_DOWN : EMOJIS.WARNING;
      caption += `${EMOJIS.CANDLE} *Pattern:* ${patternEmoji} ${pattern.name}\n`;
    }
    
    if (signal.volatilityOverride && signal.volatilityReason) {
      caption += `\n${EMOJIS.FIRE} _${signal.volatilityReason}_\n`;
    }
    
    const stats = getSessionStats(session.id);
    if (stats.totalSignals > 0) {
      caption += `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n`;
      caption += `${EMOJIS.SUCCESS} ${stats.wins}W | ${EMOJIS.ERROR} ${stats.losses}L | WR: ${stats.winRate.toFixed(0)}%\n`;
    }
    
    if (signal.direction !== 'NO_TRADE' && signal.formingCandle) {
      const signalKey = `${session.id}_${signal.timestamp}`;
      const expiryTime = signal.candleCloseTime + signal.timeframe;
      
      addPendingSignal(signalKey, {
        signal: { ...signal, entryPrice: signal.formingCandle.close },
        entryPrice: signal.formingCandle.close,
        expiryTime,
        chatId,
        sessionId: session.id
      });
      
      logger.info(`[WIN/LOSS TRACKING] Added pending signal ${signalKey} for tracking. Entry: ${signal.formingCandle.close}, Expiry: ${expiryTime}`);
    }
    
    await bot.sendPhoto(chatId, signalImage, {
      caption,
      parse_mode: "Markdown",
      reply_markup: createSignalActionKeyboard(session.id)
    });
    
  } catch (error) {
    logger.error("Failed to generate signal image, falling back to text", error);
    
    let textCaption = ``;
    const directionEmoji = signal.direction === 'CALL' ? EMOJIS.SIGNAL_UP : 
                           signal.direction === 'PUT' ? EMOJIS.SIGNAL_DOWN : EMOJIS.WARNING;
    
    textCaption += `${directionEmoji}${directionEmoji}${directionEmoji} *${signal.direction}* ${directionEmoji}${directionEmoji}${directionEmoji}\n\n`;
    textCaption += `${getAssetEmoji(signal.symbol)} *${asset?.name || signal.symbol}*\n`;
    textCaption += `${EMOJIS.CLOCK} ${tfLabel}  |  ${getConfidenceEmoji(signal.confidence)} ${signal.confidence}%\n`;
    textCaption += `${tzInfo?.emoji || ''} ${formatTimeOnlyWithTimezone(signal.timestamp, userPrefs.timezone)}\n`;
    
    await bot.sendMessage(chatId, textCaption, {
      parse_mode: "Markdown",
      reply_markup: createSignalActionKeyboard(session.id)
    });
  }
}

export function getUserPreferences(chatId: number): UserPreferences {
  return getUserState(chatId).preferences;
}

export async function sendWinLossUpdate(
  bot: TelegramBot,
  chatId: number,
  sessionId: string,
  outcome: 'WIN' | 'LOSS',
  direction: 'CALL' | 'PUT',
  entryPrice: number,
  exitPrice: number,
  symbol: string
): Promise<void> {
  const stats = updateSessionStats(sessionId, outcome);
  const asset = getAssetById(symbol);
  
  const outcomeEmoji = outcome === 'WIN' ? EMOJIS.SUCCESS : EMOJIS.ERROR;
  const outcomeColor = outcome === 'WIN' ? 'won' : 'lost';
  const priceDiff = ((exitPrice - entryPrice) / entryPrice * 100).toFixed(3);
  const directionEmoji = direction === 'CALL' ? EMOJIS.CALL : EMOJIS.PUT;
  
  try {
    const statsImage = generateWinLossImage(stats.wins, stats.losses, stats.winRate);
    
    let caption = `${outcomeEmoji} *Trade ${outcome}!*\n`;
    caption += `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n`;
    caption += `${getAssetEmoji(symbol)} ${asset?.name || symbol}\n`;
    caption += `${directionEmoji} ${direction} | Entry: ${entryPrice.toFixed(5)}\n`;
    caption += `Exit: ${exitPrice.toFixed(5)} (${priceDiff}%)\n`;
    
    await bot.sendPhoto(chatId, statsImage, {
      caption,
      parse_mode: "Markdown"
    });
    
  } catch (error) {
    logger.error("Failed to send win/loss update with image", error);
    
    let message = `${outcomeEmoji} *Trade ${outcome}!*\n\n`;
    message += `${getAssetEmoji(symbol)} ${asset?.name || symbol}\n`;
    message += `${directionEmoji} ${direction}\n`;
    message += `Entry: ${entryPrice.toFixed(5)}\n`;
    message += `Exit: ${exitPrice.toFixed(5)}\n\n`;
    message += `${EMOJIS.SUCCESS} Wins: ${stats.wins} | ${EMOJIS.ERROR} Losses: ${stats.losses}\n`;
    message += `Win Rate: ${stats.winRate.toFixed(0)}%`;
    
    await bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
  }
}

export async function sendVolatilityWarning(
  bot: TelegramBot,
  chatId: number,
  symbol: string,
  type: 'pre_session' | 'in_session'
): Promise<void> {
  const asset = getAssetById(symbol);
  const stablePairs = getStablePairs();
  
  try {
    const warningImage = generateWarningImage(type, asset?.name || symbol);
    
    let caption = '';
    if (type === 'pre_session') {
      caption = `${EMOJIS.WARNING} *Volatility Warning*\n`;
      caption += `${getAssetEmoji(symbol)} ${asset?.name || symbol} is currently unstable.\n\n`;
      if (stablePairs.length > 0) {
        caption += `${EMOJIS.STAR} *Suggested alternatives:*\n`;
        for (const pair of stablePairs.slice(0, 3)) {
          const pairAsset = getAssetById(pair);
          caption += `  ${getAssetEmoji(pair)} ${pairAsset?.name || pair}\n`;
        }
      }
    } else {
      caption = `${EMOJIS.FIRE} *Market Unstable!*\n`;
      caption += `${getAssetEmoji(symbol)} ${asset?.name || symbol} has become volatile.\n`;
      caption += `_Exercise caution with current signals._`;
    }
    
    await bot.sendPhoto(chatId, warningImage, {
      caption,
      parse_mode: "Markdown"
    });
    
  } catch (error) {
    logger.error("Failed to send volatility warning with image", error);
    
    let message = type === 'pre_session' 
      ? `${EMOJIS.WARNING} *Volatility Warning*\n\n${getAssetEmoji(symbol)} ${asset?.name || symbol} is currently unstable.`
      : `${EMOJIS.FIRE} *Market Unstable!*\n\n${getAssetEmoji(symbol)} ${asset?.name || symbol} has become volatile.`;
    
    await bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
  }
}

export async function sendBestPairSuggestion(
  bot: TelegramBot,
  chatId: number
): Promise<void> {
  const stablePairs = getStablePairs();
  
  if (stablePairs.length === 0) {
    await bot.sendMessage(
      chatId,
      `${EMOJIS.WARNING} *No Stable Pairs Found*\n\nAll markets are currently experiencing volatility. Consider waiting for better conditions.`,
      { parse_mode: "Markdown" }
    );
    return;
  }
  
  const pairData = stablePairs.slice(0, 5).map(symbol => {
    const vol = marketVolatilityCache.get(symbol);
    const stability = vol ? Math.round((1 - vol.volatilityScore) * 100) : 50;
    let trend = "NEUTRAL";
    return { symbol: getAssetById(symbol)?.name || symbol, stability, trend };
  });
  
  try {
    const bestPairImage = generateBestPairImage(pairData);
    
    let caption = `${EMOJIS.STAR} *Best Trading Pairs*\n`;
    caption += `Based on real-time market analysis\n`;
    caption += `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n`;
    caption += `_Top ${pairData.length} most stable pairs right now_`;
    
    await bot.sendPhoto(chatId, bestPairImage, {
      caption,
      parse_mode: "Markdown"
    });
    
  } catch (error) {
    logger.error("Failed to send best pair suggestion with image", error);
    
    let message = `${EMOJIS.STAR} *Best Trading Pairs*\n\n`;
    for (let i = 0; i < pairData.length; i++) {
      message += `${i + 1}. ${pairData[i].symbol} - ${pairData[i].stability}% stable\n`;
    }
    
    await bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
  }
}
