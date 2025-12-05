import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, real, jsonb, timestamp, boolean, index, bigint } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export interface Tick {
  symbol: string;
  price: number;
  timestamp: number;
  epoch: number;
}

export interface Candle {
  symbol: string;
  timeframe: number;
  open: number;
  high: number;
  low: number;
  close: number;
  timestamp: number;
  tickCount: number;
  isForming: boolean;
}

export interface IndicatorValues {
  ema5?: number;
  ema9?: number;
  ema12?: number;
  ema21?: number;
  ema50?: number;
  sma20?: number;
  sma50?: number;
  sma200?: number;
  macd?: { macd: number; signal: number; histogram: number };
  rsi14?: number;
  stochastic?: { k: number; d: number };
  atr14?: number;
  adx?: number;
  cci?: number;
  williamsR?: number;
  bollingerBands?: { upper: number; middle: number; lower: number };
  keltnerChannels?: { upper: number; middle: number; lower: number };
  hullMA?: number;
  superTrend?: { value: number; direction: 'up' | 'down' };
  roc?: number;
  momentum?: number;
  vwap?: number;
  obv?: number;
  chaikinOsc?: number;
  fisherTransform?: number;
  donchianChannels?: { upper: number; lower: number };
  psar?: number;
  ultimateOsc?: number;
  meanReversionZ?: number;
  linRegSlope?: number;
  atrBands?: { upper: number; lower: number };
  rangePercentile?: number;
  emaRibbon?: number;
}

export interface CandlestickPattern {
  name: string;
  type: 'bullish' | 'bearish' | 'neutral';
  strength: number;
  description: string;
}

export interface PsychologyAnalysis {
  bodyRatio: number;
  upperWickRatio: number;
  lowerWickRatio: number;
  isDoji: boolean;
  patterns: CandlestickPattern[];
  bias: 'bullish' | 'bearish' | 'neutral';
  orderBlockProbability: number;
  fvgDetected: boolean;
}

export interface Vote {
  indicator: string;
  direction: 'UP' | 'DOWN' | 'NEUTRAL';
  weight: number;
  reason?: string;
}

export interface VolatilityInfo {
  isVolatile: boolean;
  wickRatio?: number;
  atrRatio?: number;
  reason?: string;
  severity?: 'low' | 'medium' | 'high';
  suggestedPairs?: string[];
}

export interface SignalResult {
  sessionId: string;
  symbol: string;
  timeframe: number;
  timestamp: number;
  candleCloseTime: number;
  direction: 'CALL' | 'PUT' | 'NO_TRADE';
  confidence: number;
  pUp: number;
  pDown: number;
  votes: Vote[];
  indicators: IndicatorValues;
  psychology: PsychologyAnalysis;
  volatilityOverride: boolean;
  volatilityReason?: string;
  volatilityInfo?: VolatilityInfo;
  closedCandlesCount: number;
  formingCandle?: Candle;
  entryPrice?: number;
  outcome?: 'WIN' | 'LOSS' | 'PENDING';
  suggestedDirection?: 'CALL' | 'PUT';
  isLowConfidence?: boolean;
}

export interface TradeResult {
  signalId: string;
  sessionId: string;
  symbol: string;
  direction: 'CALL' | 'PUT';
  entryPrice: number;
  exitPrice: number;
  outcome: 'WIN' | 'LOSS';
  timeframe: number;
  timestamp: number;
}

export interface TimezoneOption {
  id: string;
  name: string;
  emoji: string;
  offset: number;
  label: string;
}

export const TIMEZONES: TimezoneOption[] = [
  { id: 'UTC', name: 'UTC', emoji: '🌍', offset: 0, label: 'UTC (GMT+0)' },
  { id: 'IST', name: 'India Standard Time', emoji: '🇮🇳', offset: 330, label: 'IST (GMT+5:30)' },
  { id: 'EST', name: 'Eastern Standard Time', emoji: '🇺🇸', offset: -300, label: 'EST (GMT-5)' },
  { id: 'PST', name: 'Pacific Standard Time', emoji: '🇺🇸', offset: -480, label: 'PST (GMT-8)' },
  { id: 'GMT', name: 'Greenwich Mean Time', emoji: '🇬🇧', offset: 0, label: 'GMT (GMT+0)' },
  { id: 'JST', name: 'Japan Standard Time', emoji: '🇯🇵', offset: 540, label: 'JST (GMT+9)' },
  { id: 'AEST', name: 'Australian Eastern', emoji: '🇦🇺', offset: 600, label: 'AEST (GMT+10)' },
  { id: 'CET', name: 'Central European Time', emoji: '🇪🇺', offset: 60, label: 'CET (GMT+1)' },
  { id: 'SGT', name: 'Singapore Time', emoji: '🇸🇬', offset: 480, label: 'SGT (GMT+8)' },
  { id: 'HKT', name: 'Hong Kong Time', emoji: '🇭🇰', offset: 480, label: 'HKT (GMT+8)' },
  { id: 'MSK', name: 'Moscow Time', emoji: '🇷🇺', offset: 180, label: 'MSK (GMT+3)' },
  { id: 'BRT', name: 'Brasilia Time', emoji: '🇧🇷', offset: -180, label: 'BRT (GMT-3)' },
];

export type ConfidenceFilter = 80 | 90 | 95;

export interface UserPreferences {
  timezone: string;
  confidenceFilter: ConfidenceFilter;
}

export interface SessionStats {
  wins: number;
  losses: number;
  winRate: number;
  totalSignals: number;
}

export interface Session {
  id: string;
  chatId: number;
  symbol: string;
  timeframe: number;
  status: 'active' | 'stopped';
  startedAt: number;
  lastSignalAt?: number;
  options?: SessionOptions;
  preferences?: UserPreferences;
  stats?: SessionStats;
}

