import { useState } from 'react';
import { useStore } from '../store/useStore.js';
import { useWallet } from '../hooks/useWallet.js';
import { useT } from '../i18n.js';
import { sessionHeaders, fetchBalance } from '../utils/api.js';

function shortAddr(addr) {
  if (!addr) return '';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };
  return (
    <button className="copy-addr-btn" onClick={handleCopy} title="复制地址">
      {copied ? '✓' : '⎘'}
    </button>
  );
}

function ApproveButton({ lang, onApproved }) {
  const [status, setStatus] = useState('idle'); // idle | loading | ok | err
  const [msg, setMsg] = useState('');

  const handleApprove = async () => {
    setStatus('loading');
    setMsg('');
    try {
      const res = await fetch('/api/trade/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...sessionHeaders() },
      });
      const data = await res.json();
      if (data.success) {
        setStatus('ok');
        setMsg(data.alreadyApproved
          ? (lang === 'zh' ? '已授权' : 'Already approved')
          : (data.txHash ? `授权成功 txHash: ${data.txHash.slice(0, 10)}…` : '授权成功'));
        onApproved?.();
      } else {
        setStatus('err');
        setMsg(data.error || '授权失败');
      }
    } catch (e) {
      setStatus('err');
      setMsg(e?.message || '网络错误');
    }
  };

  if (status === 'ok') return <span className="approve-ok">✓ {msg}</span>;

  return (
    <div className="approve-row">
      <button
        className="approve-btn"
        onClick={handleApprove}
        disabled={status === 'loading'}
      >
        {status === 'loading'
          ? <><span className="spinner">⟳</span> {lang === 'zh' ? '授权中...' : 'Approving...'}</>
          : (lang === 'zh' ? '授权 USDC.e 下单' : 'Approve USDC.e for trading')}
      </button>
      {status === 'err' && <span className="wallet-error" style={{ marginTop: 0 }}>{msg}</span>}
    </div>
  );
}

