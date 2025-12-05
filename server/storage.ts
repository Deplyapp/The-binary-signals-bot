import { eq, desc, and, gte } from "drizzle-orm";
import { db } from "./db";
import {
  telegramUsers,
  volatilityData,
  userSessions,
  signalLogs,
  candleLogs,
  InsertTelegramUser,
  InsertVolatilityData,
  InsertUserSession,
  InsertSignalLog,
  InsertCandleLog,
  TelegramUser,
  VolatilityDataRecord,
  UserSessionRecord,
  SignalLog,
  CandleLog,
  UserPreferences,
  SessionStats,
} from "@shared/schema";

export interface IStorage {
  getTelegramUser(chatId: number): Promise<TelegramUser | undefined>;
  createTelegramUser(user: InsertTelegramUser): Promise<TelegramUser>;
  updateTelegramUser(chatId: number, data: Partial<InsertTelegramUser>): Promise<TelegramUser | undefined>;
  acceptTerms(chatId: number): Promise<TelegramUser | undefined>;
  hasAcceptedTerms(chatId: number): Promise<boolean>;

  saveVolatilityData(data: InsertVolatilityData): Promise<VolatilityDataRecord>;
  getLatestVolatility(symbol: string): Promise<VolatilityDataRecord | undefined>;
  getVolatilityHistory(symbol: string, limit?: number): Promise<VolatilityDataRecord[]>;
  getAllLatestVolatility(): Promise<VolatilityDataRecord[]>;

  createUserSession(session: InsertUserSession): Promise<UserSessionRecord>;
  getUserSession(id: string): Promise<UserSessionRecord | undefined>;
  updateUserSession(id: string, data: Partial<InsertUserSession>): Promise<UserSessionRecord | undefined>;
  getActiveSessionsForChat(chatId: number): Promise<UserSessionRecord[]>;
  getAllActiveSessions(): Promise<UserSessionRecord[]>;

  saveSignalLog(signal: InsertSignalLog): Promise<SignalLog>;
  getSignalLogs(sessionId: string, limit?: number): Promise<SignalLog[]>;

  saveCandleLog(candle: InsertCandleLog): Promise<CandleLog>;
  getCandleLogs(symbol: string, timeframe: number, limit?: number): Promise<CandleLog[]>;

  getBotStatus(): Promise<{
    totalUsers: number;
    activeSessions: number;
    signalsGenerated: number;
    usersAcceptedTerms: number;
    lastVolatilityUpdate: Date | null;
  }>;
}

export class DatabaseStorage implements IStorage {
  async getTelegramUser(chatId: number): Promise<TelegramUser | undefined> {
    const [user] = await db
      .select()
      .from(telegramUsers)
      .where(eq(telegramUsers.chatId, chatId))
      .limit(1);
    return user;
  }

  async createTelegramUser(user: InsertTelegramUser): Promise<TelegramUser> {
    const [newUser] = await db.insert(telegramUsers).values(user).returning();
    return newUser;
  }

  async updateTelegramUser(chatId: number, data: Partial<InsertTelegramUser>): Promise<TelegramUser | undefined> {
    const [updated] = await db
      .update(telegramUsers)
      .set({ ...data, lastActiveAt: new Date() })
      .where(eq(telegramUsers.chatId, chatId))
      .returning();
    return updated;
  }

  async acceptTerms(chatId: number): Promise<TelegramUser | undefined> {
    const [updated] = await db
      .update(telegramUsers)
      .set({ 
        termsAccepted: true, 
        termsAcceptedAt: new Date(),
        lastActiveAt: new Date()
      })
      .where(eq(telegramUsers.chatId, chatId))
      .returning();
    return updated;
  }

  async hasAcceptedTerms(chatId: number): Promise<boolean> {
    const user = await this.getTelegramUser(chatId);
    return user?.termsAccepted ?? false;
  }

  async saveVolatilityData(data: InsertVolatilityData): Promise<VolatilityDataRecord> {
    const [record] = await db.insert(volatilityData).values(data).returning();
    return record;
  }

  async getLatestVolatility(symbol: string): Promise<VolatilityDataRecord | undefined> {
    const [record] = await db
      .select()
      .from(volatilityData)
      .where(eq(volatilityData.symbol, symbol))
      .orderBy(desc(volatilityData.createdAt))
      .limit(1);
    return record;
  }

