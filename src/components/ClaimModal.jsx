import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store/useStore.js';
import { useT } from '../i18n.js';
import { fetchPositions, fetchBalance, sessionHeaders } from '../utils/api.js';

const POLYGON_SCAN = 'https://polygonscan.com/tx/';

export default function ClaimModal() {
  const lang = useStore((s) => s.lang);
  const modal = useStore((s) => s.claimModal);
  const closeClaimModal = useStore((s) => s.closeClaimModal);
  const setPositions = useStore((s) => s.setPositions);
  const setBalance = useStore((s) => s.setBalance);
  const t = useT(lang);

  const [status, setStatus] = useState('idle'); // idle | claiming | success | error
  const [result, setResult] = useState(null);

  const doClaim = useCallback(async () => {
    setStatus('claiming');
    setResult(null);
    try {
      const res = await fetch('/api/trade/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...sessionHeaders() },
        body: JSON.stringify({
          conditionId: modal.conditionId,
          outcomeIndex: modal.outcomeIndex,
        }),
      });
      let data;
      try { data = await res.json(); } catch { data = { success: false, error: `HTTP ${res.status}` }; }

      if (data.success) {
        setStatus('success');
        setResult(data);
        // 成功后刷新持仓和余额
        setTimeout(async () => {
          const { userAddress } = useStore.getState();
          if (userAddress) {
            const [pos, bal] = await Promise.all([fetchPositions(userAddress), fetchBalance(userAddress)]);
            setPositions(pos);
            setBalance(bal);
          }
        }, 3000);
      } else {
        setStatus('error');
        setResult(data);
      }
    } catch (err) {
      setStatus('error');
      setResult({ error: err?.message || t.toastNetErr });
    }
  }, [modal.conditionId, modal.outcomeIndex, t.toastNetErr, setPositions, setBalance]);

  useEffect(() => {
    if (modal.open) {
      setStatus('idle');
      setResult(null);
    }
  }, [modal.open]);

  if (!modal.open) return null;

  const txHash = result?.txHash;
  const shortTx = txHash ? `${txHash.slice(0, 10)}…${txHash.slice(-6)}` : '';

  return createPortal(
    <div className="modal-overlay" onClick={closeClaimModal}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{t.claimTitle}</h3>
          <button className="modal-close" onClick={closeClaimModal}>×</button>
        </div>

        <div className="modal-body">
          <div className="claim-modal-info">
            <div>{t.claimInfo(modal.title, Number(modal.value).toFixed(2))}</div>
            <div style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: 'var(--muted)' }}>
              conditionId: {modal.conditionId?.slice(0, 18)}…
            </div>
          </div>

          <div className="modal-status-area" style={{ marginTop: '0.75rem' }}>
            {status === 'idle' && (
              <div style={{ textAlign: 'center', padding: '0.5rem 0' }}>
                <button className="claim-btn" style={{ fontSize: '0.9rem', padding: '0.4rem 1.5rem' }} onClick={doClaim}>
                  {t.claimBtn}
                </button>
              </div>
            )}
            {status === 'claiming' && (
              <div className="modal-status modal-placing">
                <span className="spinner">⟳</span> {t.claiming}
              </div>
            )}
            {status === 'success' && (
              <div className="modal-status modal-success">
                <div>✓ {lang === 'zh' ? '领取成功' : 'Claimed successfully'}</div>
                {txHash && (
                  <div className="modal-order-id claim-tx-link" style={{ marginTop: '0.4rem' }}>
                    {t.txHashLabel}:{' '}
                    <a href={`${POLYGON_SCAN}${txHash}`} target="_blank" rel="noreferrer">
                      {shortTx}
                    </a>
                  </div>
                )}
              </div>
            )}
            {status === 'error' && (
              <div className="modal-status modal-error">
                <div>✗ {result?.error || t.claimFail}</div>
                <button className="retry-btn" onClick={doClaim}>{t.retry}</button>
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="modal-close-btn" onClick={closeClaimModal}>{t.close}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
