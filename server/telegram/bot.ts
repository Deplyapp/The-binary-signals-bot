import TelegramBot from "node-telegram-bot-api";
import { sessionManager } from "../services/sessionManager";
import { 
  handleStart, 
  handleCallback, 
  sendSignalToChat, 
  setRenderService,
  getUserPreferences,
  sendBestPairSuggestion
} from "./handlers";
import { winLossTracker } from "../services/winLossTracker";
import { createLogger } from "../utils/logger";
import { EMOJIS } from "../config/emojis";
import type { Session, SignalResult } from "@shared/schema";

const logger = createLogger("TelegramBot");

let bot: TelegramBot | null = null;
let isInitialized = false;

export function initTelegramBot(token: string): TelegramBot | null {
  if (!token) {
    logger.warn("TELEGRAM_BOT_TOKEN not provided - bot will not be started");
    return null;
  }

  try {
    bot = new TelegramBot(token, { polling: true });
    
    bot.on("message", async (msg) => {
      try {
      const chatId = msg.chat.id;
      
      if (msg.text === "/start") {
        await handleStart(bot!, msg);
      } else if (msg.text === "/stop") {
        const session = sessionManager.getSessionByChatId(chatId);
        if (session) {
          await sessionManager.stopSession(session.id);
          await bot!.sendMessage(
            chatId, 
            `${EMOJIS.STOP} *Session stopped.*\n\nUse /start to begin a new session.`,
            { parse_mode: "Markdown" }
          );
        } else {
          await bot!.sendMessage(
            chatId, 
            `${EMOJIS.WARNING} No active session.\n\nUse /start to begin.`
          );
        }
      } else if (msg.text === "/status") {
        const session = sessionManager.getSessionByChatId(chatId);
        if (session) {
          const prefs = getUserPreferences(chatId);
          await bot!.sendMessage(
            chatId,
            `${EMOJIS.CHART} *Active Session*\n\n` +
            `${EMOJIS.FOREX} Pair: *${session.symbol}*\n` +
            `${EMOJIS.CLOCK} Timeframe: *${session.timeframe}s*\n` +
            `${EMOJIS.SIGNAL_UP} Status: *${session.status}*\n` +
            `${EMOJIS.TIMEZONE} Timezone: *${prefs.timezone}*\n` +
            `${EMOJIS.TARGET} Filter: *${prefs.confidenceFilter}%+*`,
            { parse_mode: "Markdown" }
          );
        } else {
          await bot!.sendMessage(
            chatId, 
            `${EMOJIS.WARNING} No active session.\n\nUse /start to begin.`
          );
        }
      } else if (msg.text === "/best") {
        await sendBestPairSuggestion(bot!, chatId);
      } else if (msg.text === "/help") {
        const helpText = `${EMOJIS.ROCKET} *Trading Signal Bot*\n\n` +
`${EMOJIS.LIGHTNING} *Commands:*\n` +
`/start - Start a new trading session\n` +
`/stop - Stop the current session\n` +
`/status - View current session status\n` +
`/best - Get best pair suggestions\n` +
`/help - Show this help message\n\n` +

`${EMOJIS.CHART} *How it works:*\n` +
`1. Tap /start and select an asset\n` +
`2. Choose a timeframe\n` +
`3. Configure timezone & confidence filter\n` +
`4. Start the session (multiple sessions allowed)\n` +
`5. Receive signals WHEN candles close (real-time)\n\n` +

`${EMOJIS.TARGET} *Signal Types:*\n` +
`${EMOJIS.CALL} *CALL* - Predicted upward movement\n` +
`${EMOJIS.PUT} *PUT* - Predicted downward movement\n` +
`${EMOJIS.NO_TRADE} *NO TRADE* - Uncertain/volatile market\n\n` +

`${EMOJIS.DIAMOND} *Confidence Levels:*\n` +
`${EMOJIS.DIAMOND} 95%+ - Premium signals\n` +
`${EMOJIS.STAR} 90%+ - High quality signals\n` +
`${EMOJIS.TARGET} 80%+ - Standard signals\n` +
`${EMOJIS.WARNING} <75% - Always NO TRADE\n\n` +

`${EMOJIS.FIRE} *Volatility Warnings:*\n` +
`The bot monitors market volatility and warns you about risky conditions. It suggests stable pairs when volatility is high.\n\n` +

`${EMOJIS.TIMEZONE} *Timezone Support:*\n` +
`Configure your timezone to see signal times in your local time.`;
        
        await bot!.sendMessage(chatId, helpText, { parse_mode: "Markdown" });
      }
      } catch (error) {
        logger.error("Error handling message", error);
      }
    });
    
    bot.on("callback_query", async (query) => {
      try {
        await handleCallback(bot!, query);
      } catch (error) {
        logger.error("Error handling callback query", error);
        try {
          await bot!.answerCallbackQuery(query.id, {
            text: "An error occurred. Please try again.",
            show_alert: false
          });
        } catch (answerError) {
          // Ignore errors when answering - query may have expired
        }
      }
    });
    
    bot.on("polling_error", (error) => {
      logger.error("Telegram polling error", error);
    });
    
    sessionManager.on("candleCloseSignal", async (session: Session, signal: SignalResult) => {
      if (bot && session.status === "active") {
        try {
          const prefs = getUserPreferences(session.chatId);
          await sendSignalToChat(bot, session.chatId, session, signal, prefs);
          logger.info(`Signal sent to chat ${session.chatId} - triggered by candle close`);
        } catch (error) {
          logger.error(`Failed to send signal to chat ${session.chatId}`, error);
        }
      }
    });
    
    winLossTracker.setBot(bot);
    winLossTracker.start();
    logger.info("Win/loss tracker started");
    
    isInitialized = true;
    logger.info("Telegram bot initialized and polling");
    
    return bot;
  } catch (error) {
    logger.error("Failed to initialize Telegram bot", error);
    return null;
  }
}

export function getTelegramBot(): TelegramBot | null {
  return bot;
}

export function isBotInitialized(): boolean {
  return isInitialized;
}

export function stopTelegramBot(): void {
  if (bot) {
    winLossTracker.stop();
    bot.stopPolling();
    bot = null;
    isInitialized = false;
    logger.info("Telegram bot stopped");
  }
}

export { setRenderService };
