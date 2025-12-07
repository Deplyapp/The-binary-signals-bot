# Telegram Trading Signal Bot

A sophisticated algorithmic trading signal bot for Telegram that provides real-time market analysis.

## Overview

This bot monitors forex markets in real-time and generates trading signals using 35+ technical indicators. It's designed for binary options/forex traders who need quick, data-driven signals.

## Project Architecture

```
├── server/                    # Backend code
│   ├── telegram/             # Telegram bot logic
│   │   ├── bot.ts           # Bot initialization and setup
│   │   ├── handlers.ts      # Message and callback handlers
│   │   └── keyboards.ts     # Inline keyboard layouts
│   ├── services/            # Core services
│   │   ├── marketMonitor.ts # WebSocket price streaming
│   │   ├── sessionManager.ts # User session handling
│   │   ├── signalEngine.ts  # Signal generation
│   │   ├── volatilityService.ts # Market volatility analysis
│   │   ├── renderService.ts # Chart rendering with Puppeteer
│   │   ├── imageGenerator.ts # Canvas-based signal images
│   │   └── winLossTracker.ts # Trade outcome tracking
│   ├── analysis/            # Technical analysis
│   │   ├── indicators.ts    # 35+ indicator calculations
│   │   ├── candlePatterns.ts # Pattern recognition
│   │   └── psychologyAnalysis.ts # Market psychology
│   ├── utils/               # Utilities
│   ├── db.ts               # Database connection
│   ├── storage.ts          # Data access layer
│   ├── routes.ts           # Express API routes
│   └── index.ts            # Server entry point
├── shared/
│   └── schema.ts           # Database schema and types
├── client/                  # Frontend status page
└── Dockerfile              # Docker deployment config
```

## Key Technologies

- **Node.js + TypeScript**: Runtime and type safety
- **Express.js**: HTTP server and API
- **PostgreSQL + Drizzle ORM**: Database and migrations
- **Puppeteer**: Browser-based chart rendering
- **node-canvas**: Signal image generation
- **node-telegram-bot-api**: Telegram integration
- **technicalindicators**: TA library
- **WebSocket**: Real-time price streaming from Deriv API

## Running the Project

### Development
```bash
npm run dev
```

### Production
```bash
npm run build
npm start
```

### Database
```bash
npm run db:push   # Push schema to database
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes | Bot token from @BotFather |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SESSION_SECRET` | No | Express session secret |

## Important Notes

1. **Chart Rendering**: Uses Puppeteer with system Chromium. Set `PUPPETEER_EXECUTABLE_PATH` if needed.

2. **Database**: All tables use UUID primary keys. Never change ID column types.

3. **Signal Generation**: Signals are generated before each candle closes. The confidence threshold filters low-quality signals.

4. **Volatility Protection**: The bot automatically detects volatile markets and suggests safer pairs.

## Recent Changes

- Cloned from https://github.com/Deplyapp/fi.git
- **Fixed chart rendering blank issue** (December 2024):
  - Wait for LightweightCharts library to fully load from CDN
  - Added `isChartReady()` function to verify chart data is rendered
  - Increased rendering delay from 500ms to 800ms
  - Added retry logic for network/timeout errors
  - Use `networkidle0` wait strategy for reliable CDN loading
- Fixed TypeScript configuration with ES2020 target and downlevelIteration
- Installed system dependencies: Chromium, Cairo, Pango, libuuid, pixman
- Bot now running successfully with Puppeteer chart rendering

### Major Enhancements (December 2024)

1. **Candle Completion Trigger System**:
   - Signals are now sent WHEN candles close, not before
   - Uses candleAggregator "closed" event listener for precise timing
   - Ensures analysis is based on complete candle data

2. **Multi-Timeframe Analysis Engine** (`multiTimeframeEngine.ts`):
   - Higher timeframe confluence scoring adds confidence bonus (up to 15%)
   - Timeframe mapping: 1M->5M/15M, 5M->15M/30M, 15M->30M/1H
   - Analyzes EMA trends, MACD, RSI, Supertrend on higher timeframes
   - MTF alignment ADDS to confidence, never blocks signals

3. **Expanded Candlestick Pattern Detection** (15+ new patterns):
   - Three White Soldiers, Three Black Crows
   - Inside Bar, Outside Bar
   - Tweezer Top/Bottom
   - Rising/Falling Three Methods
   - Piercing Line, Dark Cloud Cover
   - Bullish/Bearish Harami
   - Inverted Hammer, Hanging Man

4. **Harmonic Pattern Recognition** (`advancedPatterns.ts`):
   - Gartley, Butterfly, Bat, Crab, Cypher patterns
   - Fibonacci ratio validation with tolerance
   - Each pattern adds votes to signal generation

5. **Chart Pattern Detection**:
   - Head & Shoulders, Inverse Head & Shoulders
   - Double Top, Double Bottom
   - Ascending/Descending/Symmetrical Triangles
   - Bull/Bear Flags
   - Rising/Falling Wedges

## Signal Engine Architecture

The signal engine now uses a voting system combining:
- 35+ technical indicators (original)
- 22+ candlestick patterns (expanded)
- 5 harmonic patterns
- 10+ chart patterns
- Multi-timeframe confluence bonuses

All pattern detections ADD to the voting pool for MORE frequent high-confidence signals.

## Chart Rendering Flow

1. Puppeteer creates a new page for each chart render
2. Waits for LightweightCharts library to load from CDN
3. Calls `renderChart()` with candle data and signal info
4. Waits for `isChartReady()` to return true (data rendered)
5. Additional 800ms delay for visual rendering
6. Takes screenshot and returns PNG buffer
