/**
 * Polymarket 下单模块
 * 使用 @polymarket/clob-client 进行订单签名与提交
 */
// 强制 DNS 优先使用 IPv4（clob.polymarket.com 的 IPv6 连接会被 Cloudflare 重置）
import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');
import { ClobClient, Side, OrderType, AssetType } from '@polymarket/clob-client';
import { Wallet } from '@ethersproject/wallet';
import { createWalletClient, createPublicClient, http, encodeFunctionData, zeroHash } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { polygon } from 'viem/chains';
import { RelayClient, RelayerTxType } from '@polymarket/builder-relayer-client';
import { BuilderConfig } from '@polymarket/builder-signing-sdk';

const HOST = 'https://clob.polymarket.com';
const CHAIN_ID = 137;

let clientInstance = null;
// 按私钥缓存会话客户端（避免每次下单都重新派生 API 凭证）
const clientsByKey = new Map();

function trimEnv(val) {
  if (typeof val !== 'string') return val;
  return val.trim().replace(/^["']|["']$/g, '');
}

export function isConfigured() {
  const pk = process.env.POLY_PRIVATE_KEY?.trim();
  const addr = process.env.POLY_ADDRESS?.trim();
  if (!pk || !addr || !pk.startsWith('0x') || !addr.startsWith('0x')) return false;
  return true;
}

async function getClient(forceDeriveCreds = false) {
  if (clientInstance && !forceDeriveCreds) return clientInstance;
  if (forceDeriveCreds) clientInstance = null;

  let pk = process.env.POLY_PRIVATE_KEY?.trim();
  let addr = process.env.POLY_ADDRESS?.trim();
  if (!pk || !addr) throw new Error('POLY_PRIVATE_KEY and POLY_ADDRESS are required');

  if (pk.length === 42 && addr.length === 66) {
    [pk, addr] = [addr, pk];
    console.warn('[Trade] 已自动纠正 POLY_ADDRESS 与 POLY_PRIVATE_KEY 的填反');
  }

  const signer = new Wallet(pk);
  let creds;
  const apiKey = trimEnv(process.env.POLY_API_KEY);
  const secret = trimEnv(process.env.POLY_SECRET);
  const passphrase = trimEnv(process.env.POLY_PASSPHRASE);

  if (forceDeriveCreds || !apiKey || !secret || !passphrase) {
    const tempClient = new ClobClient(HOST, CHAIN_ID, signer);
    creds = await tempClient.createOrDeriveApiKey();
    if (!creds?.key || !creds?.secret) {
      throw new Error('无法获取 API 凭证（CLOB API 不可达），请在 .env 中手动配置 POLY_API_KEY / POLY_SECRET / POLY_PASSPHRASE');
    }
    console.log('[Trade] API 凭证已派生，关联地址:', await signer.getAddress());
  } else {
    // SDK 的 createL2Headers 使用 creds.key（不是 creds.apiKey）
    creds = { key: apiKey, secret, passphrase };
  }

  const signatureType = parseInt(process.env.POLY_SIGNATURE_TYPE || '1', 10);
  clientInstance = new ClobClient(HOST, CHAIN_ID, signer, creds, signatureType, addr);
  return clientInstance;
}

/**
 * 用会话私钥创建（或复用缓存的）CLOB 客户端
 * 会话密钥对应 EOA 账户（signatureType=0），无需代理钱包地址
 */
async function getClientWithKey(privateKey) {
  if (clientsByKey.has(privateKey)) return clientsByKey.get(privateKey);

  const signer = new Wallet(privateKey);
  const tempClient = new ClobClient(HOST, CHAIN_ID, signer);
  const creds = await tempClient.createOrDeriveApiKey();
  if (!creds?.key) throw new Error('会话密钥无法获取 API 凭证');

  // signatureType=0: EOA（私钥地址即为账户地址，无代理合约）
  const client = new ClobClient(HOST, CHAIN_ID, signer, creds, 0);
  clientsByKey.set(privateKey, client);
  console.log('[Trade] 会话客户端已初始化 地址:', signer.address);
  return client;
}

export async function placeOrder({ tokenId, side, shares, askPrice }) {
  if (!isConfigured()) {
    return { success: false, error: 'Trading not configured. Set POLY_PRIVATE_KEY and POLY_ADDRESS in .env' };
  }

  const tokenStr = String(tokenId).trim();
  if (!/^\d{50,80}$/.test(tokenStr)) {
    return { success: false, error: `无效的 tokenId 格式: ${tokenStr.slice(0, 30)}...` };
  }
  if (askPrice <= 0 || askPrice >= 1) {
    return { success: false, error: `askPrice 必须在 0~1 之间，收到: ${askPrice}` };
  }

  const priceWithSlippage = Math.min(askPrice + 0.01, 0.99);
  const roundedPrice = Math.round(priceWithSlippage * 100) / 100;
  // Polymarket 最小订单额为 $1 USDC，确保 shares * price >= 1
  const minSharesForValue = Math.ceil(1 / roundedPrice);
  const intShares = Math.max(minSharesForValue, Math.floor(shares));

  console.log(`[Trade] 下单 BUY ${intShares}份 @ ≤${(roundedPrice * 100).toFixed(1)}¢ tokenId=${tokenStr.slice(0, 20)}...`);

  try {
    const client = await getClient();

    // SDK 内部 getTickSize 在 API 返回无效响应时会调用 undefined.toString() 崩溃。
    // 预填充 tickSizes 和 negRisk 的安全默认值；feeRates 必须从 API 获取真实值，不能预填 0。
    if (!client.tickSizes) client.tickSizes = {};
    if (!client.negRisk) client.negRisk = {};
    if (!(tokenStr in client.tickSizes)) {
      client.tickSizes[tokenStr] = '0.01';  // 二元市场标准 tick size
      client.negRisk[tokenStr] = false;      // 大多数市场非 negRisk
      console.log(`[Trade] 已预填 tickSize/negRisk 缓存 tokenId=${tokenStr.slice(0, 20)}...`);
    }

    const resp = await client.createAndPostOrder(
      { tokenID: tokenStr, price: roundedPrice, size: intShares, side: Side.BUY },
      {},
      OrderType.FOK
    );
    console.log('[Trade] 下单响应:', JSON.stringify(resp));

    // 兼容两种错误字段：errorMsg（成功响应）和 error（失败响应，如 FOK 未成交）
    const errorMsg = resp?.errorMsg ?? resp?.error ?? '';
    const httpStatus = resp?.status;
    if ((errorMsg && errorMsg !== '') || (typeof httpStatus === 'number' && httpStatus >= 400)) {
      return { success: false, error: errorMsg || `HTTP ${httpStatus}`, orderID: resp?.orderID ?? null, status: httpStatus };
    }
    return {
      success: true,
      orderID: resp?.orderID ?? null,
      status: resp?.status ?? null,
      takingAmount: resp?.takingAmount ?? null,
      makingAmount: resp?.makingAmount ?? null,
    };
  } catch (err) {
    let msg = err?.message ?? String(err);
    if (err?.data?.error) msg = err.data.error;
    if (err?.response?.data?.error) msg = err.response.data.error;
    console.error('[Trade] placeOrder 异常:', msg);
    return { success: false, error: msg };
  }
}

/**
 * 用会话私钥下单（同 placeOrder，但使用会话 CLOB 客户端）
 */
export async function placeOrderWithKey({ privateKey, tokenId, side = 'BUY', shares, askPrice }) {
  const tokenStr = String(tokenId).trim();
  if (!/^\d{50,80}$/.test(tokenStr)) {
    return { success: false, error: `无效的 tokenId 格式: ${tokenStr.slice(0, 30)}...` };
  }
  if (askPrice <= 0 || askPrice >= 1) {
    return { success: false, error: `askPrice 必须在 0~1 之间，收到: ${askPrice}` };
  }

  const priceWithSlippage = Math.min(askPrice + 0.01, 0.99);
  const roundedPrice = Math.round(priceWithSlippage * 100) / 100;
  const minSharesForValue = Math.ceil(1 / roundedPrice);
  const intShares = Math.max(minSharesForValue, Math.floor(shares));

  console.log(`[Trade/Session] 下单 BUY ${intShares}份 @ ≤${(roundedPrice * 100).toFixed(1)}¢ tokenId=${tokenStr.slice(0, 20)}...`);

  try {
    const client = await getClientWithKey(privateKey);
    if (!client.tickSizes) client.tickSizes = {};
    if (!client.negRisk) client.negRisk = {};
    if (!(tokenStr in client.tickSizes)) {
      client.tickSizes[tokenStr] = '0.01';
      client.negRisk[tokenStr] = false;
    }

    const resp = await client.createAndPostOrder(
      { tokenID: tokenStr, price: roundedPrice, size: intShares, side: Side.BUY },
      {},
      OrderType.FOK
    );
    console.log('[Trade/Session] 下单响应:', JSON.stringify(resp));

    const errorMsg = resp?.errorMsg ?? resp?.error ?? '';
    const httpStatus = resp?.status;
    if ((errorMsg && errorMsg !== '') || (typeof httpStatus === 'number' && httpStatus >= 400)) {
      return { success: false, error: errorMsg || `HTTP ${httpStatus}`, orderID: resp?.orderID ?? null, status: httpStatus };
    }
    return {
      success: true,
      orderID: resp?.orderID ?? null,
      status: resp?.status ?? null,
      takingAmount: resp?.takingAmount ?? null,
      makingAmount: resp?.makingAmount ?? null,
    };
  } catch (err) {
    let msg = err?.message ?? String(err);
    if (err?.data?.error) msg = err.data.error;
    if (err?.response?.data?.error) msg = err.response.data.error;
    console.error('[Trade/Session] placeOrderWithKey 异常:', msg);
    return { success: false, error: msg };
  }
}

export async function getBalanceAllowance() {
  if (!isConfigured()) return { balance: null, error: 'Trading not configured' };

  const parseResp = (resp) => {
    const raw = resp?.data ?? resp;
    const n = parseFloat(raw?.balance ?? null);
    const balance = isNaN(n) ? null : (n > 1e6 ? n / 1e6 : n);
    return { balance };
  };

  const tryFetch = async (forceDerive = false) => {
    if (forceDerive) clientInstance = null;
    const client = await getClient(forceDerive);
    return client.getBalanceAllowance({ asset_type: AssetType.COLLATERAL });
  };

  try {
    const resp = await tryFetch(false);
    const result = parseResp(resp);
    console.log('[Trade] getBalanceAllowance 成功:', result);
    return result;
  } catch (err) {
    const status = err?.response?.status ?? err?.status;
    const msg = err?.response?.data?.error ?? err?.message ?? String(err);
    console.warn('[Trade] getBalanceAllowance 失败:', status, msg);

    if (status === 401 || String(msg).toLowerCase().includes('api key') || String(msg).toLowerCase().includes('unauthorized')) {
      console.log('[Trade] 尝试重新派生 API 凭证...');
      try {
        const resp = await tryFetch(true);
        const result = parseResp(resp);
        console.log('[Trade] 重新派生后成功:', result);
        return result;
      } catch (retryErr) {
        const retryMsg = retryErr?.response?.data?.error ?? retryErr?.message ?? msg;
        return { balance: null, error: retryMsg };
      }
    }
    return { balance: null, error: msg };
  }
}

// Polymarket 合约地址（Polygon）
const CTF_ADDRESS = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';
const USDC_COLLATERAL = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';  // USDC.e
const CTF_EXCHANGE = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';     // Polymarket Exchange
const RELAYER_URL = 'https://relayer-v2.polymarket.com/';

const CTF_REDEEM_ABI = [
  {
    name: 'redeemPositions',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'collateralToken', type: 'address' },
      { name: 'parentCollectionId', type: 'bytes32' },
      { name: 'conditionId', type: 'bytes32' },
      { name: 'indexSets', type: 'uint256[]' },
    ],
    outputs: [],
  },
];