function ExportKeyButton({ lang }) {
  const [step, setStep] = useState('idle'); // idle | confirm | revealed
  const [pk, setPk] = useState('');
  const [copied, setCopied] = useState(false);

  const handleExport = async () => {
    if (step === 'revealed') { setStep('idle'); setPk(''); return; }
    if (step === 'idle') { setStep('confirm'); return; }
    // step === 'confirm' → fetch key
    try {
      const res = await fetch('/api/auth/export-key', {
        headers: { ...sessionHeaders() },
      });
      const data = await res.json();
      if (data.privateKey) {
        setPk(data.privateKey);
        setStep('revealed');
      }
    } catch {}
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(pk);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <div className="export-key-section">
      <button className="export-key-btn" onClick={handleExport}>
        {step === 'revealed'
          ? (lang === 'zh' ? '隐藏私钥' : 'Hide Key')
          : step === 'confirm'
            ? (lang === 'zh' ? '确认导出' : 'Confirm Export')
            : (lang === 'zh' ? '导出私钥' : 'Export Key')}
      </button>
      {step === 'confirm' && (
        <div className="export-key-reveal">
          <div className="export-key-warning">
            {lang === 'zh'
              ? '⚠ 导出私钥存在安全风险。拥有此私钥即可完全控制派生地址中的所有资产。确定要继续吗？'
              : '⚠ Exporting the private key is a security risk. Anyone with this key has full control over the sub-account assets. Continue?'}
          </div>
          <button className="export-key-btn" style={{ marginTop: '0.3rem', borderColor: 'var(--yellow)' }}
            onClick={() => setStep('idle')}>
            {lang === 'zh' ? '取消' : 'Cancel'}
          </button>
        </div>
      )}
      {step === 'revealed' && (
        <div className="export-key-reveal">
          <div className="export-key-warning">
            {lang === 'zh'
              ? '⚠ 请勿泄露此私钥，拥有私钥即可控制该地址的全部资产'
              : '⚠ Never share this key — it controls all assets at this address'}
          </div>
          <div className="export-key-value" title={pk}>
            <code>{pk}</code>
            <button className="copy-addr-btn" onClick={handleCopy}>{copied ? '✓' : '⎘'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function WalletConnectButton() {
  const lang = useStore((s) => s.lang);
  const connectedAddress = useStore((s) => s.connectedAddress);
  const subAccountAddress = useStore((s) => s.userAddress);
  const sessionActive = useStore((s) => s.sessionActive);
  const balance = useStore((s) => s.balance);
  const balanceDetail = useStore((s) => s.balanceDetail);
  const t = useT(lang);

  const { connect, disconnect, loading, error } = useWallet();

  const fmtUSDC = (n) =>
    n != null
      ? `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : '—';

  // 判断是否需要显示授权按钮（基于链上 allowance，而非 CLOB 余额）
  const needsApprove =
    balanceDetail != null &&
    balanceDetail.usdce > 0 &&
    !balanceDetail.approved;

  // 需要 MATIC 才能做链上 approve
  const needsMatic =
    needsApprove &&
    balanceDetail != null &&
    (balanceDetail.matic ?? 0) < 0.0001;

  // 只有原生 USDC，没有 USDC.e
  const onlyNativeUsdc =
    balanceDetail != null &&
    balanceDetail.usdce === 0 &&
    balanceDetail.native > 0;

  const refreshBalance = async () => {
    const { userAddress, sessionId } = useStore.getState();
    if (userAddress) {
      const bal = await fetchBalance(userAddress, sessionId);
      useStore.getState().setBalance(bal);
    }
  };

  if (loading) {
    return (
      <div className="wallet-connect-row">
        <button className="wallet-btn wallet-btn--connecting" disabled>
          <span className="spinner">⟳</span> {t.connecting}
        </button>
      </div>
    );
  }

  if (sessionActive && connectedAddress) {
    return (
      <div className="wallet-connect-row">
        {/* 顶行：MetaMask 地址 + 余额 + 断开 */}
        <div className="wallet-connected-info">
          <span className="wallet-address-badge" title={connectedAddress}>
            ● {shortAddr(connectedAddress)}
          </span>
          <span className="wallet-balance-display">
            {t.balanceLabel}{' '}
            <strong>
              {balanceDetail?.usdce > 0
                ? `${fmtUSDC(balanceDetail.usdce)} USDC.e`
                : fmtUSDC(balance)}
            </strong>
            {balanceDetail?.approved && (
              <span className="balance-clob-tag"> ✓ {lang === 'zh' ? '已授权' : 'Approved'}</span>
            )}
          </span>
          <button className="wallet-btn wallet-btn--disconnect" onClick={disconnect}>
            {t.disconnectWallet}
          </button>
        </div>

        {/* 余额细分说明 */}
        {balanceDetail && (
          <div className="balance-breakdown">
            <span>USDC.e: {fmtUSDC(balanceDetail.usdce)}</span>
            <span>{lang === 'zh' ? '原生' : 'Native'} USDC: {fmtUSDC(balanceDetail.native)}</span>
            <span>MATIC: {(balanceDetail.matic ?? 0).toFixed(4)}</span>
          </div>
        )}

        {/* 充值地址 */}
        <div className="wallet-subaccount-row">
          <span className="wallet-subaccount-label">
            {lang === 'zh' ? '充值 USDC.e 到此地址 (Polygon)：' : 'Deposit USDC.e to this address (Polygon):'}
          </span>
          <span className="wallet-subaccount-addr" title={subAccountAddress}>
            {subAccountAddress || '—'}
          </span>
          {subAccountAddress && <CopyButton text={subAccountAddress} />}
        </div>

        {/* 导出私钥 */}
        <ExportKeyButton lang={lang} />

        {/* 授权提示：有 USDC.e 但未授权 */}
        {needsApprove && (
          <div className="wallet-notice wallet-notice--warn">
            {needsMatic ? (
              lang === 'zh'
                ? `⚠ 检测到 USDC.e，但需要少量 MATIC（约 0.001）才能完成链上授权。请往 ${subAccountAddress} 转入少量 MATIC 后点击授权。`
                : `⚠ USDC.e detected, but a small amount of MATIC (~0.001) is needed for on-chain approval. Send MATIC to ${subAccountAddress} first.`
            ) : (
              lang === 'zh'
                ? '已检测到 USDC.e，但尚未授权 Polymarket Exchange。点击下方按钮完成一次性链上授权（消耗少量 MATIC Gas）：'
                : 'USDC.e detected but not yet approved for Polymarket Exchange. Click below to approve (small MATIC gas fee):'
            )}
            {!needsMatic && <ApproveButton lang={lang} onApproved={refreshBalance} />}
          </div>
        )}

        {/* 提示：只有原生 USDC */}
        {onlyNativeUsdc && (
          <div className="wallet-notice wallet-notice--info">
            {lang === 'zh'
              ? `⚠ 检测到 ${fmtUSDC(balanceDetail.native)} 原生 USDC，但 Polymarket 只接受 USDC.e。请在 Polygon 上将原生 USDC 换成 USDC.e（可用 Uniswap / QuickSwap），再充值到上方地址。`
              : `⚠ You have ${fmtUSDC(balanceDetail.native)} native USDC, but Polymarket requires USDC.e. Please swap on Polygon (Uniswap/QuickSwap) and deposit USDC.e to the address above.`}
          </div>
        )}

        {error && <div className="wallet-error">{error}</div>}
      </div>
    );
  }

  return (
    <div className="wallet-connect-row">
      <button className="wallet-btn wallet-btn--connect" onClick={connect}>
        {t.connectWallet}
      </button>
      {error && <div className="wallet-error">{error}</div>}
    </div>
  );
}
