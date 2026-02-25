import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '../store/useStore.js';
import {
  ASSETS, LOOK_BACK, LOOK_AHEAD, REFRESH_SEC,
  windowsToTrack, parseMarket,
} from '../utils/market.js';
import { fetchAllMarkets, parseOrderBook } from '../utils/api.js';

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
      lastKnownWindow.current = currentWindow;
      lastSubscribedIds.current.clear();
      resetForNewWindow(currentWindow);
    }

    const allData = await fetchAllMarkets();
    if (!allData?.assets) return;

    const windowTs = allData.windowTs;

    for (const item of allData.assets) {
      const { asset, market: raw, currentPrice, priceToBeat, orderBooks, tokenIds } = item;
      if (raw) {
        const market = parseMarket(raw, windowTs, asset);
        market.price_to_beat = priceToBeat;
        market.current_price = currentPrice;
        setMarket(asset, windowTs, market);
        if (lastKnownWindow.current == null) lastKnownWindow.current = windowTs;

        for (const tokenId of tokenIds) {
          if (orderBooks[tokenId]) {
            setOrderBook(tokenId, parseOrderBook(orderBooks[tokenId]));
          }
        }
      } else {
        const cur = useStore.getState().marketsCache[asset]?.[windowTs];
        if (cur === undefined) setMarket(asset, windowTs, null);
      }
    }

    // Sample chart data (Up probability from best bid)
    const { marketsCache: finalCache, orderBooks: storeBooks } = useStore.getState();
    const w = windows[0];
    if (w != null) {
      for (const asset of ASSETS) {
        const market = finalCache[asset]?.[w];
        if (!market) continue;
        const upTokenId = market.token_ids?.[0];
        if (!upTokenId) continue;
        const ob = storeBooks[upTokenId];
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
      for (const wTs of windows) {
        const market = subCache[asset]?.[wTs];
        if (market?.token_ids) {
          market.token_ids.forEach((id, i) => {
            newIds.add(id);
            allMeta.push({ tokenId: id, meta: { asset, windowTs: wTs, outcomeIndex: i } });
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