export function isBuilderConfigured() {
  const key = process.env.POLY_BUILDER_API_KEY?.trim();
  const secret = process.env.POLY_BUILDER_SECRET?.trim();
  const passphrase = process.env.POLY_BUILDER_PASSPHRASE?.trim();
  return !!(key && secret && passphrase);
}

const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
];

/**
 * 查询 EOA 地址对 CTF Exchange 的 USDC.e allowance 以及 MATIC 余额
 */
export async function checkApprovalStatus(privateKey) {
  try {
    const rpcUrl = process.env.POLYGON_RPC || 'https://polygon-bor-rpc.publicnode.com';
    const account = privateKeyToAccount(privateKey);
    const publicClient = createPublicClient({
      chain: polygon,
      transport: http(rpcUrl),
    });

    const [allowanceRaw, maticBalance] = await Promise.all([
      publicClient.readContract({
        address: USDC_COLLATERAL,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [account.address, CTF_EXCHANGE],
      }),
      publicClient.getBalance({ address: account.address }),
    ]);

    const allowance = Number(allowanceRaw) / 1e6;
    const matic = Number(maticBalance) / 1e18;
    console.log(`[Approve] 授权状态 address=${account.address} allowance=${allowance} MATIC=${matic.toFixed(6)}`);

    return { allowance, matic, approved: allowance > 1000 };
  } catch (err) {
    console.error('[Approve] checkApprovalStatus 异常:', err?.message);
    return { allowance: 0, matic: 0, approved: false };
  }
}

