import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes, setBotStartTime } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { initTelegramBot, setRenderService } from "./telegram/bot";
import { marketMonitor } from "./services/marketMonitor";
import { initRenderService, renderService } from "./services/renderService";
import { storage } from "./storage";
import { createLogger } from "./utils/logger";

const logger = createLogger("Server");
const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

async function initializeBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  
  if (!token) {
    logger.warn("TELEGRAM_BOT_TOKEN not set - bot will not start");
    logger.info("To enable the Telegram bot, set TELEGRAM_BOT_TOKEN in environment variables");
    return;
  }
  
  try {
    logger.info("Initializing render service...");
    await initRenderService();
    setRenderService(renderService);
    logger.info("Render service initialized");
  } catch (error) {
    logger.warn("Failed to initialize render service - charts will be unavailable", error);
  }
  
  logger.info("Starting market monitor...");
  try {
    await marketMonitor.start();
    logger.info("Market monitor started - volatility tracking active");
  } catch (error) {
    logger.error("Failed to start market monitor", error);
  }
  
  logger.info("Initializing Telegram bot...");
  const bot = initTelegramBot(token);
  
  if (bot) {
    logger.info("Telegram bot initialized and polling");
    setBotStartTime(Date.now());
  } else {
    logger.error("Failed to initialize Telegram bot");
  }
}

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
      
      initializeBot().catch((error) => {
        logger.error("Failed to initialize bot services", error);
      });
    },
  );
})();
