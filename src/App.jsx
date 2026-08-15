// ============================================================
//  CoreAI Pool — Главный компонент
//
//  Авторизация: MetaMask напрямую через window.ethereum
//  Сеть: BNB Smart Chain (56)
//  Токен: USDT
// ============================================================

import { useState, useEffect, useRef, useCallback } from "react";
import { ethers } from "ethers";

import {
  CHAIN_ID,
  CHAIN_NAME,
  RPC_URL,
  API_URL,
  CONTRACT_ADDRESS,
  TOKEN_ADDRESS,
  TOKEN_DECIMALS,
  TOKEN_SYMBOL,
  SUBSCRIPTION_TIERS,
} from "./config.js";
import "./App.css";

// ——— ABI контракта ———
const POOL_ABI = [
  "function buySubscription(uint256 amount, address referrer) external",
  "function getUserInfo(address) view returns (uint256,uint256,uint256,address,uint256,uint256,uint256,bool)",
  "function isSubscriptionActive(address) view returns (bool)",
  "function getPoolInfo() view returns (uint256,uint256,uint256,uint256,uint256)",
  "function operatorWallet() view returns (address)",
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
];

// ——— Параметры сети BSC для добавления в MetaMask ———
const BSC_PARAMS = {
  chainId: "0x" + CHAIN_ID.toString(16),
  chainName: CHAIN_NAME,
  nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
  rpcUrls: [RPC_URL],
  blockExplorerUrls: ["https://bscscan.com"],
};

