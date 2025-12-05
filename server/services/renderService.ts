import puppeteer, { Browser, Page } from "puppeteer";
import { execSync } from "child_process";
import { accessSync } from "fs";
import { createLogger } from "../utils/logger";
import type { Candle, IndicatorValues, SignalResult, ChartRenderRequest } from "@shared/schema";

const logger = createLogger("RenderService");

const CHART_WIDTH = 1200;
const CHART_HEIGHT = 675;

let browser: Browser | null = null;
let page: Page | null = null;
let isInitialized = false;
let initializationPromise: Promise<void> | null = null;

const chartHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      background: #1a1a2e; 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    #chart-container { 
      width: ${CHART_WIDTH}px; 
      height: ${CHART_HEIGHT}px; 
      position: relative;
    }
    #chart { width: 100%; height: 100%; }
    .signal-overlay {
      position: absolute;
      top: 10px;
      right: 10px;
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 18px;
      font-weight: bold;
      color: white;
    }
    .signal-call { background: rgba(16, 185, 129, 0.9); }
    .signal-put { background: rgba(239, 68, 68, 0.9); }
    .signal-no-trade { background: rgba(107, 114, 128, 0.9); }
    .countdown-overlay {
      position: absolute;
      bottom: 10px;
      right: 10px;
      padding: 6px 12px;
      background: rgba(0, 0, 0, 0.7);
      border-radius: 4px;
      font-size: 14px;
      color: #9ca3af;
    }
    .provisional-label {
      position: absolute;
      top: 10px;
      left: 10px;
      padding: 4px 8px;
      background: rgba(251, 191, 36, 0.2);
      border: 1px solid rgba(251, 191, 36, 0.5);
      border-radius: 4px;
      font-size: 12px;
      color: #fbbf24;
    }
  </style>
  <script src="https://unpkg.com/lightweight-charts@4.1.0/dist/lightweight-charts.standalone.production.js"></script>
