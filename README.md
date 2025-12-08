# Telegram Trading Signal Bot

A sophisticated algorithmic trading signal bot for Telegram that provides real-time market analysis using 35+ technical indicators, volatility detection, and beautiful chart rendering.

## Features

### Technical Analysis Engine
- **35+ Technical Indicators**: Comprehensive analysis using EMA, SMA, MACD, RSI, Bollinger Bands, Stochastic, ADX, CCI, Williams %R, Keltner Channels, Hull MA, SuperTrend, and more
- **Candlestick Pattern Recognition**: Automatic detection of bullish/bearish patterns (Doji, Hammer, Engulfing, Morning Star, etc.)
- **Multi-Indicator Voting System**: Weighted voting from all indicators to generate high-confidence signals
- **Psychology Analysis**: Order block probability, Fair Value Gap (FVG) detection, and market sentiment analysis

### Signal Generation
- **CALL/PUT/NO_TRADE Signals**: Clear directional signals with confidence percentages
- **Confidence Filtering**: Customizable threshold (80%, 90%, 95%) to filter low-confidence signals
- **Volatility Override**: Automatic signal suppression during high-volatility conditions
- **Entry Price Tracking**: Signals include entry points for trade tracking

### Market Monitoring
- **Real-Time Price Streaming**: WebSocket connection to Deriv API for live tick data
- **Multi-Timeframe Support**: 1M, 5M, 15M, and 30M candle timeframes
- **Currency Pairs**: EUR/USD, GBP/USD, USD/JPY, AUD/USD, and more forex pairs
- **Volatility Detection**: Real-time market stability analysis with recommendations

### Visual Features
- **Dynamic Chart Rendering**: Professional candlestick charts with technical overlays using Puppeteer
- **Signal Images**: Beautiful, branded signal images generated using Canvas
- **Win/Loss Statistics**: Visual representation of session performance
- **Best Pair Suggestions**: Visual cards showing most stable trading pairs

### Session Management
- **User Sessions**: Each user can run independent trading sessions
- **Timezone Support**: 12 timezone options (UTC, IST, EST, PST, GMT, JST, AEST, CET, SGT, HKT, MSK, BRT)
- **Persistent Preferences**: User settings stored in PostgreSQL database
- **Win/Loss Tracking**: Automatic outcome tracking and statistics

## Tech Stack

- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL with Drizzle ORM
- **Telegram**: node-telegram-bot-api
- **Chart Rendering**: Puppeteer with LightweightCharts
- **Image Generation**: node-canvas
- **Technical Indicators**: technicalindicators library
- **Task Scheduling**: node-cron

## Quick Start

### Prerequisites