/**
 * 直接链上交易为 EOA 授权 USDC.e 给 CTF Exchange（需要少量 MATIC 作为 Gas）
 * signatureType=0 (EOA) 模式下，必须从 EOA 自身发起 approve，不能通过代理
 */
export async function approveUsdceForTrading(privateKey) {
  try {
    const rpcUrl = process.env.POLYGON_RPC || 'https://polygon-bor-rpc.publicnode.com';
    const account = privateKeyToAccount(privateKey);
    const publicClient = createPublicClient({
      chain: polygon,
      transport: http(rpcUrl),
    });
    const walletClient = createWalletClient({
      account,
      chain: polygon,
      transport: http(rpcUrl),
    });

    // 检查是否已授权
    const currentAllowance = await publicClient.readContract({
      address: USDC_COLLATERAL,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [account.address, CTF_EXCHANGE],
    });
    if (currentAllowance > 1_000_000n) {
      console.log(`[Approve] 已授权 allowance=${Number(currentAllowance) / 1e6}`);
      return { success: true, alreadyApproved: true };
    }

    // 检查 MATIC 余额（链上 approve 需要 Gas）
    const maticBalance = await publicClient.getBalance({ address: account.address });
    if (maticBalance < 100_000_000_000_000n) { // < 0.0001 MATIC
      return {
        success: false,
        needsMatic: true,
        error: `需要少量 MATIC 用于支付授权交易的 Gas 费（约 0.001 MATIC）。请往 ${account.address} 转入少量 MATIC。`,
      };
    }

    // 发送链上 approve 交易
    const MAX_UINT256 = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
    console.log(`[Approve] 发送链上 approve 交易 from=${account.address} → CTF Exchange`);

    const hash = await walletClient.writeContract({
      address: USDC_COLLATERAL,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [CTF_EXCHANGE, MAX_UINT256],
    });

    console.log(`[Approve] 等待交易确认 txHash=${hash}`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });

    if (receipt.status === 'reverted') {
      return { success: false, txHash: hash, error: '授权交易已回滚' };
    }

    console.log(`[Approve] 授权成功 txHash=${hash} blockNumber=${receipt.blockNumber}`);
    return { success: true, txHash: hash };
  } catch (err) {
    const msg = err?.message ?? String(err);
    console.error('[Approve] 异常:', msg);
    return { success: false, error: msg };
  }
}

