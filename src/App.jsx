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

const FAQ_ITEMS = [
  { q: "Какие ИИ доступны?", a: "Google Gemini 1.5 Flash и Llama 3.1 70B (через Groq) — переключаетесь между ними в чате одной кнопкой." },
  { q: "Что если у выбранного ИИ кончится лимит?", a: "Сервер сам пробует запасного провайдера — вы просто получаете ответ, без ошибок." },
  { q: "Нужен ли MetaMask?", a: "Нет. Просто переведите USDT с любого кошелька (Trust Wallet, биржа и т.п.) на показанный адрес." },
  { q: "Как быстро активируется подписка?", a: "Обычно в течение 30–60 секунд после перевода — сервер проверяет блокчейн каждые полминуты." },
  { q: "Что будет, если отправить не ту сумму?", a: "Сумма сверяется с допуском ±1 USDT. Если сильно отличается — платёж не будет засчитан, напишите в поддержку." },
];

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

  const [isSubscribing, setIsSubscribing] = useState(false);
  const [pendingPayment, setPendingPayment] = useState(null);
  const [openFaq, setOpenFaq] = useState(null);

  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [selectedAI, setSelectedAI] = useState("gemini");
  const chatEndRef = useRef(null);

  const [activeTab, setActiveTab] = useState("dashboard");
  const [error, setError] = useState("");

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

  async function handleSubscribe(tierIndex) {
    setIsSubscribing(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/reserve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, tierIndex }),
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
        <div className="bar-inner">
          <h1 className="header-logo">CoreAI Pool</h1>
          <div className="header-right">
            {userData?.walletAddress && (
              <span className="wallet-badge" title="Кошелёк, с которого оплачена подписка">
                {shortAddr(userData.walletAddress)}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* НАВИГАЦИЯ */}
      <nav className="tabs">
        <div className="bar-inner tabs-inner">
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
        </div>
      </nav>

      {error && <div className="error-msg">{error}</div>}

      {/* ПАНЕЛЬ УПРАВЛЕНИЯ */}
      {activeTab === "dashboard" && (
        <div className="page dashboard">
          <div className="hero">
            <div className="hero-orb" aria-hidden="true">
              <span className="hero-orb-core"></span>
            </div>
            <p className="hero-tagline">Два ИИ в одном чате — Gemini и Llama 3.1, с автопереключением при лимите</p>
          </div>

          <div className="feature-grid">
            <div className="feature-tile">
              <span className="feature-num">01</span>
              <h4>Два провайдера</h4>
              <p>Gemini 1.5 Flash и Llama 3.1 70B в одном окне — переключайтесь одной кнопкой.</p>
            </div>
            <div className="feature-tile">
              <span className="feature-num">02</span>
              <h4>Авто-фолбэк</h4>
              <p>Упёрлись в лимит одного провайдера — сервер сам подставит запасной.</p>
            </div>
            <div className="feature-tile">
              <span className="feature-num">03</span>
              <h4>Без кошелька на сайте</h4>
              <p>Перевод USDT на адрес — без MetaMask, без комиссий за подключение.</p>
            </div>
            <div className="feature-tile">
              <span className="feature-num">04</span>
              <h4>Цена по факту</h4>
              <p>Тарифы посчитаны от реальной стоимости запросов к ИИ, без переплат.</p>
            </div>
          </div>

          <div className="steps">
            <h3 className="steps-title">Как это работает</h3>
            <div className="steps-grid">
              <div className="step">
                <span className="step-dot">1</span>
                <div>
                  <strong>Выберите тариф</strong>
                  <p>На вкладке «Подписка» — от 5 до 49 USDT в зависимости от лимита запросов.</p>
                </div>
              </div>
              <div className="step">
                <span className="step-dot">2</span>
                <div>
                  <strong>Переведите USDT</strong>
                  <p>С любого кошелька на показанный адрес — точную сумму, сеть BSC (BEP-20).</p>
                </div>
              </div>
              <div className="step">
                <span className="step-dot">3</span>
                <div>
                  <strong>Подписка включится сама</strong>
                  <p>Сервер находит платёж в блокчейне за ~30 секунд и открывает доступ на 30 дней.</p>
                </div>
              </div>
            </div>
          </div>

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
        <div className="page chat-container">
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
        <div className="page subscribe-container">
          <div className="section-heading">
            <h2>Тарифы</h2>
            <p>Все тарифы — на 30 дней, разница только в дневном лимите запросов к ИИ.</p>
          </div>

          {!pendingPayment ? (
            <div className="pricing-grid">
              {SUBSCRIPTION_TIERS.map((tier, i) => (
                <div className={`pricing-card ${i === 1 ? "popular" : ""}`} key={tier.label}>
                  {i === 1 && <div className="pricing-badge">Популярный</div>}
                  <div className="tier-name">{tier.label}</div>
                  <div className="tier-price">
                    {tier.amount} {TOKEN_SYMBOL}
                    <span className="tier-period">/30 дней</span>
                  </div>
                  <div className="tier-requests">{tier.requests}</div>
                  <button
                    className="btn btn-primary btn-large"
                    onClick={() => handleSubscribe(i)}
                    disabled={isSubscribing}
                  >
                    {isSubscribing ? "..." : "Выбрать"}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="card">
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

          <div className="faq">
            <h3 className="steps-title">Вопросы</h3>
            {FAQ_ITEMS.map((item, i) => (
              <div className={`faq-item ${openFaq === i ? "open" : ""}`} key={item.q}>
                <button className="faq-q" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                  {item.q}
                  <span className="faq-caret">⌄</span>
                </button>
                {openFaq === i && <div className="faq-a">{item.a}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      <footer className="footer">
        <div className="page footer-inner">© CoreAI Pool · Оплата USDT (BEP-20, BSC) · Тарифы рассчитаны от стоимости API</div>
      </footer>
    </div>
  );
}

export default App;