export interface SessionOptions {
  enabledIndicators?: string[];
  customWeights?: Record<string, number>;
  volatilityThreshold?: number;
  timezone?: string;
  confidenceFilter?: ConfidenceFilter;
}

export interface ChartRenderRequest {
  candles: Candle[];
  formingCandle?: Candle;
  indicators?: IndicatorValues;
  signal?: SignalResult;
  overlays?: string[];
  annotations?: ChartAnnotation[];
}

export interface ChartAnnotation {
  type: 'signal' | 'countdown' | 'label';
  position: 'top' | 'bottom';
  text: string;
  color?: string;
}

export interface Asset {
  id: string;
  name: string;
  emoji?: string;
  category?: string;
}

export interface MarketVolatility {
  symbol: string;
  volatilityScore: number;
  wickRatio: number;
  atrRatio: number;
  isStable: boolean;
  lastUpdated: number;
}

export const telegramUsers = pgTable("telegram_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  chatId: bigint("chat_id", { mode: "number" }).notNull().unique(),
  username: text("username"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  termsAccepted: boolean("terms_accepted").notNull().default(false),
  termsAcceptedAt: timestamp("terms_accepted_at"),
  preferences: jsonb("preferences").$type<UserPreferences>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastActiveAt: timestamp("last_active_at").notNull().defaultNow(),
}, (table) => ({
  chatIdIdx: index("telegram_users_chat_id_idx").on(table.chatId),
}));

export const volatilityData = pgTable("volatility_data", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  symbol: text("symbol").notNull(),
  volatilityScore: real("volatility_score").notNull(),
  wickRatio: real("wick_ratio").notNull(),
  atrRatio: real("atr_ratio").notNull(),
  rangeRatio: real("range_ratio"),
  priceStability: real("price_stability"),
  severity: text("severity").notNull(),
  isStable: boolean("is_stable").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  symbolIdx: index("volatility_data_symbol_idx").on(table.symbol),
  createdAtIdx: index("volatility_data_created_at_idx").on(table.createdAt),
}));

export const userSessions = pgTable("user_sessions", {
  id: varchar("id").primaryKey(),
  chatId: bigint("chat_id", { mode: "number" }).notNull(),
  symbol: text("symbol").notNull(),
  timeframe: integer("timeframe").notNull(),
  status: text("status").notNull(),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  stoppedAt: timestamp("stopped_at"),
  lastSignalAt: timestamp("last_signal_at"),
  preferences: jsonb("preferences").$type<UserPreferences>(),
  stats: jsonb("stats").$type<SessionStats>(),
}, (table) => ({
  chatIdIdx: index("user_sessions_chat_id_idx").on(table.chatId),
  statusIdx: index("user_sessions_status_idx").on(table.status),
}));

export const signalLogs = pgTable("signal_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: text("session_id").notNull(),
  symbol: text("symbol").notNull(),
  timeframe: integer("timeframe").notNull(),
  timestamp: integer("timestamp").notNull(),
  candleCloseTime: integer("candle_close_time").notNull(),
  direction: text("direction").notNull(),
  confidence: real("confidence").notNull(),
  pUp: real("p_up").notNull(),
  pDown: real("p_down").notNull(),
  votes: jsonb("votes").notNull(),
  indicators: jsonb("indicators").notNull(),
  psychology: jsonb("psychology").notNull(),
  volatilityOverride: integer("volatility_override").notNull(),
  volatilityReason: text("volatility_reason"),
  closedCandlesCount: integer("closed_candles_count").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const candleLogs = pgTable("candle_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  symbol: text("symbol").notNull(),
  timeframe: integer("timeframe").notNull(),
  open: real("open").notNull(),
  high: real("high").notNull(),
  low: real("low").notNull(),
  close: real("close").notNull(),
  timestamp: integer("timestamp").notNull(),
  tickCount: integer("tick_count").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  symbolTimeframeIdx: index("candle_logs_symbol_timeframe_idx").on(table.symbol, table.timeframe),
}));

export const telegramUsersRelations = relations(telegramUsers, ({ many }) => ({
  sessions: many(userSessions),
}));

export const userSessionsRelations = relations(userSessions, ({ one }) => ({
  user: one(telegramUsers, {
    fields: [userSessions.chatId],
    references: [telegramUsers.chatId],
  }),
}));

export const insertTelegramUserSchema = createInsertSchema(telegramUsers).omit({ id: true, createdAt: true, lastActiveAt: true });
export const insertVolatilityDataSchema = createInsertSchema(volatilityData).omit({ id: true, createdAt: true });
export const insertUserSessionSchema = createInsertSchema(userSessions).omit({ startedAt: true });
export const insertSignalLogSchema = createInsertSchema(signalLogs).omit({ id: true, createdAt: true });
export const insertCandleLogSchema = createInsertSchema(candleLogs).omit({ id: true, createdAt: true });

export type InsertTelegramUser = z.infer<typeof insertTelegramUserSchema>;
export type InsertVolatilityData = z.infer<typeof insertVolatilityDataSchema>;
export type InsertUserSession = z.infer<typeof insertUserSessionSchema>;
export type InsertSignalLog = z.infer<typeof insertSignalLogSchema>;
export type InsertCandleLog = z.infer<typeof insertCandleLogSchema>;

export type TelegramUser = typeof telegramUsers.$inferSelect;
export type VolatilityDataRecord = typeof volatilityData.$inferSelect;
export type UserSessionRecord = typeof userSessions.$inferSelect;
export type SignalLog = typeof signalLogs.$inferSelect;
export type CandleLog = typeof candleLogs.$inferSelect;

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
