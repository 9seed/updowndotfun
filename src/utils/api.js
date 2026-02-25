import { useStore } from '../store/useStore.js';

const GAMMA_API = '/api/gamma';
const CLOB_HOST = '/api/clob';
const BINANCE_API = '/api/binance/api/v3';
const DATA_API = '/api/data';

/** 返回当前会话的 Header 对象（有会话则携带 X-Session-Id） */
export function sessionHeaders() {
  const { sessionId } = useStore.getState();
  return sessionId ? { 'X-Session-Id': sessionId } : {};
}

export const BINANCE_SYMBOL_MAP = { btc: 'BTCUSDT', eth: 'ETHUSDT', sol: 'SOLUSDT', xrp: 'XRPUSDT' };

export async function fetchMarketBySlug(slug) {
  try {
    const res = await fetch(`${GAMMA_API}/markets/slug/${slug}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return Array.isArray(data) ? (data[0] ?? null) : data;
  } catch {
    return null;
  }
}

export function parseOrderBook(raw) {
  const bids = (raw.bids ?? []).map((b) => ({ price: parseFloat(b.price || '0'), size: parseFloat(b.size || '0') }));
  const asks = (raw.asks ?? []).map((a) => ({ price: parseFloat(a.price || '0'), size: parseFloat(a.size || '0') }));
  return {
    bids: bids.sort((a, b) => b.price - a.price).slice(0, 5),
    asks: asks.sort((a, b) => a.price - b.price).slice(0, 5),
  };
}

export async function fetchOrderBook(tokenId) {
  try {
    const res = await fetch(`${CLOB_HOST}/book?token_id=${encodeURIComponent(tokenId)}`);
    if (!res.ok) return null;
    const raw = await res.json();
    return parseOrderBook(raw);
  } catch {
    return null;
  }
}

export async function fetchCurrentPrice(asset) {
  const symbol = BINANCE_SYMBOL_MAP[asset] ?? 'BTCUSDT';
  try {
    const res = await fetch(`${BINANCE_API}/ticker/price?symbol=${symbol}`);
    if (!res.ok) return null;
    const d = await res.json();
    const p = parseFloat(d?.price);
    return isNaN(p) ? null : p;
  } catch {
    return null;
  }
}

export async function fetchAllPrices() {
  try {
    const res = await fetch('/api/prices');
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchPriceToBeat(asset, eventStartTime) {
  const symbol = BINANCE_SYMBOL_MAP[asset] ?? 'BTCUSDT';
  try {
    const startMs = new Date(eventStartTime).getTime();
    const res = await fetch(`${BINANCE_API}/klines?symbol=${symbol}&interval=1m&startTime=${startMs}&limit=1`);
    if (!res.ok) return null;
    const arr = await res.json();
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const open = parseFloat(arr[0][1]);
    return isNaN(open) ? null : open;
  } catch {
    return null;
  }
}

export async function fetchPositions(userAddress) {
  if (!userAddress || !/^0x[a-fA-F0-9]{40}$/.test(userAddress)) return [];
  try {
    // 使用服务端增强接口：附加链上结算状态检查，比 Data API 更快发现可 claim 的仓位
    const res = await fetch(`/api/positions?user=${encodeURIComponent(userAddress)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function fetchActivity(userAddress, type = 'TRADE', limit = 30) {
  if (!userAddress || !/^0x[a-fA-F0-9]{40}$/.test(userAddress)) return [];
  try {
    const res = await fetch(
      `/api/user/activity?user=${encodeURIComponent(userAddress)}&type=${type}&limit=${limit}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function fetchAllMarkets() {
  try {
    const res = await fetch('/api/markets/all');
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchBalance(userAddress, explicitSessionId) {
  if (!userAddress || !/^0x[a-fA-F0-9]{40}$/.test(userAddress)) return null;
  try {
    const sid = explicitSessionId ?? useStore.getState().sessionId;
    const headers = sid ? { 'X-Session-Id': sid } : {};
    const res = await fetch(`/api/balance?address=${encodeURIComponent(userAddress)}`, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.usdce != null || data?.native != null) {
      useStore.getState().setBalanceDetail({
        clob: data.clob ?? 0,
        usdce: data.usdce ?? 0,
        native: data.native ?? 0,
        matic: data.matic ?? 0,
        allowance: data.allowance ?? 0,
        approved: data.approved ?? false,
      });
    }
    return data?.usdc ?? null;
  } catch {
    return null;
  }
}
