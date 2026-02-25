import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore.js';
import { POSITIONS_REFRESH_SEC } from '../utils/market.js';
import { fetchPositions, fetchBalance } from '../utils/api.js';

export function usePositionsAndBalance() {
  const posTimer = useRef(null);
  const balTimer = useRef(null);
  const isRunning = useRef(false);

  const setPositions = useStore((s) => s.setPositions);
  const setBalance = useStore((s) => s.setBalance);

  useEffect(() => {
    isRunning.current = true;

    const refreshPositions = async () => {
      const { userAddress } = useStore.getState();
      if (!userAddress) { setPositions([]); return; }
      const pos = await fetchPositions(userAddress);
      setPositions(pos);
    };

    const refreshBalance = async () => {
      const { userAddress } = useStore.getState();
      if (!userAddress) { setBalance(null); return; }
      const bal = await fetchBalance(userAddress);
      setBalance(bal);
    };

    const runPos = () => {
      if (!isRunning.current) return;
      refreshPositions();
      posTimer.current = setTimeout(runPos, POSITIONS_REFRESH_SEC * 1000);
    };

    const runBal = () => {
      if (!isRunning.current) return;
      refreshBalance();
      balTimer.current = setTimeout(runBal, POSITIONS_REFRESH_SEC * 1000);
    };

    runPos();
    runBal();

    return () => {
      isRunning.current = false;
      if (posTimer.current) { clearTimeout(posTimer.current); posTimer.current = null; }
      if (balTimer.current) { clearTimeout(balTimer.current); balTimer.current = null; }
    };
  }, [setPositions, setBalance]);

  // Expose manual refresh functions via the store so BuyModal can trigger them
  return {
    refreshPositions: () => {
      const { userAddress } = useStore.getState();
      if (userAddress) fetchPositions(userAddress).then(useStore.getState().setPositions);
    },
    refreshBalance: () => {
      const { userAddress } = useStore.getState();
      if (userAddress) fetchBalance(userAddress).then(useStore.getState().setBalance);
    },
  };
}