  async getVolatilityHistory(symbol: string, limit: number = 100): Promise<VolatilityDataRecord[]> {
    return db
      .select()
      .from(volatilityData)
      .where(eq(volatilityData.symbol, symbol))
      .orderBy(desc(volatilityData.createdAt))
      .limit(limit);
  }

  async getAllLatestVolatility(): Promise<VolatilityDataRecord[]> {
    const symbolsQuery = await db
      .selectDistinct({ symbol: volatilityData.symbol })
      .from(volatilityData);

    const results: VolatilityDataRecord[] = [];
    for (const { symbol } of symbolsQuery) {
      const latest = await this.getLatestVolatility(symbol);
      if (latest) results.push(latest);
    }
    return results;
  }

  async createUserSession(session: InsertUserSession): Promise<UserSessionRecord> {
    const [record] = await db.insert(userSessions).values(session).returning();
    return record;
  }

  async getUserSession(id: string): Promise<UserSessionRecord | undefined> {
    const [session] = await db
      .select()
      .from(userSessions)
      .where(eq(userSessions.id, id))
      .limit(1);
    return session;
  }

  async updateUserSession(id: string, data: Partial<InsertUserSession>): Promise<UserSessionRecord | undefined> {
    const [updated] = await db
      .update(userSessions)
      .set(data)
      .where(eq(userSessions.id, id))
      .returning();
    return updated;
  }

  async getActiveSessionsForChat(chatId: number): Promise<UserSessionRecord[]> {
    return db
      .select()
      .from(userSessions)
      .where(and(
        eq(userSessions.chatId, chatId),
        eq(userSessions.status, "active")
      ));
  }

  async getAllActiveSessions(): Promise<UserSessionRecord[]> {
    return db
      .select()
      .from(userSessions)
      .where(eq(userSessions.status, "active"));
  }

  async saveSignalLog(signal: InsertSignalLog): Promise<SignalLog> {
    const [record] = await db.insert(signalLogs).values(signal).returning();
    return record;
  }

  async getSignalLogs(sessionId: string, limit: number = 100): Promise<SignalLog[]> {
    return db
      .select()
      .from(signalLogs)
      .where(eq(signalLogs.sessionId, sessionId))
      .orderBy(desc(signalLogs.createdAt))
      .limit(limit);
  }

  async saveCandleLog(candle: InsertCandleLog): Promise<CandleLog> {
    const [record] = await db.insert(candleLogs).values(candle).returning();
    return record;
  }

  async getCandleLogs(symbol: string, timeframe: number, limit: number = 300): Promise<CandleLog[]> {
    return db
      .select()
      .from(candleLogs)
      .where(and(
        eq(candleLogs.symbol, symbol),
        eq(candleLogs.timeframe, timeframe)
      ))
      .orderBy(desc(candleLogs.createdAt))
      .limit(limit);
  }

  async getBotStatus() {
    const [usersResult] = await db
      .select({ count: db.$count(telegramUsers) })
      .from(telegramUsers);

    const [activeSessionsResult] = await db
      .select({ count: db.$count(userSessions) })
      .from(userSessions)
      .where(eq(userSessions.status, "active"));

    const [signalsResult] = await db
      .select({ count: db.$count(signalLogs) })
      .from(signalLogs);

    const [termsAcceptedResult] = await db
      .select({ count: db.$count(telegramUsers) })
      .from(telegramUsers)
      .where(eq(telegramUsers.termsAccepted, true));

    const [lastVolatility] = await db
      .select({ createdAt: volatilityData.createdAt })
      .from(volatilityData)
      .orderBy(desc(volatilityData.createdAt))
      .limit(1);

    return {
      totalUsers: usersResult?.count ?? 0,
      activeSessions: activeSessionsResult?.count ?? 0,
      signalsGenerated: signalsResult?.count ?? 0,
      usersAcceptedTerms: termsAcceptedResult?.count ?? 0,
      lastVolatilityUpdate: lastVolatility?.createdAt ?? null,
    };
  }
}

export const storage = new DatabaseStorage();
