import 'dotenv/config';
// 强制 DNS 解析优先使用 IPv4，避免 clob.polymarket.com 的 IPv6 TLS 握手失败
import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');
import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { randomUUID, hkdf } from 'crypto';
import { Wallet } from '@ethersproject/wallet';
import { verifyTypedData } from 'viem';

const __dirname = dirname(fileURLToPath(import.meta.url));

let tradeModule = null;
async function getTradeModule() {
  if (tradeModule) return tradeModule;
  tradeModule = await import('./lib/trade.js');
  return tradeModule;
}

const app = express();
const PORT = process.env.PORT || (process.env.NODE_ENV === 'production' ? 5174 : 3001);

app.use(express.json());

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// ===== EIP-712 签名类型定义 =====
const EIP712_DOMAIN = {
  name: 'updown.fun',
  version: '1',
  chainId: 137,
};

const EIP712_TYPES = {
  SubAccountAuth: [
    { name: 'owner', type: 'address' },
    { name: 'purpose', type: 'string' },
  ],
};

const EIP712_PURPOSE = 'Authorize deterministic sub-account for trading';

// ===== HKDF 密钥派生 =====
const SESSION_PEPPER = process.env.SESSION_PEPPER?.trim();
if (!SESSION_PEPPER || !/^[0-9a-fA-F]{64}$/.test(SESSION_PEPPER)) {
  console.error('[Auth] 错误: SESSION_PEPPER 未配置或格式无效（需要 64 位 hex）。请在 .env 中设置。');
}

async function deriveKeyWithHKDF(signature, address) {
  const pepper = Buffer.from(SESSION_PEPPER, 'hex');
  const ikm = Buffer.from(signature.slice(2), 'hex');
  const info = Buffer.from(`updown.fun:${address.toLowerCase()}`);

  return new Promise((resolve, reject) => {
    hkdf('sha256', ikm, pepper, info, 32, (err, derivedKey) => {
      if (err) return reject(err);
      resolve('0x' + Buffer.from(derivedKey).toString('hex'));
    });
  });
}

// ===== 会话管理（内存 Map，重启后清空）=====
const sessions = new Map(); // sessionId → { privateKey, address, metaMaskAddress, expiresAt }

setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (s.expiresAt < now) sessions.delete(id);
  }
}, 3_600_000);

function getSession(req) {
  const sessionId = req.headers['x-session-id'];
  if (!sessionId) return null;
  const s = sessions.get(sessionId);
  if (!s || s.expiresAt < Date.now()) {
    sessions.delete(sessionId);
    return null;
  }
  return s;
}

// POST /api/auth/connect  body: { address, signature }
app.post('/api/auth/connect', async (req, res) => {
  const { address, signature } = req.body ?? {};
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return res.status(400).json({ error: '无效的 MetaMask 地址' });
  }
  if (!signature || !/^0x[a-fA-F0-9]+$/.test(signature)) {
    return res.status(400).json({ error: '无效的签名格式' });
  }
  if (!SESSION_PEPPER) {
    return res.status(500).json({ error: 'SESSION_PEPPER 未配置' });
  }

  try {
    // 验证 EIP-712 签名确实来自该地址
    const valid = await verifyTypedData({
      address,
      domain: EIP712_DOMAIN,
      types: EIP712_TYPES,
      primaryType: 'SubAccountAuth',
      message: { owner: address, purpose: EIP712_PURPOSE },
      signature,
    });

    if (!valid) {
      return res.status(401).json({ error: '签名验证失败：签名与地址不匹配' });
    }

    // 用 HKDF 在服务端派生私钥（前端永远不接触私钥）
    const sessionPrivateKey = await deriveKeyWithHKDF(signature, address);
    const wallet = new Wallet(sessionPrivateKey);
    const sessionAddress = wallet.address;

    const sessionId = randomUUID();
    sessions.set(sessionId, {
      privateKey: sessionPrivateKey,
      address: sessionAddress,
      metaMaskAddress: address,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    });

    console.log(`[Auth] 会话已建立 MetaMask=${address} 子账户=${sessionAddress} (EIP-712 + HKDF)`);
    return res.json({ sessionId, sessionAddress });
  } catch (err) {
    const msg = err?.message ?? String(err);
    console.error('[Auth] connect 异常:', msg);
    return res.status(400).json({ error: '认证失败: ' + msg });
  }
});

// POST /api/auth/disconnect
app.post('/api/auth/disconnect', (req, res) => {
  const sessionId = req.headers['x-session-id'];
  if (sessionId) {
    sessions.delete(sessionId);
    console.log(`[Auth] 会话已断开 sessionId=${sessionId}`);
  }
  return res.json({ ok: true });
});

