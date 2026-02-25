import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore.js';
import { ASSETS, PRICE_REFRESH_MS, windowsToTrack, LOOK_BACK, LOOK_AHEAD } from '../utils/market.js';
import { fetchCurrentPrice } from '../utils/api.js';

export function usePriceRefresh() {
  const timer = useRef(null);
  const isRunning = useRef(false);
  const setMarket = useStore((s) => s.setMarket);

  useEffect(() => {
    isRunning.current = true;

    const refreshPrices = async () => {
      const windows = windowsToTrack(LOOK_BACK, LOOK_AHEAD);
      const w = windows[0];
      if (w == null) return;

      const prices = await Promise.all(ASSETS.map(fetchCurrentPrice));

      const { marketsCache } = useStore.getState();
      for (let i = 0; i < ASSETS.length; i++) {
        const market = marketsCache[ASSETS[i]]?.[w];
        if (market && prices[i] != null) {
          setMarket(ASSETS[i], w, { ...market, current_price: prices[i] });
        }
      }
    };

    const run = () => {
      if (!isRunning.current) return;
      refreshPrices();
      timer.current = setTimeout(run, PRICE_REFRESH_MS);
    };
    run();

    return () => {
      isRunning.current = false;
      if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    };
  }, [setMarket]);
}
