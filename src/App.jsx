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
  { q: "Какие ИИ доступны?", a: "Два ядра — CoreAI Fast и CoreAI Pro. Переключаетесь между ними в чате одной кнопкой." },
  { q: "Что если у выбранного ядра кончится лимит?", a: "Сервер сам пробует запасное ядро — вы просто получаете ответ, без ошибок." },
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

/* ——— Визуал: два ИИ-ядра, связанные потоком ——— */
function CoreVisual() {
  return (
    <svg className="core-svg" viewBox="0 0 520 230" fill="none" aria-hidden="true">
      <defs>
        <radialGradient id="cvA" cx="38%" cy="34%">
          <stop offset="0%" stopColor="#a5f3fc" />
          <stop offset="45%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#0e7490" />
        </radialGradient>
        <radialGradient id="cvB" cx="38%" cy="34%">
          <stop offset="0%" stopColor="#e9d5ff" />
          <stop offset="45%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#5b21b6" />
        </radialGradient>
        <linearGradient id="cvLink" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="50%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
        <filter id="cvGlow" x="-70%" y="-70%" width="240%" height="240%">
          <feGaussianBlur stdDeviation="13" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="cvSoft" x="-70%" y="-70%" width="240%" height="240%">
          <feGaussianBlur stdDeviation="22" />
        </filter>
      </defs>

      {/* мягкое свечение под ядрами */}
      <ellipse cx="150" cy="115" rx="62" ry="62" fill="#22d3ee" opacity="0.24" filter="url(#cvSoft)" />
      <ellipse cx="370" cy="115" rx="62" ry="62" fill="#8b5cf6" opacity="0.24" filter="url(#cvSoft)" />

      {/* орбиты */}
      <ellipse cx="260" cy="115" rx="168" ry="62" stroke="url(#cvLink)" strokeWidth="1" opacity="0.28" />
      <ellipse cx="260" cy="115" rx="132" ry="94" stroke="url(#cvLink)" strokeWidth="1" opacity="0.16" />

      {/* поток между ядрами */}
      <path
        d="M150 115 C 200 62, 320 62, 370 115"
        stroke="url(#cvLink)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="7 11"
        opacity="0.85"
      >
        <animate attributeName="stroke-dashoffset" from="72" to="0" dur="2.6s" repeatCount="indefinite" />
      </path>
      <path
        d="M150 115 C 200 168, 320 168, 370 115"
        stroke="url(#cvLink)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="7 11"
        opacity="0.55"
      >
        <animate attributeName="stroke-dashoffset" from="0" to="72" dur="3.4s" repeatCount="indefinite" />
      </path>

      {/* ядра */}
      <circle cx="150" cy="115" r="34" fill="url(#cvA)" filter="url(#cvGlow)">
        <animate attributeName="r" values="34;37;34" dur="4.6s" repeatCount="indefinite" />
      </circle>
      <circle cx="370" cy="115" r="34" fill="url(#cvB)" filter="url(#cvGlow)">
        <animate attributeName="r" values="34;37;34" dur="4.6s" begin="-2.3s" repeatCount="indefinite" />
      </circle>

      {/* блики */}
      <circle cx="140" cy="104" r="9" fill="#fff" opacity="0.5" />
      <circle cx="360" cy="104" r="9" fill="#fff" opacity="0.5" />

      {/* частицы */}
      <circle r="3.5" fill="#67e8f9">
        <animateMotion dur="4.2s" repeatCount="indefinite" path="M150 115 C 200 62, 320 62, 370 115" />
        <animate attributeName="opacity" values="0;1;1;0" dur="4.2s" repeatCount="indefinite" />
      </circle>
      <circle r="3.5" fill="#c4b5fd">
        <animateMotion dur="5s" begin="-2s" repeatCount="indefinite" path="M370 115 C 320 168, 200 168, 150 115" />
        <animate attributeName="opacity" values="0;1;1;0" dur="5s" begin="-2s" repeatCount="indefinite" />
      </circle>
      <circle r="2.5" fill="#93c5fd">
        <animateMotion dur="6.4s" begin="-1s" repeatCount="indefinite" path="M92 115 A 168 62 0 1 0 428 115 A 168 62 0 1 0 92 115" />
      </circle>
    </svg>
  );
}