</head>
<body>
  <div id="chart-container">
    <div id="chart"></div>
  </div>
  <script>
    let chart = null;
    let candleSeries = null;
    let indicators = {};

    function initChart() {
      const container = document.getElementById('chart');
      chart = LightweightCharts.createChart(container, {
        width: ${CHART_WIDTH},
        height: ${CHART_HEIGHT},
        layout: {
          background: { type: 'solid', color: '#1a1a2e' },
          textColor: '#d1d5db',
        },
        grid: {
          vertLines: { color: 'rgba(42, 46, 57, 0.5)' },
          horzLines: { color: 'rgba(42, 46, 57, 0.5)' },
        },
        crosshair: {
          mode: LightweightCharts.CrosshairMode.Normal,
        },
        rightPriceScale: {
          borderColor: 'rgba(42, 46, 57, 0.8)',
        },
        timeScale: {
          borderColor: 'rgba(42, 46, 57, 0.8)',
          timeVisible: true,
          secondsVisible: false,
        },
      });

      candleSeries = chart.addCandlestickSeries({
        upColor: '#10b981',
        downColor: '#ef4444',
        borderUpColor: '#10b981',
        borderDownColor: '#ef4444',
        wickUpColor: '#10b981',
        wickDownColor: '#ef4444',
      });

      return { chart, candleSeries };
    }

    function addIndicator(name, color, data) {
      const series = chart.addLineSeries({
        color: color,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      series.setData(data);
      indicators[name] = series;
    }

    function addBollingerBands(upper, middle, lower) {
      const upperSeries = chart.addLineSeries({
        color: 'rgba(147, 51, 234, 0.5)',
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      upperSeries.setData(upper);

      const middleSeries = chart.addLineSeries({
        color: 'rgba(147, 51, 234, 0.8)',
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      middleSeries.setData(middle);

      const lowerSeries = chart.addLineSeries({
        color: 'rgba(147, 51, 234, 0.5)',
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      lowerSeries.setData(lower);
    }

    function renderChart(data) {
      if (!chart) initChart();

      // Process candles
      const closedCandles = data.candles.map(c => ({
        time: c.timestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));

      // Add forming candle with muted colors if present
      if (data.formingCandle) {
        closedCandles.push({
          time: data.formingCandle.timestamp,
          open: data.formingCandle.open,
          high: data.formingCandle.high,
          low: data.formingCandle.low,
          close: data.formingCandle.close,
        });
      }

      candleSeries.setData(closedCandles);

      // Add indicator overlays
      if (data.indicators) {
        const timestamps = data.candles.map(c => c.timestamp);
        
        // EMA21
        if (data.indicators.ema21 !== undefined) {
          // For simplicity, we'll show a marker. Real implementation would need historical values.
        }
      }

      // Add signal overlay
      const container = document.getElementById('chart-container');
      
      if (data.signal) {
        const signalDiv = document.createElement('div');
        signalDiv.className = 'signal-overlay';
        
        switch (data.signal.direction) {
          case 'CALL':
            signalDiv.className += ' signal-call';
            signalDiv.textContent = 'CALL ' + data.signal.confidence + '%';
            break;
          case 'PUT':
            signalDiv.className += ' signal-put';
            signalDiv.textContent = 'PUT ' + data.signal.confidence + '%';
            break;
          default:
            signalDiv.className += ' signal-no-trade';
            signalDiv.textContent = 'NO TRADE';
        }
        
        container.appendChild(signalDiv);
      }

      if (data.formingCandle) {
        const provLabel = document.createElement('div');
        provLabel.className = 'provisional-label';
        provLabel.textContent = 'PROVISIONAL';
        container.appendChild(provLabel);
      }

      chart.timeScale().fitContent();
    }

    window.renderChart = renderChart;
  </script>
</body>
</html>
`;

async function cleanupBrowser(): Promise<void> {
  try {
    if (page) {
      await page.close().catch(() => {});
      page = null;
    }
    if (browser) {
      await browser.close().catch(() => {});
      browser = null;
    }
  } catch (e) {
    // Ignore cleanup errors
  }
  isInitialized = false;
}

function getChromiumPath(): string | undefined {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  
  const possiblePaths = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
  ];
  
  try {
    const nixPath = execSync('which chromium 2>/dev/null', { encoding: 'utf8' }).trim();
    if (nixPath) return nixPath;
  } catch {}
  
  for (const path of possiblePaths) {
    try {
      accessSync(path);
      return path;
    } catch {}
  }
  
  return undefined;
}

export async function initRenderService(): Promise<void> {
  if (isInitialized && browser && page) return;
  
  if (initializationPromise) {
    return initializationPromise;
  }
  
  initializationPromise = (async () => {
    try {
      await cleanupBrowser();
      
      const executablePath = getChromiumPath();
      logger.info(`Using Chromium at: ${executablePath || 'bundled'}`);
      
      browser = await puppeteer.launch({
        headless: true,
        executablePath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--single-process',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
        ],
      });
      
      page = await browser.newPage();
      await page.setViewport({ width: CHART_WIDTH, height: CHART_HEIGHT });
      await page.setContent(chartHtml);
      
      await page.waitForFunction('window.renderChart !== undefined', { timeout: 10000 });
      
      isInitialized = true;
      logger.info("Render service initialized with Puppeteer");
    } catch (error) {
      logger.error("Failed to initialize render service", error);
      await cleanupBrowser();
      throw error;
    } finally {
      initializationPromise = null;
    }
  })();
  
  return initializationPromise;
}

export async function renderChart(data: ChartRenderRequest): Promise<Buffer> {
  const maxRetries = 2;
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (!isInitialized || !page || !browser) {
        await initRenderService();
      }
      
      if (!page) {
        throw new Error("Render service not available");
      }
      
      // Create a new page for each render to avoid detached frame issues
      const renderPage = await browser!.newPage();
      await renderPage.setViewport({ width: CHART_WIDTH, height: CHART_HEIGHT });
      
      try {
        await renderPage.setContent(chartHtml);
        await renderPage.waitForFunction('window.renderChart !== undefined', { timeout: 5000 });
        
        await renderPage.evaluate((chartData) => {
          (window as unknown as { renderChart: (d: unknown) => void }).renderChart(chartData);
        }, data);
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const screenshot = await renderPage.screenshot({
          type: 'png',
          clip: { x: 0, y: 0, width: CHART_WIDTH, height: CHART_HEIGHT },
        });
        
        await renderPage.close();
        return Buffer.from(screenshot);
      } catch (renderError) {
        await renderPage.close().catch(() => {});
        throw renderError;
      }
    } catch (error) {
      lastError = error as Error;
      const errorMessage = (error as Error).message || '';
      
      // If it's a detached frame or browser issue, reinitialize
      if (errorMessage.includes('detached') || 
          errorMessage.includes('Target closed') ||
          errorMessage.includes('Session closed') ||
          errorMessage.includes('Protocol error')) {
        logger.warn(`Render attempt ${attempt + 1} failed with browser error, reinitializing...`);
        await cleanupBrowser();
        isInitialized = false;
        continue;
      }
      
      // For other errors, don't retry
      logger.error("Failed to render chart", error);
      throw error;
    }
  }
  
  logger.error("Failed to render chart after all retries", lastError);
  throw lastError || new Error("Failed to render chart");
}

export async function closeRenderService(): Promise<void> {
  if (page) {
    await page.close();
    page = null;
  }
  if (browser) {
    await browser.close();
    browser = null;
  }
  isInitialized = false;
  logger.info("Render service closed");
}

export function isRenderServiceInitialized(): boolean {
  return isInitialized;
}

export const renderService = {
  init: initRenderService,
  renderChart,
  close: closeRenderService,
  isInitialized: isRenderServiceInitialized,
};