function App() {
  // ==================== СОСТОЯНИЕ ====================
  const [wallet, setWallet] = useState(null);
  const [signer, setSigner] = useState(null);
  const [provider, setProvider] = useState(null);

  const [userData, setUserData] = useState(null);
  const [tokenBalance, setTokenBalance] = useState("0");
  const [poolStats, setPoolStats] = useState(null);

  const [selectedTier, setSelectedTier] = useState(1);
  const [isSubscribing, setIsSubscribing] = useState(false);

  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [selectedAI, setSelectedAI] = useState("gemini");
  const chatEndRef = useRef(null);

  const [activeTab, setActiveTab] = useState("dashboard");
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(false);

  // Админка
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminData, setAdminData] = useState(null);
  const [adminToken, setAdminToken] = useState("");
  const [isDeactivating, setIsDeactivating] = useState(false);

  // API-ключи
  const [apiKeys, setApiKeys] = useState(null);
  const [newKeyProvider, setNewKeyProvider] = useState("gemini");
  const [newKeyValue, setNewKeyValue] = useState("");

  // ==================== ПОДКЛЮЧЕНИЕ METAMASK ====================

  async function connectWallet() {
    if (!window.ethereum) {
      setError("Установите MetaMask: https://metamask.io");
      return;
    }

    setConnecting(true);
    setError("");

    try {
      // Запрашиваем аккаунт
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });

      // Проверяем/переключаем сеть на BSC
      const chainId = await window.ethereum.request({ method: "eth_chainId" });
      if (chainId !== BSC_PARAMS.chainId) {
        try {
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: BSC_PARAMS.chainId }],
          });
        } catch (switchErr) {
          // Сеть не добавлена — добавляем
          if (switchErr.code === 4902) {
            await window.ethereum.request({
              method: "wallet_addEthereumChain",
              params: [BSC_PARAMS],
            });
          } else {
            throw switchErr;
          }
        }
      }

      const p = new ethers.BrowserProvider(window.ethereum);
      const s = await p.getSigner();

      setProvider(p);
      setSigner(s);
      setWallet(accounts[0].toLowerCase());
    } catch (err) {
      if (err.code !== 4001) {
        setError("Ошибка подключения: " + (err.message || err));
      }
    } finally {
      setConnecting(false);
    }
  }

  function disconnectWallet() {
    setWallet(null);
    setSigner(null);
    setProvider(null);
    setUserData(null);
    setTokenBalance("0");
    setPoolStats(null);
    setIsAdmin(false);
    setAdminData(null);
    setMessages([]);
    setActiveTab("dashboard");
  }

  // ——— Автоматическое подключение если уже был залогинен ———
  useEffect(() => {
    async function autoConnect() {
      if (!window.ethereum) return;
      try {
        const accounts = await window.ethereum.request({
          method: "eth_accounts",
        });
        if (accounts.length > 0) {
          const p = new ethers.BrowserProvider(window.ethereum);
          const s = await p.getSigner();
          setProvider(p);
          setSigner(s);
          setWallet(accounts[0].toLowerCase());
        }
      } catch {
        // не подключён — ок
      }
    }
    autoConnect();
  }, []);

  // ——— Слушаем смену аккаунта/сети в MetaMask ———
  useEffect(() => {
    if (!window.ethereum) return;

    function handleAccountsChanged(accounts) {
      if (accounts.length === 0) {
        disconnectWallet();
      } else {
        setWallet(accounts[0].toLowerCase());
        // Обновляем провайдер
        const p = new ethers.BrowserProvider(window.ethereum);
        p.getSigner().then(setSigner);
        setProvider(p);
      }
    }

    function handleChainChanged() {
      window.location.reload();
    }

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener("chainChanged", handleChainChanged);
    };
  }, []);

  // ==================== ЗАГРУЗКА ДАННЫХ ====================

  const loadUserData = useCallback(async () => {
    if (!wallet || !provider) return;

    try {
      const res = await fetch(`${API_URL}/api/user/${wallet}`);
      if (res.ok) {
        setUserData(await res.json());
      }

      const token = new ethers.Contract(TOKEN_ADDRESS, ERC20_ABI, provider);
      const bal = await token.balanceOf(wallet);
      setTokenBalance(ethers.formatUnits(bal, TOKEN_DECIMALS));

      const statsRes = await fetch(`${API_URL}/api/stats`);
      if (statsRes.ok) {
        setPoolStats(await statsRes.json());
      }
    } catch (err) {
      console.error("Load error:", err);
    }
  }, [wallet, provider]);

  useEffect(() => {
    if (wallet && provider) {
      loadUserData();
      const interval = setInterval(loadUserData, 30000);
      return () => clearInterval(interval);
    }
  }, [wallet, provider, loadUserData]);

  // ==================== ПРОВЕРКА АДМИНА ====================

  const checkAdmin = useCallback(async () => {
    if (!wallet || !provider) return;
    try {
      const contract = new ethers.Contract(
        CONTRACT_ADDRESS,
        POOL_ABI,
        provider
      );
      const opWallet = await contract.operatorWallet();
      setIsAdmin(opWallet.toLowerCase() === wallet);
    } catch {
      setIsAdmin(false);
    }
  }, [wallet, provider]);

  useEffect(() => {
    checkAdmin();
  }, [checkAdmin]);

  // ==================== ПОКУПКА ПОДПИСКИ ====================

  async function handleSubscribe() {
    if (!signer || !wallet) {
      setError("Подключите MetaMask");
      return;
    }

    setIsSubscribing(true);
    setError("");

    try {
      const tier = SUBSCRIPTION_TIERS[selectedTier];
      const amount = ethers.parseUnits(tier.amount.toString(), TOKEN_DECIMALS);

      const token = new ethers.Contract(TOKEN_ADDRESS, ERC20_ABI, signer);
      const allowance = await token.allowance(wallet, CONTRACT_ADDRESS);

      if (allowance < amount) {
        const approveTx = await token.approve(CONTRACT_ADDRESS, amount);
        await approveTx.wait();
      }

      const contract = new ethers.Contract(CONTRACT_ADDRESS, POOL_ABI, signer);
      const tx = await contract.buySubscription(amount, ethers.ZeroAddress);
      await tx.wait();

      await loadUserData();
      setActiveTab("dashboard");
    } catch (err) {
      setError("Ошибка транзакции: " + (err.reason || err.message));
    } finally {
      setIsSubscribing(false);
    }
  }

  // ==================== АДМИНКА ====================

  async function loadAdminData() {
    if (!adminToken) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/dashboard`, {
        headers: { "x-admin-token": adminToken },
      });
      if (res.ok) {
        setAdminData(await res.json());
      } else {
        setError("Неверный админ-токен");
      }
    } catch (err) {
      setError("Ошибка загрузки админки: " + err.message);
    }
  }

  useEffect(() => {
    if (activeTab === "admin" && isAdmin && adminToken) {
      loadAdminData();
    }
  }, [activeTab, isAdmin, adminToken]);

  async function handleDeactivateExpired() {
    if (!adminToken) return;
    setIsDeactivating(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/admin/deactivate-expired`, {
        method: "POST",
        headers: { "x-admin-token": adminToken },
      });
      const data = await res.json();
      if (res.ok) {
        await loadAdminData();
      } else {
        setError(data.error || "Ошибка");
      }
    } catch (err) {
      setError("Ошибка: " + err.message);
    } finally {
      setIsDeactivating(false);
    }
  }

  // ==================== УПРАВЛЕНИЕ API-КЛЮЧАМИ ====================

  async function loadApiKeys() {
    if (!adminToken) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/keys`, {
        headers: { "x-admin-token": adminToken },
      });
      if (res.ok) {
        setApiKeys(await res.json());
      }
    } catch (err) {
      console.error("Load keys error:", err);
    }
  }

  async function handleAddKey() {
    if (!newKeyValue.trim() || !adminToken) return;
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/admin/keys`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": adminToken,
        },
        body: JSON.stringify({ provider: newKeyProvider, key: newKeyValue.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setNewKeyValue("");
        await loadApiKeys();
      } else {
        setError(data.error || "Ошибка добавления ключа");
      }
    } catch (err) {
      setError("Ошибка: " + err.message);
    }
  }

  async function handleDeleteKey(provider, index) {
    if (!adminToken) return;
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/admin/keys`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": adminToken,
        },
        body: JSON.stringify({ provider, index }),
      });
      const data = await res.json();
      if (res.ok) {
        await loadApiKeys();
      } else {
        setError(data.error || "Ошибка удаления");
      }
    } catch (err) {
      setError("Ошибка: " + err.message);
    }
  }

  useEffect(() => {
    if (activeTab === "admin" && isAdmin && adminToken && adminData) {
      loadApiKeys();
    }
  }, [activeTab, isAdmin, adminToken, adminData]);

  // ==================== ЧАТ С ИИ ====================

  async function handleSendMessage(e) {
    e.preventDefault();
    if (!chatInput.trim() || !wallet || isSending) return;

    const userMessage = chatInput.trim();
    setChatInput("");
    setMessages((prev) => [...prev, { role: "user", text: userMessage }]);
    setIsSending(true);

    try {
      const res = await fetch(`${API_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: wallet,
          message: userMessage,
          model: selectedAI,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          { role: "error", text: data.message || data.error },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "ai",
            text: data.response,
            model: data.model,
            fallback: data.fallback,
            usage: data.usage,
          },
        ]);
        if (userData) {
          setUserData((prev) => ({
            ...prev,
            dailyUsed: data.usage.used,
            dailyRemaining: data.usage.remaining,
          }));
        }
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "error", text: "Ошибка соединения с сервером" },
      ]);
    } finally {
      setIsSending(false);
    }
  }

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ======================== HELPERS ========================

  function formatUSDT(raw) {
    if (!raw) return "0.00";
    return parseFloat(ethers.formatUnits(raw, TOKEN_DECIMALS)).toFixed(2);
  }

  function formatDate(timestamp) {
    if (!timestamp) return "—";
    return new Date(timestamp * 1000).toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  function shortAddr(addr) {
    if (!addr) return "";
    return addr.slice(0, 6) + "..." + addr.slice(-4);
  }

  // ======================== РЕНДЕРИНГ ========================

  // Экран входа (не подключён кошелёк)
  if (!wallet) {
    return (
      <div className="app">
        <div className="login-screen">
          <div className="logo">
            <h1>CoreAI Pool</h1>
            <p className="subtitle">AI Chat Subscription</p>
          </div>

          <div className="login-card">
            <h2>Добро пожаловать</h2>
            <p>Подключите MetaMask для входа</p>

            <div className="connect-btn-wrapper">
              <button
                className="btn btn-primary btn-large"
                onClick={connectWallet}
                disabled={connecting}
                style={{ width: "100%", margin: 0 }}
              >
                {connecting ? "Подключение..." : "Подключить MetaMask"}
              </button>

              {!window.ethereum && (
                <p style={{ color: "var(--warning)", fontSize: 13, marginTop: 12 }}>
                  MetaMask не обнаружен.{" "}
                  <a
                    href="https://metamask.io"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "var(--accent)" }}
                  >
                    Установить
                  </a>
                </p>
              )}
            </div>

            <div className="login-features">
              <div className="feature">
                <span className="feature-icon">&#x1F916;</span>
                <span>Два ИИ: Gemini + Llama 3.1</span>
              </div>
              <div className="feature">
                <span className="feature-icon">&#x26A1;</span>
                <span>Авто-переключение при лимите провайдера</span>
              </div>
              <div className="feature">
                <span className="feature-icon">&#x1F4B3;</span>
                <span>Оплата в USDT, без подписки — нет доступа</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ===== Главный экран =====
  return (
    <div className="app">
      {/* HEADER */}
      <header className="header">
        <div className="header-left">
          <h1 className="header-logo">CoreAI Pool</h1>
        </div>
        <div className="header-right">
          <span className="balance-badge">
            {parseFloat(tokenBalance).toFixed(2)} {TOKEN_SYMBOL}
          </span>
          <button
            className="wallet-badge"
            onClick={disconnectWallet}
            title="Отключить кошелёк"
            style={{ cursor: "pointer", border: "1px solid var(--border)", background: "var(--bg-secondary)" }}
          >
            {shortAddr(wallet)}
          </button>
        </div>
      </header>

      {/* НАВИГАЦИЯ */}
      <nav className="tabs">
        <button
          className={`tab ${activeTab === "dashboard" ? "active" : ""}`}
          onClick={() => setActiveTab("dashboard")}
        >
          Кабинет
        </button>
        <button
          className={`tab ${activeTab === "chat" ? "active" : ""}`}
          onClick={() => setActiveTab("chat")}
        >
          ИИ Чат
          {userData?.dailyRemaining !== undefined && (
            <span className="tab-badge">{userData.dailyRemaining}</span>
          )}
        </button>
        <button
          className={`tab ${activeTab === "subscribe" ? "active" : ""}`}
          onClick={() => setActiveTab("subscribe")}
        >
          Подписка
        </button>
        {isAdmin && (
          <button
            className={`tab tab-admin ${activeTab === "admin" ? "active" : ""}`}
            onClick={() => setActiveTab("admin")}
          >
            Админка
          </button>
        )}
      </nav>

      {error && <div className="error-msg">{error}</div>}

      {/* ПАНЕЛЬ УПРАВЛЕНИЯ */}
      {activeTab === "dashboard" && (
        <div className="dashboard">
          <div className="card">
            <h3>Ваша подписка</h3>
            {userData?.isActive ? (
              <div className="status-active">
                <span className="status-dot green"></span>
                Активна до {formatDate(userData.subscriptionExpiry)}
              </div>
            ) : (
              <div className="status-inactive">
                <span className="status-dot red"></span>
                Неактивна
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => setActiveTab("subscribe")}
                >
                  Оформить
                </button>
              </div>
            )}
          </div>

          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">Тариф</div>
              <div className="stat-value">
                {formatUSDT(userData?.depositAmount)} {TOKEN_SYMBOL}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Лимит в день</div>
              <div className="stat-value">{userData?.dailyLimit || 0}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Использовано сегодня</div>
              <div className="stat-value">{userData?.dailyUsed || 0}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Баланс кошелька</div>
              <div className="stat-value">
                {parseFloat(tokenBalance).toFixed(2)} {TOKEN_SYMBOL}
              </div>
            </div>
          </div>

          {userData?.isActive && (
            <div className="card">
              <h3>Запросы к ИИ сегодня</h3>
              <div className="progress-bar-container">
                <div
                  className="progress-bar"
                  style={{
                    width: `${
                      userData.dailyLimit > 0
                        ? (userData.dailyUsed / userData.dailyLimit) * 100
                        : 0
                    }%`,
                  }}
                ></div>
              </div>
              <div className="progress-label">
                {userData.dailyUsed} / {userData.dailyLimit} использовано
              </div>
            </div>
          )}

          {poolStats && (
            <div className="card">
              <h3>Статистика платформы</h3>
              <div className="platform-stats">
                <div>
                  Пользователей: <strong>{poolStats.totalUsers}</strong>
                </div>
                <div>
                  Подписок оформлено:{" "}
                  <strong>{poolStats.totalSubscriptions}</strong>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ЧАТ С ИИ */}
      {activeTab === "chat" && (
        <div className="chat-container">
          <div className="ai-switcher">
            <button
              className={`ai-btn ${selectedAI === "gemini" ? "active" : ""}`}
              onClick={() => setSelectedAI("gemini")}
            >
              Gemini
            </button>
            <button
              className={`ai-btn ${selectedAI === "groq" ? "active" : ""}`}
              onClick={() => setSelectedAI("groq")}
            >
              Llama 3.1
            </button>
          </div>

          <div className="chat-messages">
            {messages.length === 0 && (
              <div className="chat-empty">
                <p>Задайте вопрос ИИ-ассистенту CoreAI</p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`chat-msg ${msg.role}`}>
                <div className="msg-bubble">
                  {msg.text}
                  {msg.model && (
                    <div className="msg-model">
                      {msg.model}
                      {msg.fallback && " (авто-переключение)"}
                    </div>
                  )}
                  {msg.usage && (
                    <div className="msg-usage">
                      Запросов: {msg.usage.used}/{msg.usage.limit}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          <form className="chat-input-form" onSubmit={handleSendMessage}>
            <input
              type="text"
              className="chat-input"
              placeholder="Напишите сообщение..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              disabled={isSending || !userData?.isActive}
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSending || !chatInput.trim() || !userData?.isActive}
            >
              {isSending ? "..." : "→"}
            </button>
          </form>

          {!userData?.isActive && (
            <div className="chat-blocked">
              Оформите подписку для доступа к ИИ
            </div>
          )}

          {userData?.isActive && (
            <div className="chat-info">
              Модель:{" "}
              {selectedAI === "gemini"
                ? "Gemini 1.5 Flash"
                : "Llama 3.1 70B"}{" "}
              | Осталось: {userData?.dailyRemaining ?? "—"} запросов
            </div>
          )}
        </div>
      )}

      {/* ПОДПИСКА */}
      {activeTab === "subscribe" && (
        <div className="subscribe-container">
          <div className="card">
            <h2>Выберите тариф</h2>
            <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 16 }}>
              Передвиньте ползунок для выбора количества запросов к ИИ
            </p>

            <div className="slider-container">
              <input
                type="range"
                min="0"
                max={SUBSCRIPTION_TIERS.length - 1}
                value={selectedTier}
                onChange={(e) => setSelectedTier(parseInt(e.target.value))}
                className="tier-slider"
              />

              <div className="tier-info">
                <div className="tier-name">
                  {SUBSCRIPTION_TIERS[selectedTier].label}
                </div>
                <div className="tier-price">
                  {SUBSCRIPTION_TIERS[selectedTier].amount} {TOKEN_SYMBOL}
                  <span className="tier-period">/30 дней</span>
                </div>
                <div className="tier-requests">
                  {SUBSCRIPTION_TIERS[selectedTier].requests}
                </div>
              </div>

            </div>

            <button
              className="btn btn-primary btn-large"
              onClick={handleSubscribe}
              disabled={isSubscribing}
              style={{ width: "100%", margin: "16px 0 0" }}
            >
              {isSubscribing
                ? "Обработка транзакции..."
                : `Оформить подписку за ${SUBSCRIPTION_TIERS[selectedTier].amount} ${TOKEN_SYMBOL}`}
            </button>

            {parseFloat(tokenBalance) <
              SUBSCRIPTION_TIERS[selectedTier].amount && (
              <div className="warning-msg">
                Недостаточно {TOKEN_SYMBOL} на балансе. Пополните кошелёк.
              </div>
            )}
          </div>
        </div>
      )}

      {/* АДМИНКА */}
      {activeTab === "admin" && isAdmin && (
        <div className="admin-container">
          {!adminData && (
            <div className="card">
              <h2>Авторизация админки</h2>
              <div className="admin-auth">
                <input
                  type="password"
                  placeholder="Введите ADMIN_TOKEN из .env"
                  value={adminToken}
                  onChange={(e) => setAdminToken(e.target.value)}
                  className="admin-input"
                />
                <button className="btn btn-primary" onClick={loadAdminData}>
                  Войти
                </button>
              </div>
            </div>
          )}

          {adminData && (
            <>
              <div className="card">
                <h2>Панель оператора</h2>
                <div className="stats-grid" style={{ padding: 0, marginTop: 12 }}>
                  <div className="stat-card">
                    <div className="stat-label">Общий доход</div>
                    <div className="stat-value" style={{ fontSize: 16 }}>
                      {formatUSDT(adminData.totalRevenue)} {TOKEN_SYMBOL}
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Подписок оформлено</div>
                    <div className="stat-value" style={{ fontSize: 16 }}>
                      {adminData.totalSubscriptions}
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Пользователей</div>
                    <div className="stat-value" style={{ fontSize: 16 }}>
                      {adminData.totalUsers}
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Ключей ИИ</div>
                    <div className="stat-value" style={{ fontSize: 16 }}>
                      G: {adminData.keys?.gemini || 0} / Q:{" "}
                      {adminData.keys?.groq || 0}
                    </div>
                  </div>
                </div>
              </div>

              <div className="card">
                <h3>Управление подписками</h3>
                <button
                  className="btn btn-warning"
                  onClick={handleDeactivateExpired}
                  disabled={isDeactivating}
                >
                  {isDeactivating
                    ? "Обработка..."
                    : "Деактивировать истёкшие"}
                </button>
              </div>

              <div className="card">
                <h3>API-ключи ИИ</h3>
                <p className="admin-hint">
                  Добавляйте и удаляйте ключи на лету. Ключи используются по кругу (round-robin).
                  При перезагрузке сервера ключи загружаются из .env.
                </p>

                {apiKeys && (
                  <div className="api-keys-section">
                    <div className="keys-group">
                      <h4>Gemini ({apiKeys.gemini.length})</h4>
                      {apiKeys.gemini.map((k) => (
                        <div key={k.index} className="key-row">
                          <span className="key-masked">{k.masked}</span>
                          <button
                            className="btn-key-delete"
                            onClick={() => handleDeleteKey("gemini", k.index)}
                            title="Удалить"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      {apiKeys.gemini.length === 0 && (
                        <div className="key-empty">Нет ключей</div>
                      )}
                    </div>

                    <div className="keys-group">
                      <h4>Groq ({apiKeys.groq.length})</h4>
                      {apiKeys.groq.map((k) => (
                        <div key={k.index} className="key-row">
                          <span className="key-masked">{k.masked}</span>
                          <button
                            className="btn-key-delete"
                            onClick={() => handleDeleteKey("groq", k.index)}
                            title="Удалить"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      {apiKeys.groq.length === 0 && (
                        <div className="key-empty">Нет ключей</div>
                      )}
                    </div>
                  </div>
                )}

                <div className="add-key-form">
                  <select
                    value={newKeyProvider}
                    onChange={(e) => setNewKeyProvider(e.target.value)}
                    className="admin-input"
                    style={{ flex: "0 0 auto", width: "auto" }}
                  >
                    <option value="gemini">Gemini</option>
                    <option value="groq">Groq</option>
                  </select>
                  <input
                    type="text"
                    placeholder="Вставьте API ключ"
                    value={newKeyValue}
                    onChange={(e) => setNewKeyValue(e.target.value)}
                    className="admin-input"
                  />
                  <button
                    className="btn btn-primary"
                    onClick={handleAddKey}
                    disabled={!newKeyValue.trim()}
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="card">
                <h3>Пользователи ({adminData.users?.length || 0})</h3>
                <div className="admin-users-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Адрес</th>
                        <th>Тариф</th>
                        <th>Статус</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(adminData.users || []).map((u, i) => (
                        <tr
                          key={i}
                          className={u.isActive ? "" : "inactive-row"}
                        >
                          <td className="addr-cell">
                            {u.address.slice(0, 8)}...{u.address.slice(-4)}
                          </td>
                          <td>
                            {formatUSDT(u.depositAmount)} {TOKEN_SYMBOL}
                          </td>
                          <td>
                            <span
                              className={`status-badge ${
                                u.isActive ? "active" : "expired"
                              }`}
                            >
                              {u.isActive ? "Актив" : "Истёк"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