/**
 * 用会话私钥查询 CLOB 余额
 */
export async function getBalanceAllowanceWithKey(privateKey) {
  try {
    const client = await getClientWithKey(privateKey);
    const resp = await client.getBalanceAllowance({ asset_type: AssetType.COLLATERAL });
    const raw = resp?.data ?? resp;
    const n = parseFloat(raw?.balance ?? null);
    const balance = isNaN(n) ? null : (n > 1e6 ? n / 1e6 : n);
    return { balance };
  } catch (err) {
    const msg = err?.response?.data?.error ?? err?.message ?? String(err);
    console.warn('[Trade/Session] getBalanceAllowanceWithKey 失败:', msg);
    return { balance: null, error: msg };
  }
}

/**
 * 用会话私钥 claim 仓位（直接链上交易，需要少量 MATIC）
 * signatureType=0 (EOA) 模式下，CT 代币在 EOA 地址上，必须由 EOA 直接调用 redeemPositions
 */
export async function claimPositionWithKey({ privateKey, conditionId, outcomeIndex }) {
  try {
    const rpcUrl = process.env.POLYGON_RPC || 'https://polygon-bor-rpc.publicnode.com';
    const account = privateKeyToAccount(privateKey);
    const publicClient = createPublicClient({
      chain: polygon,
      transport: http(rpcUrl),
    });
    const walletClient = createWalletClient({
      account,
      chain: polygon,
      transport: http(rpcUrl),
    });

    // 检查 MATIC 余额（链上 claim 需要 Gas）
    const maticBalance = await publicClient.getBalance({ address: account.address });
    if (maticBalance < 100_000_000_000_000n) { // < 0.0001 MATIC
      return {
        success: false,
        needsMatic: true,
        error: `需要少量 MATIC 用于支付 claim 交易的 Gas 费（约 0.003 MATIC）。请往 ${account.address} 转入少量 MATIC。`,
      };
    }

    console.log(`[Claim/Session] 发送链上 redeemPositions conditionId=${conditionId} from=${account.address}`);

    const hash = await walletClient.writeContract({
      address: CTF_ADDRESS,
      abi: CTF_REDEEM_ABI,
      functionName: 'redeemPositions',
      args: [USDC_COLLATERAL, zeroHash, conditionId, [1n, 2n]],
    });

    console.log(`[Claim/Session] 等待交易确认 txHash=${hash}`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });

    if (receipt.status === 'reverted') {
      console.error(`[Claim/Session] 链上交易已回滚 txHash=${hash}`);
      return {
        success: false,
        txHash: hash,
        error: '链上交易失败（合约已回滚）。可能原因：该 condition 尚未结算，或已经 claim 过。',
      };
    }

    console.log(`[Claim/Session] 交易已确认 txHash=${hash} blockNumber=${receipt.blockNumber}`);
    return { success: true, txHash: hash, blockNumber: Number(receipt.blockNumber) };
  } catch (err) {
    const msg = err?.message ?? String(err);
    console.error('[Claim/Session] claimPositionWithKey 异常:', msg);
    return { success: false, error: msg };
  }
}

