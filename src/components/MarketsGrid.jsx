import { useMemo } from 'react';
import { useStore } from '../store/useStore.js';
import { ASSETS, windowsToTrack, LOOK_BACK, LOOK_AHEAD } from '../utils/market.js';
import MarketPanel from './MarketPanel.jsx';

export default function MarketsGrid() {
  const currentWindowTs = useStore((s) => s.currentWindowTs);
  const windows = useMemo(() => windowsToTrack(LOOK_BACK, LOOK_AHEAD), [currentWindowTs]);

  return (
    <div className="columns">
      {ASSETS.map((asset) => (
        <div key={asset} className="column">
          <div className="column-title">{asset.toUpperCase()} 5-Minute</div>
          <div className="panels">
            {windows.map((windowTs) => (
              <MarketPanel key={`${asset}-${windowTs}`} asset={asset} windowTs={windowTs} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
