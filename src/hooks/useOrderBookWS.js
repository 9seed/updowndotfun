import { useEffect, useRef } from 'react';
import { OrderBookWS } from '../utils/websocket.js';
import { useStore } from '../store/useStore.js';
import { mergeOrderBook } from '../utils/market.js';

export function useOrderBookWS() {
  const wsRef = useRef(null);
  const pendingRef = useRef({});
  const flushRef = useRef(null);

  useEffect(() => {
    const handleUpdate = (updates) => {
      for (const { assetId, book } of updates) {
        pendingRef.current[assetId] = book;
      }
      if (!flushRef.current) {
        flushRef.current = setTimeout(() => {
          flushRef.current = null;
          const pending = pendingRef.current;
          pendingRef.current = {};

          const state = useStore.getState();
          for (const [assetId, book] of Object.entries(pending)) {
            const meta = wsRef.current?.getTokenMeta(assetId);
            if (!meta) continue;
            const { asset, windowTs, outcomeIndex } = meta;
            const market = state.marketsCache[asset]?.[windowTs];
            if (!market) continue;
            const tokenId = market.token_ids?.[outcomeIndex];
            if (!tokenId) continue;

            const existing = state.orderBooks[tokenId] || { bids: [], asks: [] };
            const merged = mergeOrderBook(existing, book);
            state.setOrderBook(tokenId, merged);
          }
        }, 150);
      }
    };

    const ws = new OrderBookWS(handleUpdate);
    ws.connect();
    wsRef.current = ws;

    return () => {
      if (flushRef.current) { clearTimeout(flushRef.current); flushRef.current = null; }
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

  return wsRef;
}
