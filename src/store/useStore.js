import { create } from 'zustand';
import { ASSETS, currentWindowStart } from '../utils/market.js';

export const useStore = create((set) => ({
  // I18N
  lang: (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) || 'zh',
  setLang: (lang) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem('lang', lang);
    set({ lang });
  },

  // User wallet
  userAddress: (typeof localStorage !== 'undefined' && localStorage.getItem('polymarket_wallet')) || '',
  setUserAddress: (addr) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem('polymarket_wallet', addr);
    set({ userAddress: addr });
  },
  balance: null,       // 展示用总余额
  balanceDetail: null, // { clob, usdce, native } 细分
  setBalance: (balance) => set({ balance }),
  setBalanceDetail: (detail) => set({ balanceDetail: detail }),

  // MetaMask / session wallet
  connectedAddress: '',       // MetaMask 地址（仅展示）
  setConnectedAddress: (addr) => set({ connectedAddress: addr }),
  sessionActive: false,       // 是否有活跃会话
  setSessionActive: (v) => set({ sessionActive: v }),
  sessionId: null,            // 后端会话 ID，用于请求 header
  setSessionId: (id) => set({ sessionId: id }),

  // Markets cache: { [asset]: { [windowTs]: marketData | null } }
  marketsCache: Object.fromEntries(ASSETS.map((a) => [a, {}])),
  setMarket: (asset, windowTs, market) =>
    set((state) => ({
      marketsCache: {
        ...state.marketsCache,
        [asset]: { ...state.marketsCache[asset], [windowTs]: market },
      },
    })),

  // Order books: { [tokenId]: { bids, asks } }
  orderBooks: {},
  setOrderBook: (tokenId, ob) =>
    set((state) => ({ orderBooks: { ...state.orderBooks, [tokenId]: ob } })),

  // Up probability chart history: { [asset]: [{ time, upProb }] }
  tradeHistory: Object.fromEntries(ASSETS.map((a) => [a, []])),
  pushTradeHistoryPoint: (asset, point) =>
    set((state) => {
      const arr = [...state.tradeHistory[asset], point];
      const cutoff = Date.now() - 300000;
      const trimmed = arr.filter((p) => p.time >= cutoff).slice(-500);
      return { tradeHistory: { ...state.tradeHistory, [asset]: trimmed } };
    }),

  // Settlement history: { [asset]: [{ ts, result, closedTime }] }
  historyCache: Object.fromEntries(ASSETS.map((a) => [a, []])),
  setHistoryCache: (asset, records) =>
    set((state) => ({ historyCache: { ...state.historyCache, [asset]: records } })),

  // Positions list
  positions: [],
  setPositions: (positions) => set({ positions }),

  // Shares per token: { [tokenId]: number }
  sharesMap: {},
  setShares: (tokenId, shares) =>
    set((state) => ({ sharesMap: { ...state.sharesMap, [tokenId]: Math.max(1, Math.floor(shares)) } })),

  // Buy modal state
  buyModal: { open: false, tokenId: '', outcome: '', askPrice: 0, shares: 0 },
  openBuyModal: (info) => set({ buyModal: { open: true, ...info } }),
  closeBuyModal: () => set((state) => ({ buyModal: { ...state.buyModal, open: false } })),

  // Portfolio panel tab: 'positions' | 'trades' | 'settlement'
  portfolioTab: 'positions',
  setPortfolioTab: (tab) => set({ portfolioTab: tab }),

  // User activity records: trades and redeems from Data API
  userTrades: [],
  setUserTrades: (list) => set({ userTrades: list }),
  userRedeems: [],
  setUserRedeems: (list) => set({ userRedeems: list }),

  // Claim modal state
  claimModal: { open: false, conditionId: '', outcomeIndex: 0, title: '', value: 0 },
  openClaimModal: (info) => set({ claimModal: { open: true, ...info } }),
  closeClaimModal: () => set((state) => ({ claimModal: { ...state.claimModal, open: false } })),

  // Claim All modal state
  claimAllModal: { open: false, positions: [] },
  openClaimAllModal: (positions) => set({ claimAllModal: { open: true, positions } }),
  closeClaimAllModal: () => set({ claimAllModal: { open: false, positions: [] } }),

  // 当前事件窗口时间戳，MarketsGrid 订阅此值以响应窗口切换
  currentWindowTs: currentWindowStart(),

  // 窗口切换时重置市场数据（不整页刷新，保留 MetaMask 会话）
  resetForNewWindow: (newWindowTs) => set({
    currentWindowTs: newWindowTs,
    marketsCache: Object.fromEntries(ASSETS.map((a) => [a, {}])),
    orderBooks: {},
    tradeHistory: Object.fromEntries(ASSETS.map((a) => [a, []])),
  }),
}));
