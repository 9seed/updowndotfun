import { useState, useCallback } from 'react';
import { useStore } from '../store/useStore.js';
import { fetchPositions, fetchBalance } from '../utils/api.js';

// EIP-712 类型定义（与后端保持一致）
const EIP712_DOMAIN = {
  name: 'updown.fun',
  version: '1',
  chainId: 137,
};

const EIP712_TYPES = {
  EIP712Domain: [
    { name: 'name', type: 'string' },
    { name: 'version', type: 'string' },
    { name: 'chainId', type: 'uint256' },
  ],
  SubAccountAuth: [
    { name: 'owner', type: 'address' },
    { name: 'purpose', type: 'string' },
  ],
};

const EIP712_PURPOSE = 'Authorize deterministic sub-account for trading';

export function useWallet() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const setUserAddress = useStore((s) => s.setUserAddress);
  const setConnectedAddress = useStore((s) => s.setConnectedAddress);
  const setSessionActive = useStore((s) => s.setSessionActive);
  const setSessionId = useStore((s) => s.setSessionId);
  const setPositions = useStore((s) => s.setPositions);
  const setBalance = useStore((s) => s.setBalance);

  const connect = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!window.ethereum) {
        throw new Error('未检测到 MetaMask，请先安装 MetaMask 插件');
      }

      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const address = accounts[0];

      // EIP-712 结构化签名：绑定域名和链 ID，防止跨站签名复用
      const typedData = {
        types: EIP712_TYPES,
        primaryType: 'SubAccountAuth',
        domain: EIP712_DOMAIN,
        message: {
          owner: address,
          purpose: EIP712_PURPOSE,
        },
      };

      const signature = await window.ethereum.request({
        method: 'eth_signTypedData_v4',
        params: [address, JSON.stringify(typedData)],
      });

      // 只发送签名到后端，私钥在服务端用 HKDF + pepper 派生，前端不接触私钥
      const res = await fetch('/api/auth/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, signature }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `服务器错误 ${res.status}`);
      }

      const { sessionId, sessionAddress } = await res.json();

      // connectedAddress 用于 Header 显示 MetaMask 地址
      // userAddress 用于查询持仓/余额（会话子账户）
      setConnectedAddress(address);
      setUserAddress(sessionAddress);
      setSessionId(sessionId);
      setSessionActive(true);

      // 加载会话子账户的持仓和余额
      const [pos, bal] = await Promise.all([
        fetchPositions(sessionAddress),
        fetchBalance(sessionAddress, sessionId),
      ]);
      setPositions(pos);
      setBalance(bal);
    } catch (err) {
      setError(err.message || '连接失败');
    } finally {
      setLoading(false);
    }
  }, [setUserAddress, setConnectedAddress, setSessionActive, setSessionId, setPositions, setBalance]);

  const disconnect = useCallback(async () => {
    const { sessionId } = useStore.getState();
    if (sessionId) {
      fetch('/api/auth/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Session-Id': sessionId },
      }).catch(() => {});
    }
    setConnectedAddress('');
    setUserAddress('');
    setSessionId(null);
    setSessionActive(false);
    setPositions([]);
    setBalance(null);
    setError(null);
  }, [setConnectedAddress, setUserAddress, setSessionId, setSessionActive, setPositions, setBalance]);

  return { connect, disconnect, loading, error };
}