function App() {
  // ==================== СОСТОЯНИЕ ====================
  const [sessionId] = useState(getOrCreateSessionId);

  const [userData, setUserData] = useState(null);
  const [poolStats, setPoolStats] = useState(null);

  const [isSubscribing, setIsSubscribing] = useState(false);
  const [pendingPayment, setPendingPayment] = useState(null);
  const [openFaq, setOpenFaq] = useState(null);
  const [copied, setCopied] = useState(false);

  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [selectedAI, setSelectedAI] = useState("gemini");
  const chatEndRef = useRef(null);

  const [activeTab, setActiveTab] = useState("chat");
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
    if (!pendingPayment) return;
    navigator.clipboard.writeText(pendingPayment.receiverAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
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
    // Прокручиваем только ленту чата и только когда есть сообщения,
    // иначе страница «прыгает» вниз при первой загрузке.
    if (messages.length === 0) return;
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
          <h1 className="header-logo">
            <span>CoreAI Pool</span>
          </h1>
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
          <button className={`tab ${activeTab === "chat" ? "active" : ""}`} onClick={() => setActiveTab("chat")}>
            Чат
            {userData?.dailyRemaining !== undefined && <span className="tab-badge">{userData.dailyRemaining}</span>}
          </button>
          <button className={`tab ${activeTab === "profile" ? "active" : ""}`} onClick={() => setActiveTab("profile")}>
            Кабинет
          </button>
        </div>
      </nav>

      {error && <div className="error-msg">{error}</div>}

      {/* ЧАТ С ИИ — первый экран: сразу рабочая панель + материалы о продукте */}
      {activeTab === "chat" && (
        <div className="page">
          <div className="hero hero-compact">
            <div className="hero-eyebrow">
              <span className="pill">2 ядра</span>
              Gemini Flash + Llama 3.1 в одном окне
            </div>
            <p className="hero-tagline">
              Два ИИ-ядра в одном чате — с <em>автопереключением</em> при лимите
            </p>
            <p className="hero-sub">
              Упёрлись в лимит одного ядра — сервер молча подставит второе. Вы просто продолжаете
              разговор и получаете ответ.
            </p>

            <div className="hero-visual">
              <CoreVisual />
            </div>
          </div>

          <div className="chat-panel">
            <div className="ai-switcher">
              <button className={`ai-btn ${selectedAI === "gemini" ? "active" : ""}`} onClick={() => setSelectedAI("gemini")}>
                CoreAI Fast
              </button>
              <button className={`ai-btn ${selectedAI === "groq" ? "active" : ""}`} onClick={() => setSelectedAI("groq")}>
                CoreAI Pro
              </button>
            </div>

            <div className="chat-messages">
              {messages.length === 0 && (
                <div className="chat-empty">
                  <div className="chat-empty-icon">✦</div>
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

            {!userData?.isActive && <div className="chat-blocked">Оформите подписку для доступа к ИИ — вкладка «Кабинет»</div>}

            {userData?.isActive && (
              <div className="chat-info">
                Ядро: {selectedAI === "gemini" ? "CoreAI Fast" : "CoreAI Pro"} | Осталось:{" "}
                {userData?.dailyRemaining ?? "—"} запросов
              </div>
            )}
          </div>

          <div className="showcase">
            <h3 className="steps-title">Пример диалога</h3>
            <div className="showcase-frame">
              <div className="showcase-msg user">Сократи это письмо до трёх предложений</div>
              <div className="showcase-msg ai">Готово. Смысл сохранён, тон — деловой. Прислать варианты покороче?</div>
              <div className="showcase-msg user">Да, и переведи на английский</div>
              <div className="showcase-msg ai">Вот английская версия + два варианта длины на выбор.</div>
            </div>
          </div>

          <div className="feature-grid">
            <div className="feature-tile">
              <span className="feature-num">01</span>
              <h4>Два ядра ИИ</h4>
              <p>CoreAI Fast и CoreAI Pro в одном окне — переключайтесь одной кнопкой.</p>
            </div>
            <div className="feature-tile">
              <span className="feature-num">02</span>
              <h4>Авто-фолбэк</h4>
              <p>Упёрлись в лимит одного ядра — сервер сам подставит запасное.</p>
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
                  <p>На вкладке «Кабинет» — от 5 до 49 USDT в зависимости от лимита запросов.</p>
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
        </div>
      )}

      {/* КАБИНЕТ + ПОДПИСКА */}
      {activeTab === "profile" && (
        <div className="page">
          <div className="hero hero-compact">
            <p className="hero-tagline">Кабинет</p>
            <p className="hero-sub">Статус подписки, дневной лимит и тарифы — всё на одной странице.</p>
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
                Неактивна — выберите тариф ниже
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

          <div className="section-heading" style={{ marginTop: 48 }}>
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
              <p>
                Переведите ровно <strong>{pendingPayment.amount} {TOKEN_SYMBOL}</strong> ({NETWORK_LABEL}) на адрес:
              </p>
              <div className="ref-link-box">
                <input type="text" readOnly value={pendingPayment.receiverAddress} className="ref-link-input" />
                <button className="btn btn-primary" onClick={copyReceiverAddress}>
                  {copied ? "Скопировано" : "Скопировать"}
                </button>
              </div>
              <p style={{ fontSize: 13, marginTop: 14 }}>
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