// GET /api/auth/export-key — 导出当前会话的派生私钥
app.get('/api/auth/export-key', (req, res) => {
  const session = getSession(req);
  if (!session) {
    return res.status(401).json({ error: '未登录或会话已过期' });
  }
  return res.json({ privateKey: session.privateKey, address: session.address });
});

// Static files in production (built React app)
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(join(__dirname, 'dist')));
}

// Gamma API 代理
app.use('/api/gamma', createProxyMiddleware({
  target: 'https://gamma-api.polymarket.com',
  changeOrigin: true,
  pathRewrite: { '^/api/gamma': '' },
}));

// CLOB API 代理
app.use('/api/clob', createProxyMiddleware({
  target: 'https://clob.polymarket.com',
  changeOrigin: true,
  pathRewrite: { '^/api/clob': '' },
}));

// Binance API 代理
app.use('/api/binance', createProxyMiddleware({
  target: 'https://api.binance.com',
  changeOrigin: true,
  pathRewrite: { '^/api/binance': '' },
}));

// Polymarket Data API 代理（仓位等）
app.use('/api/data', createProxyMiddleware({
  target: 'https://data-api.polymarket.com',
  changeOrigin: true,
  pathRewrite: { '^/api/data': '' },
}));

// WebSocket 代理
const wsProxy = createProxyMiddleware({
  target: 'https://ws-subscriptions-clob.polymarket.com',
  ws: true,
  changeOrigin: true,
});
app.use('/ws', wsProxy);

// 链上 USDC 余额查询（同时查 USDC.e 和原生 USDC）
const POLYGON_RPC_URLS = [
  process.env.POLYGON_RPC,
  'https://polygon-bor-rpc.publicnode.com',
  'https://polygon.drpc.org',
  'https://1rpc.io/matic',
].filter(Boolean);

// USDC.e（桥接版，Polymarket 使用此版本下单）
const USDC_E_TOKEN = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
// 原生 USDC（Circle 发行，需转换才能在 Polymarket 下单）
const USDC_NATIVE_TOKEN = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359';

async function ethCall(to, data) {
  for (const rpc of POLYGON_RPC_URLS) {
    try {
      const res = await fetch(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_call', params: [{ to, data }, 'latest'], id: 1 }),
      });
      const json = await res.json();
      if (json?.error) continue;
      if (json?.result != null) return json.result;
    } catch {
      // 继续尝试下一个 RPC
    }
  }
  return null;
}

const CTF_EXCHANGE_ADDR = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';

// 返回 { usdce, native, total, matic, allowance, approved }
async function onchainUsdcBreakdown(address) {
  try {
    const addrHex = address.slice(2).toLowerCase().padStart(64, '0');
    const balanceSelector = '0x70a08231';
    // allowance(owner, spender) selector = 0xdd62ed3e
    const spenderHex = CTF_EXCHANGE_ADDR.slice(2).toLowerCase().padStart(64, '0');
    const allowanceData = '0xdd62ed3e' + addrHex + spenderHex;

    const [rawE, rawNative, rawAllowance, rawMatic] = await Promise.all([
      ethCall(USDC_E_TOKEN, balanceSelector + addrHex),
      ethCall(USDC_NATIVE_TOKEN, balanceSelector + addrHex),
      ethCall(USDC_E_TOKEN, allowanceData),
      fetchMaticBalance(address),
    ]);
    const usdce = (rawE && rawE !== '0x') ? parseInt(rawE, 16) / 1e6 : 0;
    const native = (rawNative && rawNative !== '0x') ? parseInt(rawNative, 16) / 1e6 : 0;
    const allowanceRaw = (rawAllowance && rawAllowance !== '0x') ? BigInt(rawAllowance) : 0n;
    const allowance = Number(allowanceRaw) / 1e6;
    const approved = allowance > 1000;
    return { usdce, native, total: usdce + native, matic: rawMatic, allowance, approved };
  } catch {
    return { usdce: 0, native: 0, total: 0, matic: 0, allowance: 0, approved: false };
  }
}

async function fetchMaticBalance(address) {
  for (const rpc of POLYGON_RPC_URLS) {
    try {
      const res = await fetch(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_getBalance', params: [address, 'latest'], id: 1 }),
      });
      const json = await res.json();
      if (json?.result != null) return Number(BigInt(json.result)) / 1e18;
    } catch { /* next */ }
  }
  return 0;
}

