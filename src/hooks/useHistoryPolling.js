import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore.js';
import { ASSETS } from '../utils/market.js';

export function useHistoryPolling() {
  const timer = useRef(null);
  const isRunning = useRef(false);
  const setHistoryCache = useStore((s) => s.setHistoryCache);

  useEffect(() => {
    isRunning.current = true;

    const runHistory = async () => {
      if (!isRunning.current) return;

      try {
        const res = await fetch('/api/kline-history');
        if (res.ok) {
          const data = await res.json();
          for (const asset of ASSETS) {
            if (Array.isArray(data[asset]) && data[asset].length > 0) {
              setHistoryCache(asset, data[asset]);
            }
          }
        }
      } catch { /* ignore */ }

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
