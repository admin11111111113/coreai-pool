// ============================================================
//  CoreAI Pool — Главный компонент
//
//  Без MetaMask/смарт-контракта: у браузера есть свой sessionId
//  (localStorage). Оплата — перевод USDT на адрес от бэкенда,
//  бэкенд сам сверяет платёж по блокчейну и активирует подписку.
// ============================================================

import { useState, useEffect, useRef, useCallback } from "react";

import { API_URL, TOKEN_SYMBOL, NETWORK_LABEL, SUBSCRIPTION_TIERS } from "./config.js";
import "./App.css";

function getOrCreateSessionId() {
  let id = localStorage.getItem("coreai_session_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("coreai_session_id", id);
  }
  return id;
}

function App() {
  // ==================== СОСТОЯНИЕ ====================
  const [sessionId] = useState(getOrCreateSessionId);

  const [userData, setUserData] = useState(null);
  const [poolStats, setPoolStats] = useState(null);

  const [selectedTier, setSelectedTier] = useState(1);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [pendingPayment, setPendingPayment] = useState(null);

  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [selectedAI, setSelectedAI] = useState("gemini");
  const chatEndRef = useRef(null);

  const [activeTab, setActiveTab] = useState("dashboard");
  const [error, setError] = useState("");

  // Админка
  const [adminData, setAdminData] = useState(null);
  const [adminToken, setAdminToken] = useState("");
  const [giveawayAmount, setGiveawayAmount] = useState("");
  const [isGivingAway, setIsGivingAway] = useState(false);
  const [giveawayResult, setGiveawayResult] = useState(null);

  // API-ключи
  const [apiKeys, setApiKeys] = useState(null);
  const [newKeyProvider, setNewKeyProvider] = useState("gemini");
  const [newKeyValue, setNewKeyValue] = useState("");

  // ==================== ЗАГРУЗКА ДАННЫХ СЕССИИ ====================

  const loadUserData = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/session/${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        setUserData(data);
        setPendingPayment(data.pendingReservation || null);
      }

      const statsRes = await fetch(`${API_URL}/api/stats`);
      if (statsRes.ok) setPoolStats(await statsRes.json());
    } catch (err) {
      console.error("Load error:", err);
    }
  }, [sessionId]);

  useEffect(() => {
    loadUserData();
    const interval = setInterval(loadUserData, 8000);
    return () => clearInterval(interval);
  }, [loadUserData]);

  // ==================== ПОКУПКА ПОДПИСКИ ====================

  async function handleSubscribe() {
    setIsSubscribing(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/reserve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, tierIndex: selectedTier }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || "Ошибка резервирования");
      } else {
        setPendingPayment({ receiverAddress: data.receiverAddress, amount: data.amount });
      }
    } catch (err) {
      setError("Ошибка: " + err.message);
    } finally {
      setIsSubscribing(false);
    }
  }

  function copyReceiverAddress() {
    if (pendingPayment) navigator.clipboard.writeText(pendingPayment.receiverAddress);
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
    if (activeTab === "admin" && adminToken && adminData) {
      loadApiKeys();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, adminToken, adminData]);

  async function handleGiveaway() {
    if (!giveawayAmount || !adminToken) return;
    setIsGivingAway(true);
    setError("");
    setGiveawayResult(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/giveaway`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": adminToken },
        body: JSON.stringify({ amountPerUser: giveawayAmount }),
      });
      const data = await res.json();
      if (res.ok) {
        setGiveawayResult(data);
        setGiveawayAmount("");
        await loadAdminData();
      } else {
        setError(data.message || data.error || "Ошибка раздачи");
      }
    } catch (err) {
      setError("Ошибка: " + err.message);
    } finally {
      setIsGivingAway(false);
    }
  }

  // ==================== УПРАВЛЕНИЕ API-КЛЮЧАМИ ====================

  async function loadApiKeys() {
    if (!adminToken) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/keys`, {
        headers: { "x-admin-token": adminToken },
      });
      if (res.ok) setApiKeys(await res.json());
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
        headers: { "Content-Type": "application/json", "x-admin-token": adminToken },
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
        headers: { "Content-Type": "application/json", "x-admin-token": adminToken },
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

  // ==================== ЧАТ С ИИ ====================

  async function handleSendMessage(e) {
    e.preventDefault();
    if (!chatInput.trim() || isSending) return;

    const userMessage = chatInput.trim();
    setChatInput("");
    setMessages((prev) => [...prev, { role: "user", text: userMessage }]);
    setIsSending(true);

    try {
      const res = await fetch(`${API_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: userMessage, model: selectedAI }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessages((prev) => [...prev, { role: "error", text: data.message || data.error }]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "ai", text: data.response, model: data.model, fallback: data.fallback, usage: data.usage },
        ]);
        if (userData) {
          setUserData((prev) => ({ ...prev, dailyUsed: data.usage.used, dailyRemaining: data.usage.remaining }));
        }
      }
    } catch (err) {
      setMessages((prev) => [...prev, { role: "error", text: "Ошибка соединения с сервером" }]);
    } finally {
      setIsSending(false);
    }
  }

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ======================== HELPERS ========================

  function formatDate(ts) {
    if (!ts) return "—";
    return new Date(ts).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  }

  function shortAddr(addr) {
    if (!addr) return "";
    return addr.slice(0, 6) + "..." + addr.slice(-4);
  }

  // ======================== РЕНДЕРИНГ ========================

  return (
    <div className="app">
      {/* HEADER */}
      <header className="header">
        <div className="header-left">
          <h1 className="header-logo">CoreAI Pool</h1>
        </div>
        <div className="header-right">
          {userData?.walletAddress && (
            <span className="wallet-badge" title="Кошелёк, с которого оплачена подписка">
              {shortAddr(userData.walletAddress)}
            </span>
          )}
        </div>
      </header>

      {/* НАВИГАЦИЯ */}
      <nav className="tabs">
        <button className={`tab ${activeTab === "dashboard" ? "active" : ""}`} onClick={() => setActiveTab("dashboard")}>
          Кабинет
        </button>
        <button className={`tab ${activeTab === "chat" ? "active" : ""}`} onClick={() => setActiveTab("chat")}>
          ИИ Чат
          {userData?.dailyRemaining !== undefined && <span className="tab-badge">{userData.dailyRemaining}</span>}
        </button>
        <button className={`tab ${activeTab === "subscribe" ? "active" : ""}`} onClick={() => setActiveTab("subscribe")}>
          Подписка
        </button>
        <button className={`tab tab-admin ${activeTab === "admin" ? "active" : ""}`} onClick={() => setActiveTab("admin")}>
          Админка
        </button>
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
                Активна до {formatDate(userData.expiresAt)}
              </div>
            ) : (
              <div className="status-inactive">
                <span className="status-dot red"></span>
                Неактивна
                <button className="btn btn-primary btn-sm" onClick={() => setActiveTab("subscribe")}>
                  Оформить
                </button>
              </div>
            )}
          </div>

          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">Тариф</div>
              <div className="stat-value">
                {userData?.amount || 0} {TOKEN_SYMBOL}
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
              <div className="stat-label">Осталось сегодня</div>
              <div className="stat-value">{userData?.dailyRemaining ?? 0}</div>
            </div>
          </div>

          {userData?.isActive && (
            <div className="card">
              <h3>Запросы к ИИ сегодня</h3>
              <div className="progress-bar-container">
                <div
                  className="progress-bar"
                  style={{
                    width: `${userData.dailyLimit > 0 ? (userData.dailyUsed / userData.dailyLimit) * 100 : 0}%`,
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
                  Активных подписок: <strong>{poolStats.totalActive}</strong>
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
            <button className={`ai-btn ${selectedAI === "gemini" ? "active" : ""}`} onClick={() => setSelectedAI("gemini")}>
              Gemini
            </button>
            <button className={`ai-btn ${selectedAI === "groq" ? "active" : ""}`} onClick={() => setSelectedAI("groq")}>
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
                  {msg.usage && <div className="msg-usage">Запросов: {msg.usage.used}/{msg.usage.limit}</div>}
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
            <button type="submit" className="btn btn-primary" disabled={isSending || !chatInput.trim() || !userData?.isActive}>
              {isSending ? "..." : "→"}
            </button>
          </form>

          {!userData?.isActive && <div className="chat-blocked">Оформите подписку для доступа к ИИ</div>}

          {userData?.isActive && (
            <div className="chat-info">
              Модель: {selectedAI === "gemini" ? "Gemini 1.5 Flash" : "Llama 3.1 70B"} | Осталось:{" "}
              {userData?.dailyRemaining ?? "—"} запросов
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
                <div className="tier-name">{SUBSCRIPTION_TIERS[selectedTier].label}</div>
                <div className="tier-price">
                  {SUBSCRIPTION_TIERS[selectedTier].amount} {TOKEN_SYMBOL}
                  <span className="tier-period">/30 дней</span>
                </div>
                <div className="tier-requests">{SUBSCRIPTION_TIERS[selectedTier].requests}</div>
              </div>
            </div>

            {!pendingPayment ? (
              <button
                className="btn btn-primary btn-large"
                onClick={handleSubscribe}
                disabled={isSubscribing}
                style={{ width: "100%", margin: "16px 0 0" }}
              >
                {isSubscribing ? "Создаём счёт..." : `Оформить подписку за ${SUBSCRIPTION_TIERS[selectedTier].amount} ${TOKEN_SYMBOL}`}
              </button>
            ) : (
              <div className="card" style={{ marginTop: 16 }}>
                <h3>Оплата ожидается</h3>
                <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
                  Переведите ровно <strong>{pendingPayment.amount} {TOKEN_SYMBOL}</strong> ({NETWORK_LABEL}) на адрес:
                </p>
                <div className="ref-link-box">
                  <input type="text" readOnly value={pendingPayment.receiverAddress} className="ref-link-input" />
                  <button className="btn btn-primary" onClick={copyReceiverAddress}>
                    Скопировать
                  </button>
                </div>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 12 }}>
                  Как только платёж найдётся в блокчейне — подписка включится автоматически (проверяем каждые ~30 сек).
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* АДМИНКА */}
      {activeTab === "admin" && (
        <div className="admin-container">
          {!adminData && (
            <div className="card">
              <h2>Авторизация админки</h2>
              <div className="admin-auth">
                <input
                  type="password"
                  placeholder="Введите ADMIN_TOKEN"
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
                    <div className="stat-label">Пользователей</div>
                    <div className="stat-value" style={{ fontSize: 16 }}>
                      {adminData.totalUsers}
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Активных подписок</div>
                    <div className="stat-value" style={{ fontSize: 16 }}>
                      {adminData.totalActive}
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Ключей ИИ</div>
                    <div className="stat-value" style={{ fontSize: 16 }}>
                      G: {adminData.keys?.gemini || 0} / Q: {adminData.keys?.groq || 0}
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Адрес приёма USDT</div>
                    <div className="stat-value" style={{ fontSize: 12, wordBreak: "break-all" }}>
                      {adminData.receiverAddress ? shortAddr(adminData.receiverAddress) : "не настроен"}
                    </div>
                  </div>
                </div>
              </div>

              <div className="card">
                <h3>Раздать всем активным подписчикам</h3>
                <p className="admin-hint">
                  Каждый активный подписчик получит ОДИНАКОВУЮ сумму (не по размеру тарифа) — как разовый купон/промо.
                </p>
                <div className="admin-bonus-form">
                  <input
                    type="number"
                    placeholder={`Сумма на человека в ${TOKEN_SYMBOL}`}
                    value={giveawayAmount}
                    onChange={(e) => setGiveawayAmount(e.target.value)}
                    className="admin-input"
                    min="0.01"
                    step="0.01"
                  />
                  <button className="btn btn-success" onClick={handleGiveaway} disabled={isGivingAway || !giveawayAmount}>
                    {isGivingAway ? "Отправка..." : "Раздать всем"}
                  </button>
                </div>
                {giveawayResult && (
                  <p style={{ fontSize: 13, marginTop: 8 }}>
                    Отправлено: {giveawayResult.sent?.length || 0}, ошибок: {giveawayResult.failed?.length || 0}
                  </p>
                )}
              </div>

              <div className="card">
                <h3>API-ключи ИИ</h3>
                <p className="admin-hint">
                  Добавляйте и удаляйте ключи на лету. Ключи используются по кругу (round-robin). При перезагрузке сервера
                  ключи загружаются из .env.
                </p>

                {apiKeys && (
                  <div className="api-keys-section">
                    <div className="keys-group">
                      <h4>Gemini ({apiKeys.gemini.length})</h4>
                      {apiKeys.gemini.map((k) => (
                        <div key={k.index} className="key-row">
                          <span className="key-masked">{k.masked}</span>
                          <button className="btn-key-delete" onClick={() => handleDeleteKey("gemini", k.index)} title="Удалить">
                            ✕
                          </button>
                        </div>
                      ))}
                      {apiKeys.gemini.length === 0 && <div className="key-empty">Нет ключей</div>}
                    </div>

                    <div className="keys-group">
                      <h4>Groq ({apiKeys.groq.length})</h4>
                      {apiKeys.groq.map((k) => (
                        <div key={k.index} className="key-row">
                          <span className="key-masked">{k.masked}</span>
                          <button className="btn-key-delete" onClick={() => handleDeleteKey("groq", k.index)} title="Удалить">
                            ✕
                          </button>
                        </div>
                      ))}
                      {apiKeys.groq.length === 0 && <div className="key-empty">Нет ключей</div>}
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
                  <button className="btn btn-primary" onClick={handleAddKey} disabled={!newKeyValue.trim()}>
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
                        <th>Кошелёк</th>
                        <th>Тариф</th>
                        <th>До</th>
                        <th>Статус</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(adminData.users || []).map((u, i) => (
                        <tr key={i} className={u.isActive ? "" : "inactive-row"}>
                          <td className="addr-cell">{shortAddr(u.walletAddress)}</td>
                          <td>
                            {u.amount} {TOKEN_SYMBOL}
                          </td>
                          <td>{formatDate(u.expiresAt)}</td>
                          <td>
                            <span className={`status-badge ${u.isActive ? "active" : "expired"}`}>
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
