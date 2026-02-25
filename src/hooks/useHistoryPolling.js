import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore.js';
import { ASSETS } from '../utils/market.js';
import { BINANCE_SYMBOL_MAP } from '../utils/api.js';

const BINANCE_API = '/api/binance/api/v3';
const RECORD_COUNT = 20;

async function fetchKlineHistory(asset) {
  const symbol = BINANCE_SYMBOL_MAP[asset];
  if (!symbol) return [];

  try {
    const nowMs = Date.now();
    // 取最近 RECORD_COUNT+1 根已收盘的 5 分钟 K 线（+1 因为最后一根可能未收盘）
    const endTime = Math.floor(nowMs / 300_000) * 300_000;
    const startTime = endTime - (RECORD_COUNT + 1) * 300_000;

    const res = await fetch(
      `${BINANCE_API}/klines?symbol=${symbol}&interval=5m&startTime=${startTime}&endTime=${endTime}&limit=${RECORD_COUNT + 1}`
    );
    if (!res.ok) return [];
    const klines = await res.json();
    if (!Array.isArray(klines)) return [];

    // 过滤掉未收盘的 K 线（closeTime > now），取最新 RECORD_COUNT 根
    const closed = klines.filter((k) => k[6] < nowMs);
    const recent = closed.slice(-RECORD_COUNT);

    return recent.map((k) => {
      const openTime = k[0];
      const open = parseFloat(k[1]);
      const close = parseFloat(k[4]);
      const diff = close - open;
      // diff >= 0 视为上涨（包括 0）
      return {
        ts: Math.floor(openTime / 1000),
        result: diff >= 0 ? 'up' : 'down',
        closedTime: new Date(k[6]).toISOString(),
      };
    });
  } catch {
    return [];
  }
}

export function useHistoryPolling() {
  const timer = useRef(null);
  const isRunning = useRef(false);
  const setHistoryCache = useStore((s) => s.setHistoryCache);

  useEffect(() => {
    isRunning.current = true;

    const runHistory = async () => {
      if (!isRunning.current) return;

      const results = await Promise.all(ASSETS.map((a) => fetchKlineHistory(a)));
      for (let i = 0; i < ASSETS.length; i++) {
        if (results[i].length > 0) setHistoryCache(ASSETS[i], results[i]);
      }

      // 下一次刷新：在当前 5 分钟窗口结束后 3 秒
      const nowTs = Math.floor(Date.now() / 1000);
      const nextClose = (Math.floor(nowTs / 300) + 1) * 300;
      const nextMs = Math.max((nextClose - nowTs) * 1000 + 3000, 5000);

      if (isRunning.current) {
        timer.current = setTimeout(runHistory, nextMs);
      }
    };

    runHistory();

    return () => {
      isRunning.current = false;
      if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    };
  }, [setHistoryCache]);
}
