import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore.js';
import { useT } from '../i18n.js';
import { formatUtcNow, windowLabel, windowsToTrack, LOOK_BACK, LOOK_AHEAD } from '../utils/market.js';
import WalletConnectButton from './WalletConnectButton.jsx';

export default function Header() {
  const lang = useStore((s) => s.lang);
  const setLang = useStore((s) => s.setLang);
  const t = useT(lang);

  const [now, setNow] = useState(formatUtcNow);

  useEffect(() => {
    const id = setInterval(() => setNow(formatUtcNow()), 1000);
    return () => clearInterval(id);
  }, []);

  const windows = windowsToTrack(LOOK_BACK, LOOK_AHEAD);
  const currentWindowLabel = windows[0] != null ? windowLabel(windows[0]) : '—';

  return (
    <header className="header">
      <button
        className="lang-btn"
        title="切换语言 / Switch Language"
        onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
      >
        {lang === 'zh' ? 'EN' : '中文'}
      </button>
      <h1>BTC / ETH / SOL / XRP 5-Minute Up/Down Tracker</h1>
      <div className="meta">{now}</div>
      <div className="meta">{t.window}: {currentWindowLabel}</div>
      <WalletConnectButton />
    </header>
  );
}
