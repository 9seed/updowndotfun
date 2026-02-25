import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore.js';
import { useT } from '../i18n.js';
import { WINDOW_SEC, secondsUntilEnd, secondsElapsed } from '../utils/market.js';

export default function TimeProgress({ windowTs }) {
  const lang = useStore((s) => s.lang);
  const t = useT(lang);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, []);

  const nowTs = Math.floor(Date.now() / 1000);

  if (windowTs <= nowTs && nowTs < windowTs + WINDOW_SEC) {
    const elapsed = secondsElapsed(windowTs);
    const remaining = secondsUntilEnd(windowTs);
    const pct = elapsed / WINDOW_SEC;
    const barLen = 30;
    const done = Math.round(pct * barLen);
    const timeBar = '▓'.repeat(done) + '░'.repeat(barLen - done);
    return <div className="progress">{t.progress(timeBar, remaining)}</div>;
  }
  if (nowTs >= windowTs + WINDOW_SEC) {
    return <div className="muted red">{t.windowEnded}</div>;
  }
  const wait = windowTs - nowTs;
  return <div className="yellow">{t.startsIn(wait)}</div>;
}
