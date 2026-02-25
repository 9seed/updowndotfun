import { useOrderBookWS } from './hooks/useOrderBookWS.js';
import { useMarketRefresh } from './hooks/useMarketRefresh.js';
import { usePriceRefresh } from './hooks/usePriceRefresh.js';
import { useHistoryPolling } from './hooks/useHistoryPolling.js';
import { usePositionsAndBalance } from './hooks/usePositionsAndBalance.js';
import { usePortfolioData } from './hooks/usePortfolioData.js';
import Header from './components/Header.jsx';
import MarketsGrid from './components/MarketsGrid.jsx';
import PortfolioPanel from './components/PortfolioPanel.jsx';
import BuyModal from './components/BuyModal.jsx';
import ClaimModal from './components/ClaimModal.jsx';
import ClaimAllModal from './components/ClaimAllModal.jsx';

export default function App() {
  const wsRef = useOrderBookWS();
  useMarketRefresh(wsRef);
  usePriceRefresh();
  useHistoryPolling();
  usePositionsAndBalance();
  usePortfolioData();

  return (
    <>
      <div id="header">
        <Header />
      </div>
      <div id="app">
        <MarketsGrid />
        <PortfolioPanel />
      </div>
      <BuyModal />
      <ClaimModal />
      <ClaimAllModal />
    </>
  );
}
