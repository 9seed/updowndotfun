import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore.js';
import { ASSETS, PRICE_REFRESH_MS, windowsToTrack, LOOK_BACK, LOOK_AHEAD } from '../utils/market.js';
import { fetchAllPrices } from '../utils/api.js';

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

      const prices = await fetchAllPrices();
      if (!prices) return;

      const { marketsCache } = useStore.getState();
      for (const asset of ASSETS) {
        const market = marketsCache[asset]?.[w];
        if (market && prices[asset] != null) {
          setMarket(asset, w, { ...market, current_price: prices[asset] });
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
