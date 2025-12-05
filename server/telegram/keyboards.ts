import type { Asset, TimezoneOption, ConfidenceFilter } from "@shared/schema";
import { TIMEZONES } from "@shared/schema";
import { TIMEFRAMES, getAssetDisplayName, getCategoryHeader } from "../config/assets";
import { EMOJIS, getConfidenceEmoji } from "../config/emojis";

export interface InlineButton {
  text: string;
  callback_data: string;
}

export interface InlineKeyboard {
  inline_keyboard: InlineButton[][];
}

export function createStartKeyboard(): InlineKeyboard {
  return {
    inline_keyboard: [
      [{ text: `${EMOJIS.ROCKET} Begin Trading Session`, callback_data: "begin" }],
      [{ text: `${EMOJIS.STAR} Best Pair Suggestion`, callback_data: "best_pair" }]
    ]
  };
}

export function createAssetKeyboard(assets: Asset[]): InlineKeyboard {
  const rows: InlineButton[][] = [];
  
  const forexAssets = assets.filter(a => a.category === "forex");
  const syntheticAssets = assets.filter(a => a.category === "synthetic");
  const cryptoAssets = assets.filter(a => a.category === "crypto");
  
  if (forexAssets.length > 0) {
    rows.push([{ text: `${EMOJIS.FOREX} FOREX`, callback_data: "header_forex" }]);
    for (let i = 0; i < forexAssets.length; i += 2) {
      const row: InlineButton[] = [];
      row.push({ 
        text: getAssetDisplayName(forexAssets[i]), 
        callback_data: `asset:${forexAssets[i].id}` 
      });
      if (forexAssets[i + 1]) {
        row.push({ 
          text: getAssetDisplayName(forexAssets[i + 1]), 
          callback_data: `asset:${forexAssets[i + 1].id}` 
        });
      }
      rows.push(row);
    }
  }
  
  if (syntheticAssets.length > 0) {
    rows.push([{ text: `${EMOJIS.SYNTHETIC} SYNTHETIC INDICES`, callback_data: "header_synthetic" }]);
    for (let i = 0; i < syntheticAssets.length; i += 2) {
      const row: InlineButton[] = [];
      row.push({ 
        text: getAssetDisplayName(syntheticAssets[i]), 
        callback_data: `asset:${syntheticAssets[i].id}` 
      });
      if (syntheticAssets[i + 1]) {
        row.push({ 
          text: getAssetDisplayName(syntheticAssets[i + 1]), 
          callback_data: `asset:${syntheticAssets[i + 1].id}` 
        });
      }
      rows.push(row);
    }
  }
  
  if (cryptoAssets.length > 0) {
    rows.push([{ text: `${EMOJIS.CRYPTO} CRYPTO`, callback_data: "header_crypto" }]);
    for (let i = 0; i < cryptoAssets.length; i += 2) {
      const row: InlineButton[] = [];
      row.push({ 
        text: getAssetDisplayName(cryptoAssets[i]), 
        callback_data: `asset:${cryptoAssets[i].id}` 
      });
      if (cryptoAssets[i + 1]) {
        row.push({ 
          text: getAssetDisplayName(cryptoAssets[i + 1]), 
          callback_data: `asset:${cryptoAssets[i + 1].id}` 
        });
      }
      rows.push(row);
    }
  }
  
  rows.push([{ text: `${EMOJIS.ERROR} Cancel`, callback_data: "cancel" }]);
  
  return { inline_keyboard: rows };
}

export function createTimeframeKeyboard(assetId: string): InlineKeyboard {
  const rows: InlineButton[][] = [];
  
  const mainTimeframes = TIMEFRAMES.slice(0, 3);
  rows.push(
    mainTimeframes.map(tf => ({
      text: `${tf.emoji} ${tf.label}`,
      callback_data: `timeframe:${assetId}:${tf.value}`
    }))
  );
  
  const otherTimeframes = TIMEFRAMES.slice(3);
  if (otherTimeframes.length > 0) {
    rows.push(
      otherTimeframes.map(tf => ({
        text: `${tf.emoji} ${tf.label}`,
        callback_data: `timeframe:${assetId}:${tf.value}`
      }))
    );
  }
  
  rows.push([
    { text: `${EMOJIS.REFRESH} Back to Assets`, callback_data: "begin" },
    { text: `${EMOJIS.ERROR} Cancel`, callback_data: "cancel" }
  ]);
  
  return { inline_keyboard: rows };
}

export function createTimezoneKeyboard(): InlineKeyboard {
  const rows: InlineButton[][] = [];
  
  for (let i = 0; i < TIMEZONES.length; i += 2) {
    const row: InlineButton[] = [];
    const tz = TIMEZONES[i];
    row.push({
      text: `${tz.emoji} ${tz.id}`,
      callback_data: `timezone:${tz.id}`
    });
    if (TIMEZONES[i + 1]) {
      const tz2 = TIMEZONES[i + 1];
      row.push({
        text: `${tz2.emoji} ${tz2.id}`,
        callback_data: `timezone:${tz2.id}`
      });
    }
    rows.push(row);
  }
  
  rows.push([{ text: `${EMOJIS.ERROR} Cancel`, callback_data: "cancel" }]);
  
  return { inline_keyboard: rows };
}

