import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store/useStore.js';
import { useT } from '../i18n.js';
import { fetchPositions, fetchBalance, sessionHeaders } from '../utils/api.js';

export default function BuyModal() {
  const lang = useStore((s) => s.lang);
  const modal = useStore((s) => s.buyModal);
  const closeBuyModal = useStore((s) => s.closeBuyModal);
  const setPositions = useStore((s) => s.setPositions);
  const setBalance = useStore((s) => s.setBalance);
  const t = useT(lang);

  const [status, setStatus] = useState('idle'); // idle | placing | success | error
  const [result, setResult] = useState(null);

  const placeOrder = useCallback(async () => {
    setStatus('placing');
    setResult(null);
    try {
      const res = await fetch('/api/trade/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...sessionHeaders() },
        body: JSON.stringify({
          tokenId: modal.tokenId,
          side: 'BUY',
          shares: modal.shares,
          askPrice: modal.askPrice,
        }),
      });
      let data;
      try { data = await res.json(); } catch { data = { success: false, error: `HTTP ${res.status}` }; }

      if (data.success) {
        setStatus('success');
        setResult(data);
        // Refresh positions and balance after successful order
        setTimeout(async () => {
          const { userAddress } = useStore.getState();
          if (userAddress) {
            const [pos, bal] = await Promise.all([fetchPositions(userAddress), fetchBalance(userAddress)]);
            setPositions(pos);
            setBalance(bal);
          }
        }, 2000);
      } else {
        setStatus('error');
        setResult(data);
      }
    } catch (err) {
      setStatus('error');
      setResult({ error: err?.message || t.toastNetErr });
    }
  }, [modal.tokenId, modal.shares, modal.askPrice, t.toastNetErr, setPositions, setBalance]);

  // Auto-place order when modal opens
  useEffect(() => {
    if (modal.open) {
      setStatus('idle');
      setResult(null);
      placeOrder();
    }
  }, [modal.open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!modal.open) return null;

  const statusMap = {
    matched: lang === 'zh' ? '✓ 已成交' : '✓ Filled',
    live: lang === 'zh' ? '挂单中（未即时成交）' : 'Live (not filled)',
    delayed: lang === 'zh' ? '延迟处理中' : 'Delayed',
    unmatched: lang === 'zh' ? '已提交（等待匹配）' : 'Submitted (pending match)',
  };
  const statusLabel = result?.status
    ? (statusMap[result.status] ?? result.status)
    : (lang === 'zh' ? '已提交' : 'Submitted');

  return createPortal(
    <div className="modal-overlay" onClick={closeBuyModal}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            {t.buyBtn}: <span className={modal.outcome?.toLowerCase().includes('up') ? 'up' : 'down'}>
              {modal.outcome}
            </span>
          </h3>
          <button className="modal-close" onClick={closeBuyModal}>×</button>
        </div>

        <div className="modal-body">
          <div className="modal-order-info">
            <div>
              <span className="modal-label">{t.shareUnit.charAt(0).toUpperCase() + t.shareUnit.slice(1)}</span>
              <span className="modal-value">{modal.shares}</span>
            </div>
            <div>
              <span className="modal-label">{lang === 'zh' ? '单价' : 'Price'}</span>
              <span className="modal-value">{(modal.askPrice * 100).toFixed(1)}¢</span>
            </div>
            <div>
              <span className="modal-label">{t.cost}</span>
              <span className="modal-value">${(modal.shares * modal.askPrice).toFixed(2)}</span>
            </div>
            <div>
              <span className="modal-label">{t.payout}</span>
              <span className="modal-value highlight">${modal.shares}.00</span>
            </div>
          </div>

          <div className="modal-status-area">
            {status === 'placing' && (
              <div className="modal-status modal-placing">
                <span className="spinner">⟳</span> {t.toastPlacing}
              </div>
            )}
            {status === 'success' && (
              <div className="modal-status modal-success">
                <div>✓ {t.toastSuccess(statusLabel)}</div>
                {result?.orderID && (
                  <div className="modal-order-id">
                    {t.orderIdLabel}: {result.orderID.slice(0, 16)}…
                  </div>
                )}
              </div>
            )}
            {status === 'error' && (
              <div className="modal-status modal-error">
                <div>✗ {result?.error || t.toastServerErr}</div>
                <button className="retry-btn" onClick={placeOrder}>
                  {t.retry}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="modal-close-btn" onClick={closeBuyModal}>{t.close}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
