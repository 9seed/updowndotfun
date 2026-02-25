import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store/useStore.js';
import { useT } from '../i18n.js';
import { fetchPositions, fetchBalance, sessionHeaders } from '../utils/api.js';

const POLYGON_SCAN = 'https://polygonscan.com/tx/';

// item status: 'pending' | 'claiming' | 'success' | 'failed'
function buildItems(positions) {
  return positions.map((p) => ({
    conditionId: p.conditionId ?? '',
    outcomeIndex: p.outcomeIndex ?? 0,
    title: p.title ?? p.slug ?? '—',
    value: p.currentValue ?? 0,
    status: 'pending',
    txHash: null,
    error: null,
  }));
}

export default function ClaimAllModal() {
  const lang = useStore((s) => s.lang);
  const modal = useStore((s) => s.claimAllModal);
  const closeClaimAllModal = useStore((s) => s.closeClaimAllModal);
  const setPositions = useStore((s) => s.setPositions);
  const setBalance = useStore((s) => s.setBalance);
  const t = useT(lang);

  const [items, setItems] = useState([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const runningRef = useRef(false);

  useEffect(() => {
    if (modal.open) {
      setItems(buildItems(modal.positions));
      setRunning(false);
      setDone(false);
      runningRef.current = false;
    }
  }, [modal.open]);

  const updateItem = useCallback((idx, patch) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }, []);

  const startClaimAll = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    setDone(false);

    const snapshot = [...items];

    for (let i = 0; i < snapshot.length; i++) {
      const item = snapshot[i];
      updateItem(i, { status: 'claiming' });
      try {
        const res = await fetch('/api/trade/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...sessionHeaders() },
          body: JSON.stringify({
            conditionId: item.conditionId,
            outcomeIndex: item.outcomeIndex,
          }),
        });
        let data;
        try { data = await res.json(); } catch { data = { success: false, error: `HTTP ${res.status}` }; }

        if (data.success) {
          updateItem(i, { status: 'success', txHash: data.txHash ?? null });
          snapshot[i] = { ...item, status: 'success', txHash: data.txHash };
        } else {
          updateItem(i, { status: 'failed', error: data.error ?? t.claimFail });
          snapshot[i] = { ...item, status: 'failed' };
        }
      } catch (err) {
        updateItem(i, { status: 'failed', error: err?.message ?? t.toastNetErr });
        snapshot[i] = { ...item, status: 'failed' };
      }
    }

    runningRef.current = false;
    setRunning(false);
    setDone(true);

    // 全部完成后刷新持仓和余额
    setTimeout(async () => {
      const { userAddress } = useStore.getState();
      if (userAddress) {
        const [pos, bal] = await Promise.all([fetchPositions(userAddress), fetchBalance(userAddress)]);
        setPositions(pos);
        setBalance(bal);
      }
    }, 2000);
  }, [items, updateItem, t.claimFail, t.toastNetErr, setPositions, setBalance]);

  if (!modal.open) return null;

  const total = items.length;
  const succeeded = items.filter((it) => it.status === 'success').length;
  const failed = items.filter((it) => it.status === 'failed').length;
  const finishedCount = succeeded + failed;

  const statusLabel = (item) => {
    switch (item.status) {
      case 'pending': return { text: t.claimAllStatus_pending, cls: 'pending' };
      case 'claiming': return { text: t.claimAllStatus_claiming, cls: 'claiming' };
      case 'success': return { text: t.claimAllStatus_success, cls: 'success' };
      case 'failed': return { text: item.error ? item.error.slice(0, 40) : t.claimAllStatus_failed, cls: 'failed' };
      default: return { text: '', cls: '' };
    }
  };

  return createPortal(
    <div className="modal-overlay" onClick={done ? closeClaimAllModal : undefined}>
      <div className="modal-content" style={{ minWidth: '420px', maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{t.claimAllTitle(total)}</h3>
          <button className="modal-close" onClick={closeClaimAllModal} disabled={running}>×</button>
        </div>

        <div className="modal-body">
          <div className="claim-all-list">
            {items.map((item, idx) => {
              const { text, cls } = statusLabel(item);
              const shortTx = item.txHash
                ? `${item.txHash.slice(0, 8)}…${item.txHash.slice(-6)}`
                : null;
              return (
                <div key={idx} className={`claim-all-item status-${item.status}`}>
                  <div className="claim-all-item-title" title={item.title}>{item.title}</div>
                  <div className="claim-all-item-value">${item.value.toFixed(2)}</div>
                  <div className={`claim-all-item-status ${cls}`}>
                    {item.status === 'claiming' && <span className="spinner">⟳ </span>}
                    {item.status === 'success' && shortTx ? (
                      <span className="claim-all-tx-link">
                        ✓ <a href={`${POLYGON_SCAN}${item.txHash}`} target="_blank" rel="noreferrer">{shortTx}</a>
                      </span>
                    ) : (
                      text
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: '0.5rem' }}>
            {running && (
              <div className="claim-all-footer-progress">
                {t.claimAllProgress(finishedCount, total)} &nbsp;·&nbsp; {t.claimAllRunning}
              </div>
            )}
            {done && (
              <div className={`claim-all-footer-done ${failed > 0 ? '' : 'modal-success'}`}
                style={{ color: failed > 0 ? 'var(--yellow)' : 'var(--green)' }}>
                {t.claimAllDone(succeeded, failed)}
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          {!running && !done && (
            <button className="claim-btn" style={{ fontSize: '0.9rem', padding: '0.4rem 1.5rem' }} onClick={startClaimAll}>
              {t.claimAllBtn(total)}
            </button>
          )}
          <button
            className="modal-close-btn"
            onClick={closeClaimAllModal}
            disabled={running}
          >
            {t.close}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
