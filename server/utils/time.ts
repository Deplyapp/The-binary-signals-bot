import { TIMEZONES, type TimezoneOption } from "@shared/schema";

export function getCandleBoundary(timestamp: number, timeframeSec: number): number {
  return Math.floor(timestamp / timeframeSec) * timeframeSec;
}

export function getCandleCloseTime(timestamp: number, timeframeSec: number): number {
  return getCandleBoundary(timestamp, timeframeSec) + timeframeSec;
}

export function getSecondsUntilClose(timestamp: number, timeframeSec: number): number {
  const closeTime = getCandleCloseTime(timestamp, timeframeSec);
  return closeTime - timestamp;
}

export function isPreCloseWindow(timestamp: number, timeframeSec: number, preCloseSeconds: number): boolean {
  const secondsUntil = getSecondsUntilClose(timestamp, timeframeSec);
  return secondsUntil <= preCloseSeconds && secondsUntil > 0;
}

export function getTimezoneById(timezoneId: string): TimezoneOption | undefined {
  return TIMEZONES.find(tz => tz.id === timezoneId);
}

export function formatTimestampWithTimezone(epochSeconds: number, timezoneId: string = 'UTC'): string {
  const tz = getTimezoneById(timezoneId);
  const offsetMinutes = tz?.offset || 0;
  
  const date = new Date((epochSeconds * 1000) + (offsetMinutes * 60 * 1000));
  
  const hours = date.getUTCHours().toString().padStart(2, '0');
  const minutes = date.getUTCMinutes().toString().padStart(2, '0');
  const seconds = date.getUTCSeconds().toString().padStart(2, '0');
  const day = date.getUTCDate().toString().padStart(2, '0');
  const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const year = date.getUTCFullYear();
  
  const tzLabel = tz ? tz.id : 'UTC';
  
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds} ${tzLabel}`;
}

export function formatTimeOnlyWithTimezone(epochSeconds: number, timezoneId: string = 'UTC'): string {
  const tz = getTimezoneById(timezoneId);
  const offsetMinutes = tz?.offset || 0;
  
  const date = new Date((epochSeconds * 1000) + (offsetMinutes * 60 * 1000));
  
  const hours = date.getUTCHours().toString().padStart(2, '0');
  const minutes = date.getUTCMinutes().toString().padStart(2, '0');
  const seconds = date.getUTCSeconds().toString().padStart(2, '0');
  
  const tzLabel = tz ? tz.id : 'UTC';
  
  return `${hours}:${minutes}:${seconds} ${tzLabel}`;
}

export function formatTimestamp(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString();
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

export function nowEpoch(): number {
  return Math.floor(Date.now() / 1000);
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function createTimer(callback: () => void, intervalMs: number): { start: () => void; stop: () => void } {
  let timerId: ReturnType<typeof setInterval> | null = null;
  
  return {
    start: () => {
      if (!timerId) {
        timerId = setInterval(callback, intervalMs);
      }
    },
    stop: () => {
      if (timerId) {
        clearInterval(timerId);
        timerId = null;
      }
    },
  };
}

export function scheduleAt(epochSeconds: number, callback: () => void): ReturnType<typeof setTimeout> {
  const now = nowEpoch();
  const delayMs = Math.max(0, (epochSeconds - now) * 1000);
  return setTimeout(callback, delayMs);
}

export function getCurrentTimeInTimezone(timezoneId: string = 'UTC'): { hours: number; minutes: number; seconds: number } {
  const tz = getTimezoneById(timezoneId);
  const offsetMinutes = tz?.offset || 0;
  
  const now = new Date();
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
  const tzTime = new Date(utcTime + (offsetMinutes * 60000));
  
  return {
    hours: tzTime.getHours(),
    minutes: tzTime.getMinutes(),
    seconds: tzTime.getSeconds(),
  };
}