- Node.js 18+ (recommended: Node.js 20)
- PostgreSQL database
- Telegram Bot Token (from [@BotFather](https://t.me/BotFather))

### Environment Variables

Create a `.env` file or set these environment variables:

```env
# Required
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
DATABASE_URL=postgresql://user:password@host:port/database

# Optional (auto-generated if using Replit's built-in database)
PGHOST=your_pg_host
PGPORT=5432
PGUSER=your_pg_user
PGPASSWORD=your_pg_password
PGDATABASE=your_pg_database

# Optional
SESSION_SECRET=your_session_secret
```

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Deplyapp/Sop.git
   cd Sop
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up the database:**
   ```bash
   npm run db:push
   ```

4. **Start the bot:**
   ```bash
   npm run dev
   ```

## Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Start the bot and see terms of service |
| `/help` | Get help and usage information |
| `/settings` | Configure timezone and confidence filter |
| `/status` | Check current session status |
| `/best` | Get best trading pair suggestions |

## How It Works

### 1. Session Setup
1. User starts the bot with `/start`
2. Accept terms of service
3. Select a currency pair (e.g., EUR/USD)
4. Choose a timeframe (1M, 5M, 15M, 30M)
5. Configure preferences (timezone, confidence filter)

### 2. Signal Generation Process
1. **Data Collection**: Real-time price ticks from Deriv API
2. **Candle Formation**: Aggregation into OHLC candles
3. **Indicator Calculation**: All 35+ indicators computed
4. **Pattern Detection**: Candlestick patterns identified
5. **Voting**: Each indicator votes UP/DOWN/NEUTRAL with weight
6. **Confidence Scoring**: Aggregate confidence calculated
7. **Volatility Check**: Signal suppressed if market unstable
8. **Signal Delivery**: Image + text sent to user

### 3. Signal Types

- **CALL (Green)**: Buy/Long signal with high confidence
- **PUT (Red)**: Sell/Short signal with high confidence
- **NO_TRADE (Gray)**: Market conditions not favorable

## Deployment

### Deploy on Replit

1. Fork this repl or import from GitHub
2. Add `TELEGRAM_BOT_TOKEN` to Secrets
3. Database is auto-provisioned
4. Click "Run" to start

### Deploy on Koyeb

1. Create a new Koyeb app
2. Connect your GitHub repository
3. Set build command: `npm install && npm run build`
4. Set run command: `npm start`
5. Add environment variables:
   - `TELEGRAM_BOT_TOKEN`
   - `DATABASE_URL` (use Koyeb's PostgreSQL or external)
6. Deploy

### Deploy on Render

1. Create a new Web Service on Render
2. Connect your GitHub repository
3. Set build command: `npm install && npm run build`
4. Set start command: `npm start`
5. Add environment variables in Render dashboard
6. Deploy

### Deploy with Docker

```bash
# Build the image
docker build -t trading-bot .

# Run with environment variables
docker run -d \
  -e TELEGRAM_BOT_TOKEN=your_token \
  -e DATABASE_URL=your_database_url \
  -p 5000:5000 \
  trading-bot
```

## Project Structure

```
├── server/
│   ├── telegram/
│   │   ├── bot.ts           # Bot initialization
│   │   ├── handlers.ts      # Command and callback handlers
│   │   └── keyboards.ts     # Telegram inline keyboards
│   ├── services/
│   │   ├── marketMonitor.ts # Real-time price monitoring
│   │   ├── sessionManager.ts # User session management
│   │   ├── signalEngine.ts  # Signal generation logic
│   │   ├── volatilityService.ts # Market volatility analysis
│   │   ├── renderService.ts # Chart rendering with Puppeteer
│   │   ├── imageGenerator.ts # Canvas-based images
│   │   └── winLossTracker.ts # Trade outcome tracking
│   ├── analysis/
│   │   ├── indicators.ts    # Technical indicator calculations
│   │   ├── candlePatterns.ts # Pattern recognition
│   │   └── psychologyAnalysis.ts # Market psychology
│   ├── utils/
│   │   ├── logger.ts        # Logging utility
│   │   ├── timeUtils.ts     # Time/timezone helpers
│   │   └── derivTypes.ts    # Deriv API types
│   ├── db.ts                # Database connection
│   ├── storage.ts           # Data access layer
│   ├── routes.ts            # API routes
│   └── index.ts             # Server entry point
├── shared/
│   └── schema.ts            # Database schema & types
├── client/                  # Frontend (status page)
├── Dockerfile               # Docker configuration
├── package.json
└── README.md
```

## Configuration

### Supported Assets

#### Forex Pairs (Available Mon-Fri)
| Pair | Symbol ID | Category |
|------|-----------|----------|
| EUR/USD | frxEURUSD | Forex |
| GBP/USD | frxGBPUSD | Forex |
| USD/JPY | frxUSDJPY | Forex |
| AUD/USD | frxAUDUSD | Forex |
| EUR/GBP | frxEURGBP | Forex |
| USD/CAD | frxUSDCAD | Forex |
| NZD/USD | frxNZDUSD | Forex |
| USD/CHF | frxUSDCHF | Forex |
| GBP/JPY | frxGBPJPY | Forex |
| EUR/JPY | frxEURJPY | Forex |
| AUD/JPY | frxAUDJPY | Forex |
| EUR/AUD | frxEURAUD | Forex |

#### Cryptocurrencies (24/7)
| Pair | Symbol ID | Category |
|------|-----------|----------|
| BTC/USD | cryBTCUSD | Crypto |
| ETH/USD | cryETHUSD | Crypto |

#### Synthetic Indices (24/7)
| Index | Symbol ID | Category |
|-------|-----------|----------|
| Volatility 10 | R_10 | Synthetic |
| Volatility 25 | R_25 | Synthetic |
| Volatility 50 | R_50 | Synthetic |
| Volatility 75 | R_75 | Synthetic |
| Volatility 100 | R_100 | Synthetic |
| Volatility 10 (1s) | 1HZ10V | Synthetic |
| Volatility 25 (1s) | 1HZ25V | Synthetic |
| Volatility 50 (1s) | 1HZ50V | Synthetic |
| Volatility 75 (1s) | 1HZ75V | Synthetic |
| Volatility 100 (1s) | 1HZ100V | Synthetic |

### Timeframes

| Label | Duration |
|-------|----------|
| 1M | 60 seconds |
| 5M | 300 seconds |
| 15M | 900 seconds |
| 30M | 1800 seconds |

### Technical Indicators

**Trend Indicators:**
- EMA (5, 9, 12, 21, 50)
- SMA (20, 50, 200)
- Hull Moving Average
- SuperTrend
- Parabolic SAR
- Linear Regression Slope

**Momentum Indicators:**
- RSI (14)
- MACD
- Stochastic Oscillator
- CCI
- Williams %R
- Ultimate Oscillator
- Rate of Change (ROC)
- Momentum

**Volatility Indicators:**
- Bollinger Bands
- Keltner Channels
- ATR (14)
- Donchian Channels
- ATR Bands

**Volume Indicators:**
- OBV
- VWAP
- Chaikin Oscillator

**Custom:**
- Mean Reversion Z-Score
- Range Percentile
- EMA Ribbon
- Fisher Transform

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/status` | GET | Bot status and statistics |
| `/api/health` | GET | Health check |

## Troubleshooting

### Chart Rendering Issues

If charts aren't rendering:
1. Ensure Chromium is installed
2. Check Puppeteer has correct launch args:
   ```typescript
   puppeteer.launch({
     executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
     args: ['--no-sandbox', '--disable-setuid-sandbox']
   })
   ```

### Database Connection Issues

1. Verify `DATABASE_URL` is correct
2. Ensure PostgreSQL is running
3. Run `npm run db:push` to sync schema

### Bot Not Responding

1. Check `TELEGRAM_BOT_TOKEN` is valid
2. Verify bot is not blocked/stopped in Telegram
3. Check server logs for errors

## Recent Updates (December 2024)

### Bug Fixes
- **Chart Rendering Fixed**: Added data validation, deduplication, and sorting to prevent blank charts
- **Database Schema Sync**: Fixed missing `telegram_users` table error with proper schema push
- **Telegram Error Handling**: Added comprehensive try-catch for all callback handlers to prevent server crashes
- **Chromium Installation**: Added system Chromium package for Puppeteer chart rendering

### New Features
- **Candle Completion Trigger**: Signals are now sent when candles close, not before
- **Multi-Timeframe Analysis**: Higher timeframe confluence scoring (up to 15% confidence bonus)
- **Harmonic Pattern Detection**: Gartley, Butterfly, Bat, Crab, Cypher patterns
- **Chart Pattern Detection**: Head & Shoulders, Double Top/Bottom, Triangles, Flags, Wedges
- **Expanded Candlestick Patterns**: 15+ new patterns including Three White Soldiers, Inside Bar, etc.
- **Advanced ML Ensemble**: 100+ strategies with machine learning integration

### Docker Requirements
The Dockerfile includes all necessary system packages:
- **Chromium**: For Puppeteer-based chart rendering
- **Cairo/Pango**: For node-canvas image generation
- **librsvg**: For SVG rendering
- **Build tools**: For native module compilation

## License

MIT License - see LICENSE file for details.

## Acknowledgments

- [Deriv API](https://api.deriv.com/) for real-time market data
- [LightweightCharts](https://github.com/nicktendo64/lightweight-charts) for chart rendering
- [technicalindicators](https://github.com/nicktendo64/technical-indicators) for indicator calculations

## Support

For issues and feature requests, please open a GitHub issue.

---

Made with trading algorithms and caffeine
