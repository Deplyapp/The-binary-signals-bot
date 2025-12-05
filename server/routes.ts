import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";

let botStartTime: number = Date.now();

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  app.get("/api/bot/status", async (_req: Request, res: Response) => {
    try {
      const status = await storage.getBotStatus();
      const volatilityRecords = await storage.getAllLatestVolatility();
      
      const uptimeSeconds = Math.floor((Date.now() - botStartTime) / 1000);
      
      res.json({
        status: "running",
        uptime: uptimeSeconds,
        totalUsers: status.totalUsers,
        activeSessions: status.activeSessions,
        signalsGenerated: status.signalsGenerated,
        usersAcceptedTerms: status.usersAcceptedTerms,
        lastVolatilityUpdate: status.lastVolatilityUpdate?.toISOString() || null,
        volatilityData: volatilityRecords.map(v => ({
          symbol: v.symbol,
          volatilityScore: v.volatilityScore,
          isStable: v.isStable,
          severity: v.severity,
        })),
      });
    } catch (error) {
      console.error("Failed to get bot status:", error);
      res.status(500).json({ error: "Failed to get bot status" });
    }
  });

  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ 
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - botStartTime) / 1000),
    });
  });

  app.get("/api/volatility/:symbol", async (req: Request, res: Response) => {
    try {
      const { symbol } = req.params;
      const data = await storage.getLatestVolatility(symbol);
      
      if (!data) {
        res.status(404).json({ error: "Volatility data not found" });
        return;
      }
      
      res.json(data);
    } catch (error) {
      console.error("Failed to get volatility:", error);
      res.status(500).json({ error: "Failed to get volatility data" });
    }
  });

  app.get("/api/volatility", async (_req: Request, res: Response) => {
    try {
      const data = await storage.getAllLatestVolatility();
      res.json(data);
    } catch (error) {
      console.error("Failed to get volatility:", error);
      res.status(500).json({ error: "Failed to get volatility data" });
    }
  });

  return httpServer;
}

export function setBotStartTime(time: number) {
  botStartTime = time;
}
