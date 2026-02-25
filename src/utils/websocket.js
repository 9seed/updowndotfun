const WS_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/market`;
const PING_INTERVAL_MS = 10000;

function parseBookPayload(bids, asks) {
  const b = (bids ?? []).map((x) => ({ price: parseFloat(x.price || '0'), size: parseFloat(x.size || '0') }));
  const a = (asks ?? []).map((x) => ({ price: parseFloat(x.price || '0'), size: parseFloat(x.size || '0') }));
  return {
    bids: b.sort((x, y) => y.price - x.price).slice(0, 5),
    asks: a.sort((x, y) => x.price - y.price).slice(0, 5),
  };
}

export class OrderBookWS {
  constructor(onBookUpdate) {
    this.ws = null;
    this.pingTimer = null;
    this.reconnectTimer = null;
    this.subscribedIds = new Set();
    this.onBookUpdate = onBookUpdate;
    this.tokenToMeta = new Map();
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    try {
      this.ws = new WebSocket(WS_URL);
      this.ws.onopen = () => {
        this.startPing();
        if (this.subscribedIds.size > 0) this.sendSubscribe([...this.subscribedIds]);
      };
      this.ws.onmessage = (ev) => this.handleMessage(ev.data);
      this.ws.onclose = () => {
        this.stopPing();
        this.ws = null;
        this.scheduleReconnect();
      };
      this.ws.onerror = () => {};
    } catch {
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 3000);
  }

  startPing() {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send('PING');
    }, PING_INTERVAL_MS);
  }

  stopPing() {
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
  }

  sendSubscribe(assetIds) {
    if (!assetIds.length || this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ assets_ids: assetIds, type: 'market', custom_feature_enabled: true }));
  }

  subscribe(tokenIds, meta) {
    for (let i = 0; i < tokenIds.length; i++) {
      this.tokenToMeta.set(tokenIds[i], meta[i] ?? { asset: '', windowTs: 0, outcomeIndex: 0 });
      this.subscribedIds.add(tokenIds[i]);
    }
    this.sendSubscribe([...this.subscribedIds]);
  }

  unsubscribe(tokenIds) {
    for (const id of tokenIds) {
      this.subscribedIds.delete(id);
      this.tokenToMeta.delete(id);
    }
    if (this.subscribedIds.size === 0) return;
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ assets_ids: tokenIds, type: 'market', unsubscribe: true }));
    }
  }

  handleMessage(data) {
    if (data === 'PONG') return;
    if (typeof data !== 'string' || !data) return;
    try {
      const msg = JSON.parse(data);
      const eventType = msg.event_type;
      if (eventType === 'book') {
        const book = parseBookPayload(msg.bids ?? [], msg.asks ?? []);
        this.onBookUpdate([{ assetId: msg.asset_id, book }]);
      } else if (eventType === 'best_bid_ask') {
        const book = {
          bids: msg.best_bid ? [{ price: parseFloat(msg.best_bid), size: 0 }] : [],
          asks: msg.best_ask ? [{ price: parseFloat(msg.best_ask), size: 0 }] : [],
        };
        this.onBookUpdate([{ assetId: msg.asset_id, book }]);
      } else if (eventType === 'price_change') {
        const updates = (msg.price_changes ?? []).map((c) => ({
          assetId: c.asset_id,
          book: {
            bids: c.best_bid ? [{ price: parseFloat(c.best_bid), size: 0 }] : [],
            asks: c.best_ask ? [{ price: parseFloat(c.best_ask), size: 0 }] : [],
          },
        }));
        if (updates.length) this.onBookUpdate(updates);
      }
    } catch { /* ignore */ }
  }

  getTokenMeta(assetId) { return this.tokenToMeta.get(assetId); }

  close() {
    this.stopPing();
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.ws) { this.ws.close(); this.ws = null; }
    this.subscribedIds.clear();
    this.tokenToMeta.clear();
  }
}