export function createConfidenceFilterKeyboard(currentFilter?: ConfidenceFilter): InlineKeyboard {
  const filters: { value: ConfidenceFilter; label: string }[] = [
    { value: 80, label: `${EMOJIS.TARGET} Above 80%` },
    { value: 90, label: `${EMOJIS.STAR} Above 90%` },
    { value: 95, label: `${EMOJIS.DIAMOND} Above 95%` },
  ];
  
  const rows: InlineButton[][] = [];
  
  rows.push(
    filters.map(f => ({
      text: currentFilter === f.value ? `${EMOJIS.SUCCESS} ${f.label}` : f.label,
      callback_data: `confidence:${f.value}`
    }))
  );
  
  rows.push([{ text: `${EMOJIS.REFRESH} Continue`, callback_data: "confidence_done" }]);
  
  return { inline_keyboard: rows };
}

export function createSettingsKeyboard(timezone: string, confidenceFilter: ConfidenceFilter): InlineKeyboard {
  const tz = TIMEZONES.find(t => t.id === timezone) || TIMEZONES[0];
  
  return {
    inline_keyboard: [
      [
        { text: `${EMOJIS.TIMEZONE} Timezone: ${tz.emoji} ${tz.id}`, callback_data: "change_timezone" }
      ],
      [
        { text: `${getConfidenceEmoji(confidenceFilter)} Filter: ${confidenceFilter}%+`, callback_data: "change_confidence" }
      ],
      [
        { text: `${EMOJIS.SUCCESS} Done`, callback_data: "settings_done" }
      ]
    ]
  };
}

export function createConfirmSessionKeyboard(assetId: string, timeframe: number): InlineKeyboard {
  return {
    inline_keyboard: [
      [{ 
        text: `${EMOJIS.ROCKET} Start Session`, 
        callback_data: `start_session:${assetId}:${timeframe}` 
      }],
      [
        { text: `${EMOJIS.SETTINGS} Settings`, callback_data: `settings:${assetId}:${timeframe}` }
      ],
      [
        { text: `${EMOJIS.CLOCK} Change Timeframe`, callback_data: `asset:${assetId}` },
        { text: `${EMOJIS.FOREX} Change Asset`, callback_data: "begin" }
      ],
      [{ text: `${EMOJIS.ERROR} Cancel`, callback_data: "cancel" }]
    ]
  };
}

export function createSessionControlKeyboard(sessionId: string): InlineKeyboard {
  return {
    inline_keyboard: [
      [
        { text: `${EMOJIS.INFO} View Status`, callback_data: `view:${sessionId}` },
        { text: `${EMOJIS.STOP} Stop Session`, callback_data: `stop:${sessionId}` }
      ],
      [
        { text: `${EMOJIS.SETTINGS} Settings`, callback_data: `session_settings:${sessionId}` }
      ]
    ]
  };
}

export function createSignalActionKeyboard(sessionId: string): InlineKeyboard {
  return {
    inline_keyboard: [
      [
        { text: `${EMOJIS.CHART} Show Chart`, callback_data: `chart:${sessionId}` }
      ],
      [
        { text: `${EMOJIS.INFO} View Session`, callback_data: `view:${sessionId}` },
        { text: `${EMOJIS.REFRESH} Re-run Signal`, callback_data: `rerun:${sessionId}` }
      ],
      [
        { text: `${EMOJIS.STOP} Stop Session`, callback_data: `stop:${sessionId}` }
      ]
    ]
  };
}

export function createStoppedSessionKeyboard(): InlineKeyboard {
  return {
    inline_keyboard: [
      [{ text: `${EMOJIS.ROCKET} Start New Session`, callback_data: "begin" }]
    ]
  };
}

export function createVolatilityWarningKeyboard(assetId: string, suggestedPairs: string[]): InlineKeyboard {
  const rows: InlineButton[][] = [];
  
  rows.push([{ text: `${EMOJIS.WARNING} High Volatility Warning`, callback_data: "header_volatility" }]);
  
  if (suggestedPairs.length > 0) {
    rows.push([{ text: `${EMOJIS.STAR} Suggested Stable Pairs:`, callback_data: "header_suggestions" }]);
    for (let i = 0; i < Math.min(suggestedPairs.length, 4); i += 2) {
      const row: InlineButton[] = [];
      row.push({ 
        text: `${EMOJIS.VOLATILITY_SAFE} ${suggestedPairs[i]}`, 
        callback_data: `asset:${suggestedPairs[i]}` 
      });
      if (suggestedPairs[i + 1]) {
        row.push({ 
          text: `${EMOJIS.VOLATILITY_SAFE} ${suggestedPairs[i + 1]}`, 
          callback_data: `asset:${suggestedPairs[i + 1]}` 
        });
      }
      rows.push(row);
    }
  }
  
  rows.push([
    { text: `${EMOJIS.LIGHTNING} Continue Anyway`, callback_data: `asset_confirmed:${assetId}` },
    { text: `${EMOJIS.REFRESH} Choose Another`, callback_data: "begin" }
  ]);
  
  return { inline_keyboard: rows };
}

export function createChartViewKeyboard(sessionId: string): InlineKeyboard {
  return {
    inline_keyboard: [
      [
        { text: `${EMOJIS.REFRESH} Refresh Chart`, callback_data: `chart:${sessionId}` }
      ],
      [
        { text: `${EMOJIS.INFO} Back to Session`, callback_data: `view:${sessionId}` }
      ]
    ]
  };
}

export function createTermsKeyboard(): InlineKeyboard {
  return {
    inline_keyboard: [
      [
        { text: `${EMOJIS.SUCCESS} I Accept the Terms`, callback_data: "accept_terms" }
      ],
      [
        { text: `${EMOJIS.ERROR} I Decline`, callback_data: "decline_terms" }
      ]
    ]
  };
}
