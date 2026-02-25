import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '../store/useStore.js';
import {
  ASSETS, LOOK_BACK, LOOK_AHEAD, REFRESH_SEC,
  windowsToTrack, buildSlug, parseMarket,
} from '../utils/market.js';
import {
  fetchMarketBySlug, fetchOrderBook, fetchCurrentPrice, fetchPriceToBeat,
} from '../utils/api.js';

export function useMarketRefresh(wsRef) {
  const refreshTimer = useRef(null);
  const lastKnownWindow = useRef(null);
  const lastSubscribedIds = useRef(new Set());
  const isRunning = useRef(false);

  const setMarket = useStore((s) => s.setMarket);
  const setOrderBook = useStore((s) => s.setOrderBook);
  const pushTradeHistoryPoint = useStore((s) => s.pushTradeHistoryPoint);
  const resetForNewWindow = useStore((s) => s.resetForNewWindow);

  const refresh = useCallback(async () => {
    const windows = windowsToTrack(LOOK_BACK, LOOK_AHEAD);
    const currentWindow = windows[0] ?? null;

    if (lastKnownWindow.current !== null && currentWindow !== null && currentWindow !== lastKnownWindow.current) {
      // 窗口已切换：清理旧窗口缓存数据，保留 MetaMask 会话，然后继续加载新窗口
      lastKnownWindow.current = currentWindow;
      lastSubscribedIds.current.clear();
      resetForNewWindow(currentWindow);
    }

    // Fetch all market data in parallel
    const marketResults = await Promise.all(
      windows.flatMap((windowTs) =>
        ASSETS.map(async (asset) => {
          const raw = await fetchMarketBySlug(buildSlug(windowTs, asset));
          return { asset, windowTs, raw };
        })
      )
    );

    const orderBookPromises = [];
    const pricePromises = [];
    const { marketsCache } = useStore.getState();

    for (const { asset, windowTs, raw } of marketResults) {
      if (raw) {
        const oldMarket = marketsCache[asset]?.[windowTs];
        const cachedPtb = oldMarket?.price_to_beat ?? null;
        const market = parseMarket(raw, windowTs, asset);
        if (cachedPtb != null) market.price_to_beat = cachedPtb;
        setMarket(asset, windowTs, market);
        if (lastKnownWindow.current == null) lastKnownWindow.current = windowTs;

        for (let i = 0; i < market.token_ids.length; i++) {
          const tokenId = market.token_ids[i];
          orderBookPromises.push(
            fetchOrderBook(tokenId).then((ob) => ({ tokenId, ob }))
          );
        }

        if (cachedPtb != null) {
          pricePromises.push(
            fetchCurrentPrice(asset).then((curr) => ({
              asset, windowTs, priceToBeat: cachedPtb, currentPrice: curr,
            }))
          );
        } else {
          pricePromises.push(
            Promise.all([
              market.event_start_time ? fetchPriceToBeat(asset, market.event_start_time) : Promise.resolve(null),
              fetchCurrentPrice(asset),
            ]).then(([ptb, curr]) => ({ asset, windowTs, priceToBeat: ptb, currentPrice: curr }))
          );
        }
      } else {
        const cur = useStore.getState().marketsCache[asset]?.[windowTs];
        if (cur === undefined) setMarket(asset, windowTs, null);
      }
    }

    const [obResults, priceResults] = await Promise.all([
      Promise.all(orderBookPromises),
      Promise.all(pricePromises),
    ]);

    for (const { tokenId, ob } of obResults) {
      if (ob) setOrderBook(tokenId, ob);
    }

    // Apply price updates
    for (const { asset, windowTs, priceToBeat, currentPrice } of priceResults) {
      const { marketsCache: freshCache } = useStore.getState();
      const market = freshCache[asset]?.[windowTs];
      if (market) {
        setMarket(asset, windowTs, { ...market, price_to_beat: priceToBeat, current_price: currentPrice });
      }
    }

    // Sample chart data (Up probability from best bid)
    const { marketsCache: finalCache, orderBooks } = useStore.getState();
    const w = windows[0];
    if (w != null) {
      for (const asset of ASSETS) {
        const market = finalCache[asset]?.[w];
        if (!market) continue;
        const upTokenId = market.token_ids?.[0]; // index 0 = Up outcome
        if (!upTokenId) continue;
        const ob = orderBooks[upTokenId];
        const bestBidUp = ob?.bids?.[0]?.price;
        if (bestBidUp != null && bestBidUp > 0) {
          pushTradeHistoryPoint(asset, { time: Date.now(), upProb: bestBidUp });
        }
      }
    }

    // Manage WebSocket subscriptions
    const newIds = new Set();
    const allMeta = [];
    const { marketsCache: subCache } = useStore.getState();
    for (const asset of ASSETS) {
      for (const windowTs of windows) {
        const market = subCache[asset]?.[windowTs];
        if (market?.token_ids) {
          market.token_ids.forEach((id, i) => {
            newIds.add(id);
            allMeta.push({ tokenId: id, meta: { asset, windowTs, outcomeIndex: i } });
          });
        }
      }
    }

    const toUnsub = [...lastSubscribedIds.current].filter((id) => !newIds.has(id));
    const toSub = [...newIds].filter((id) => !lastSubscribedIds.current.has(id));

    if (toUnsub.length) {
      wsRef.current?.unsubscribe(toUnsub);
      toUnsub.forEach((id) => lastSubscribedIds.current.delete(id));
    }
    if (toSub.length) {
      const meta = toSub.map((id) => allMeta.find((m) => m.tokenId === id).meta);
      wsRef.current?.subscribe(toSub, meta);
      toSub.forEach((id) => lastSubscribedIds.current.add(id));
    }

    if (currentWindow != null) lastKnownWindow.current = currentWindow;
  }, [setMarket, setOrderBook, pushTradeHistoryPoint, resetForNewWindow, wsRef]);

  useEffect(() => {
    isRunning.current = true;
    const run = async () => {
      if (!isRunning.current) return;
      await refresh();
      if (isRunning.current) {
        refreshTimer.current = setTimeout(run, REFRESH_SEC * 1000);
      }
    };
    run();
    return () => {
      isRunning.current = false;
      if (refreshTimer.current) { clearTimeout(refreshTimer.current); refreshTimer.current = null; }
    };
  }, [refresh]);
}