// GET /api/balance?address=0x...
app.get('/api/balance', async (req, res) => {
  const address = (req.query.address || '').trim();
  const session = getSession(req);

  // 会话模式：同时查 CLOB 余额 + 链上细分余额
  if (session) {
    const mod = await getTradeModule();
    let clobBalance = null;
    try {
      const { balance } = await mod.getBalanceAllowanceWithKey(session.privateKey);
      clobBalance = balance;
    } catch (e) {
      console.warn('[Balance/Session] CLOB 异常:', e?.message);
    }

    const breakdown = await onchainUsdcBreakdown(session.address);
    console.log(`[Balance/Session] CLOB=${clobBalance} 链上USDC.e=${breakdown.usdce} 原生USDC=${breakdown.native} MATIC=${breakdown.matic?.toFixed(4)} approved=${breakdown.approved}`);

    const displayUsdc = (clobBalance != null && clobBalance > 0) ? clobBalance : breakdown.total;
    return res.json({
      usdc: displayUsdc,
      clob: clobBalance ?? 0,
      usdce: breakdown.usdce,
      native: breakdown.native,
      matic: breakdown.matic ?? 0,
      allowance: breakdown.allowance ?? 0,
      approved: breakdown.approved ?? false,
      source: (clobBalance != null && clobBalance > 0) ? 'clob' : 'rpc',
    });
  }

  // 非会话模式：仅做链上余额查询（不使用 POLY_PRIVATE_KEY）
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return res.json({ usdc: null, error: 'Invalid address' });
  }
  const breakdown = await onchainUsdcBreakdown(address);
  return res.json({
    usdc: breakdown.total, usdce: breakdown.usdce, native: breakdown.native,
    matic: breakdown.matic ?? 0, allowance: breakdown.allowance ?? 0, approved: breakdown.approved ?? false,
    source: 'rpc',
  });
});

// GET /api/trade/status
app.get('/api/trade/status', async (req, res) => {
  try {
    const session = getSession(req);
    if (session) return res.json({ configured: true, mode: 'session' });
    const mod = await getTradeModule();
    return res.json({ configured: mod.isConfigured(), mode: 'env' });
  } catch (err) {
    return res.json({ configured: false, error: err?.message ?? String(err) });
  }
});

// POST /api/trade/order
app.post('/api/trade/order', async (req, res) => {
  try {
    const mod = await getTradeModule();
    const { tokenId, side = 'BUY', shares, askPrice } = req.body ?? {};
    if (!tokenId || typeof shares !== 'number' || typeof askPrice !== 'number') {
      return res.status(400).json({ success: false, error: '参数错误：需要 tokenId, shares（数字）, askPrice（数字）' });
    }
    console.log(`[Server] 下单请求: ${side} ${shares}份 @ ask=${(askPrice * 100).toFixed(1)}¢`);

    const session = getSession(req);
    let result;
    if (session) {
      // 下单前检查并自动尝试链上授权
      if (mod.checkApprovalStatus) {
        const approvalStatus = await mod.checkApprovalStatus(session.privateKey);
        if (!approvalStatus.approved) {
          console.log(`[Server] 未授权，尝试自动 approve...`);
          const approveResult = await mod.approveUsdceForTrading(session.privateKey);
          if (!approveResult.success) {
            return res.status(400).json({
              success: false,
              error: approveResult.needsMatic
                ? approveResult.error
                : `下单前需要授权 USDC.e: ${approveResult.error}`,
            });
          }
          console.log(`[Server] 自动 approve 完成`);
        }
      }
      result = await mod.placeOrderWithKey({ privateKey: session.privateKey, tokenId, side, shares, askPrice });
    } else if (mod.isConfigured()) {
      result = await mod.placeOrder({ tokenId, side, shares, askPrice });
    } else {
      return res.status(503).json({ success: false, error: '请先连接钱包，或在 .env 中配置 POLY_PRIVATE_KEY / POLY_ADDRESS' });
    }

    if (result.success) return res.json(result);
    return res.status(400).json(result);
  } catch (err) {
    const msg = err?.message ?? String(err);
    console.error('[Trade] Error:', msg);
    return res.status(503).json({ success: false, error: msg });
  }
});

// POST /api/trade/approve  – 用 Builder Relayer 授权 USDC.e，无需 MATIC 手续费
app.post('/api/trade/approve', async (req, res) => {
  const session = getSession(req);
  if (!session) {
    return res.status(401).json({ success: false, error: '请先连接钱包' });
  }
  try {
    const mod = await getTradeModule();
    const result = await mod.approveUsdceForTrading(session.privateKey);
    if (result.success) return res.json(result);
    return res.status(400).json(result);
  } catch (err) {
    return res.status(503).json({ success: false, error: err?.message ?? String(err) });
  }
});