export async function claimPosition({ conditionId, outcomeIndex }) {
  if (!isConfigured()) {
    return { success: false, error: 'Trading not configured' };
  }
  if (!isBuilderConfigured()) {
    return {
      success: false,
      error: 'Builder Program 凭证未配置。请访问 polymarket.com/settings?tab=builder 申请，并在 .env 中填入 POLY_BUILDER_API_KEY / POLY_BUILDER_SECRET / POLY_BUILDER_PASSPHRASE',
    };
  }

  try {
    const pk = process.env.POLY_PRIVATE_KEY?.trim();
    const rpcUrl = process.env.POLYGON_RPC || 'https://polygon-bor-rpc.publicnode.com';

    // viem wallet client（Builder Relayer 要求）
    const account = privateKeyToAccount(pk);
    const walletClient = createWalletClient({
      account,
      chain: polygon,
      transport: http(rpcUrl),
    });

    // Builder 认证配置
    const builderConfig = new BuilderConfig({
      localBuilderCreds: {
        key: process.env.POLY_BUILDER_API_KEY.trim(),
        secret: process.env.POLY_BUILDER_SECRET.trim(),
        passphrase: process.env.POLY_BUILDER_PASSPHRASE.trim(),
      },
    });

    // RelayerTxType.PROXY 对应 Polymarket Proxy Account（与 POLY_ADDRESS 类型匹配）
    const relayClient = new RelayClient(RELAYER_URL, 137, walletClient, builderConfig, RelayerTxType.PROXY);

    // 同时赎回两种 outcome token：indexSets=[1,2]，败方 token 销毁返回 $0
    const redeemCalldata = encodeFunctionData({
      abi: CTF_REDEEM_ABI,
      functionName: 'redeemPositions',
      args: [USDC_COLLATERAL, zeroHash, conditionId, [1n, 2n]],
    });

    const redeemTx = { to: CTF_ADDRESS, data: redeemCalldata, value: '0' };

    console.log(`[Claim] 通过 Builder Relayer 提交 redeemPositions conditionId=${conditionId}`);
    const response = await relayClient.execute([redeemTx], 'Redeem positions');
    const initialTxHash = response.transactionHash ?? null;
    const result = await response.wait();

    if (!result) {
      // pollUntilState 在 STATE_FAILED 时返回 undefined
      console.error(`[Claim] 链上交易失败 txHash=${initialTxHash}`);
      return {
        success: false,
        txHash: initialTxHash,
        error: '链上交易失败（合约已回滚）。可能原因：该 condition 尚未结算，或已经 claim 过。',
      };
    }

    const txHash = result.transactionHash ?? result.txHash ?? initialTxHash;
    console.log(`[Claim] 交易已确认 txHash=${txHash}`);
    return { success: true, txHash, blockNumber: result?.blockNumber ?? null };
  } catch (err) {
    const msg = err?.message ?? String(err);
    console.error('[Claim] claimPosition 异常:', msg);
    return { success: false, error: msg };
  }
}
