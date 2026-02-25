import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore.js';
import { fetchActivity } from '../utils/api.js';

const TRADE_REFRESH_MS = 60_000; // 1 分钟刷新一次

export function usePortfolioData() {
  const tradeTimer = useRef(null);
  const redeemTimer = useRef(null);
  const isRunning = useRef(false);
  const lastAddress = useRef('');

  const setUserTrades = useStore((s) => s.setUserTrades);
  const setUserRedeems = useStore((s) => s.setUserRedeems);

  useEffect(() => {
    isRunning.current = true;

    const refresh = async () => {
      const { userAddress } = useStore.getState();

      if (!userAddress) {
        setUserTrades([]);
        setUserRedeems([]);
        return;
      }

      // 地址变化时立即刷新
      const addressChanged = userAddress !== lastAddress.current;
      lastAddress.current = userAddress;

      if (addressChanged) {
        // 并发获取交易和结算记录
        const [trades, redeems] = await Promise.all([
          fetchActivity(userAddress, 'TRADE', 50),
          fetchActivity(userAddress, 'REDEEM', 50),
        ]);
        setUserTrades(trades);
        setUserRedeems(redeems);
      }
    };

    const runTrades = async () => {
      if (!isRunning.current) return;
      const { userAddress } = useStore.getState();
      if (userAddress) {
        const trades = await fetchActivity(userAddress, 'TRADE', 50);
        setUserTrades(trades);
      }
      tradeTimer.current = setTimeout(runTrades, TRADE_REFRESH_MS);
    };

    const runRedeems = async () => {
      if (!isRunning.current) return;
      const { userAddress } = useStore.getState();
      if (userAddress) {
        const redeems = await fetchActivity(userAddress, 'REDEEM', 50);
        setUserRedeems(redeems);
      }
      redeemTimer.current = setTimeout(runRedeems, TRADE_REFRESH_MS);
    };

    // 立即执行首次刷新
    refresh().then(() => {
      runTrades();
      runRedeems();
    });

    return () => {
      isRunning.current = false;
      if (tradeTimer.current) { clearTimeout(tradeTimer.current); tradeTimer.current = null; }
      if (redeemTimer.current) { clearTimeout(redeemTimer.current); redeemTimer.current = null; }
    };
  }, [setUserTrades, setUserRedeems]);
}