// GET /api/user/activity?user=0x...&type=TRADE|REDEEM&limit=30
app.get('/api/user/activity', async (req, res) => {
  const user = (req.query.user || '').trim();
  const type = (req.query.type || 'TRADE').toUpperCase();
  const limit = Math.min(parseInt(req.query.limit || '30', 10), 100);

  if (!user || !/^0x[a-fA-F0-9]{40}$/.test(user)) {
    return res.status(400).json({ error: 'Invalid address' });
  }
  try {
    const url = `https://data-api.polymarket.com/activity?user=${encodeURIComponent(user)}&type=${type}&limit=${limit}`;
    const resp = await fetch(url);
    if (!resp.ok) return res.status(resp.status).json({ error: `Data API ${resp.status}` });
    const data = await resp.json();
    return res.json(Array.isArray(data) ? data : []);
  } catch (err) {
    return res.status(503).json({ error: err?.message ?? String(err) });
  }
});

// POST /api/trade/claim  body: { conditionId, outcomeIndex }
app.post('/api/trade/claim', async (req, res) => {
  const { conditionId, outcomeIndex } = req.body ?? {};
  if (!conditionId || typeof outcomeIndex !== 'number') {
    return res.status(400).json({ success: false, error: '参数错误：需要 conditionId 和 outcomeIndex' });
  }
  try {
    const mod = await getTradeModule();
    const session = getSession(req);

    let result;
    if (session) {
      result = await mod.claimPositionWithKey({ privateKey: session.privateKey, conditionId, outcomeIndex });
    } else if (mod.isConfigured()) {
      result = await mod.claimPosition({ conditionId, outcomeIndex });
    } else {
      return res.status(503).json({ success: false, error: '请先连接钱包，或在 .env 中配置 POLY_PRIVATE_KEY / POLY_ADDRESS' });
    }

    if (result.success) return res.json(result);
    return res.status(400).json(result);
  } catch (err) {
    const msg = err?.message ?? String(err);
    console.error('[Claim] Error:', msg);
    return res.status(503).json({ success: false, error: msg });
  }
});

// GET /api/positions?user=0x...  — 增强版：附加链上结算状态检查
const CTF_CONTRACT = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';

async function checkConditionResolved(conditionId) {
  // payoutDenominator(bytes32) selector = 0xdd34de67
  const data = '0xdd34de67' + conditionId.slice(2).padStart(64, '0');
  const result = await ethCall(CTF_CONTRACT, data);
  if (!result || result === '0x' || result === '0x' + '0'.repeat(64)) return false;
  return BigInt(result) > 0n;
}

app.get('/api/positions', async (req, res) => {
  const user = (req.query.user || '').trim();
  if (!user || !/^0x[a-fA-F0-9]{40}$/.test(user)) {
    return res.json([]);
  }
  try {
    const resp = await fetch(
      `https://data-api.polymarket.com/positions?user=${encodeURIComponent(user)}&sizeThreshold=0.01`
    );
    if (!resp.ok) return res.json([]);
    const positions = await resp.json();
    if (!Array.isArray(positions)) return res.json([]);

    // 对未标记为 redeemable 的仓位做链上检查
    const unredeemed = positions.filter((p) => !p.redeemable && p.conditionId);
    if (unredeemed.length > 0) {
      const checks = await Promise.all(
        unredeemed.map((p) => checkConditionResolved(p.conditionId).catch(() => false))
      );
      unredeemed.forEach((p, i) => {
        if (checks[i]) {
          p.redeemable = true;
          p._onchainResolved = true;
        }
      });
    }

    return res.json(positions);
  } catch (err) {
    console.error('[Positions] 异常:', err?.message);
    return res.json([]);
  }
});

// GET /api/history/:asset
app.get('/api/history/:asset', async (req, res) => {
  const asset = req.params.asset.toLowerCase();
  const nowTs = Math.floor(Date.now() / 1000);
  const tsList = Array.from({ length: 10 }, (_, i) =>
    Math.floor((nowTs - (i + 1) * 300) / 300) * 300
  ).reverse();

  const results = await Promise.all(tsList.map(async (ts) => {
    try {
      const slug = `${asset}-updown-5m-${ts}`;
      const resp = await fetch(`https://gamma-api.polymarket.com/markets/slug/${slug}`);
      const data = await resp.json();
      const m = Array.isArray(data) ? data[0] : data;
      const prices = JSON.parse(m?.outcomePrices ?? 'null');
      let result = null;
      if (prices?.[0] === '1') result = 'up';
      else if (prices?.[1] === '1') result = 'down';
      return { ts, result, closedTime: m?.closedTime ?? null };
    } catch {
      return { ts, result: null, closedTime: null };
    }
  }));

  res.json(results);
});

// SPA fallback (production only)
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(join(__dirname, 'dist', 'index.html'));
  });
}

const server = app.listen(PORT, () => {
  console.log(`updown.fun API server running at http://localhost:${PORT}`);
});

server.on('upgrade', (req, socket, head) => {
  if (req.url?.startsWith('/ws')) {
    wsProxy.upgrade(req, socket, head);
  } else {
    socket.destroy();
  }
});
