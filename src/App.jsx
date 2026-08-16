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
  { q: "Как работает обсуждение?", a: "Два ядра — CoreAI Fast и CoreAI Pro — обсуждают заданную тему между собой, вживую, прямо на главной странице." },
  { q: "Что если у одного ядра кончится лимит?", a: "Сервер сам пробует запасное ядро — обсуждение продолжается без сбоев." },
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

function shortTx(hash) {
  if (!hash) return "";
  return hash.slice(0, 8) + "..." + hash.slice(-6);
}

/* ——— Персонаж-«ядро», флангует панель эфира; светится, когда говорит ——— */
function CoreCharacter({ side, speaking, small, colorA, colorB }) {
  const gradId = `char-${small ? "sm-" : ""}${side}`;
  return (
    <div className={`char char-${side} ${speaking ? "speaking" : ""}`}>
      <svg viewBox="0 0 100 120" aria-hidden="true">
        <defs>
          <radialGradient id={gradId} cx="38%" cy="30%">
            <stop offset="0%" stopColor={colorA} />
            <stop offset="100%" stopColor={colorB} />
          </radialGradient>
        </defs>
        <ellipse cx="50" cy="108" rx="30" ry="7" fill="#000" opacity="0.25" />
        <circle cx="50" cy="55" r="38" fill={`url(#${gradId})`} />
        <circle cx="38" cy="50" r="6" fill="#0b1020" />
        <circle cx="62" cy="50" r="6" fill="#0b1020" />
        <path d="M36 68 Q50 78 64 68" stroke="#0b1020" strokeWidth="4" strokeLinecap="round" fill="none" />
      </svg>
    </div>
  );
}

function App() {
  // ==================== СОСТОЯНИЕ ====================
  const [sessionId, setSessionId] = useState(getOrCreateSessionId);

  // ==================== АККАУНТ (email+пароль — для восстановления sessionId) ====================
  const [authEmail, setAuthEmail] = useState(() => localStorage.getItem("coreai_account_email") || "");
  const [authMode, setAuthMode] = useState("login");
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [isAuthing, setIsAuthing] = useState(false);
  const [paymentHistory, setPaymentHistory] = useState([]);

  function persistSessionId(id) {
    localStorage.setItem("coreai_session_id", id);
    setSessionId(id);
  }

  async function handleAuth(e) {
    e.preventDefault();
    if (!emailInput.trim() || !passwordInput || isAuthing) return;
    setIsAuthing(true);
    setError("");
    try {
      const endpoint = authMode === "register" ? "/api/register" : "/api/login";
      const body =
        authMode === "register"
          ? { email: emailInput.trim(), password: passwordInput, sessionId }
          : { email: emailInput.trim(), password: passwordInput };
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || "Ошибка входа");
      } else {
        persistSessionId(data.sessionId);
        localStorage.setItem("coreai_account_email", data.email);
        setAuthEmail(data.email);
        setEmailInput("");
        setPasswordInput("");
      }
    } catch (err) {
      setError("Ошибка: " + err.message);
    } finally {
      setIsAuthing(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem("coreai_account_email");
    setAuthEmail("");
  }

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/session/${sessionId}/history`);
      if (res.ok) setPaymentHistory((await res.json()).history || []);
    } catch (err) {
      console.error("History load error:", err);
    }
  }, [sessionId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const [userData, setUserData] = useState(null);
  const [poolStats, setPoolStats] = useState(null);

  const [isSubscribing, setIsSubscribing] = useState(false);
  const [pendingPayment, setPendingPayment] = useState(null);
  const [openFaq, setOpenFaq] = useState(null);
  const [copied, setCopied] = useState(false);

  const [activeTab, setActiveTab] = useState("chat");
  const [error, setError] = useState("");

  // ==================== ЭФИР: ДЕБАТЫ CoreAI Fast vs CoreAI Pro ====================
  const [debateTopic, setDebateTopic] = useState("");
  const [debateMessages, setDebateMessages] = useState([]);
  const [topicInput, setTopicInput] = useState("");
  const [isSettingTopic, setIsSettingTopic] = useState(false);
  const debateEndRef = useRef(null);

  const loadDebate = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/debate/messages`);
      if (res.ok) {
        const data = await res.json();
        setDebateTopic(data.topic || "");
        setDebateMessages(data.messages || []);
      }
    } catch (err) {
      console.error("Debate load error:", err);
    }
  }, []);

  useEffect(() => {
    loadDebate();
    const interval = setInterval(loadDebate, 5000);
    return () => clearInterval(interval);
  }, [loadDebate]);

  useEffect(() => {
    if (debateMessages.length > 0) debateEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [debateMessages]);

  async function handleSetTopic(e) {
    e.preventDefault();
    if (!topicInput.trim() || isSettingTopic || !userData?.isActive) return;
    setIsSettingTopic(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/debate/topic`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, topic: topicInput.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setTopicInput("");
        await loadDebate();
        await loadUserData();
      } else {
        setError(data.message || data.error || "Не удалось задать тему");
      }
    } catch (err) {
      setError("Ошибка: " + err.message);
    } finally {
      setIsSettingTopic(false);
    }
  }

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
      <video className="bg-video" autoPlay muted loop playsInline src={`${import.meta.env.BASE_URL}bg.mp4`} />
      <div className="bg-video-overlay" aria-hidden="true"></div>

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
        <div className="home-layout">
          <div className="home-right">
          <div className="chat-panel">
            <form className="chat-input-form topic-form" onSubmit={handleSetTopic}>
              <input
                type="text"
                className="chat-input"
                placeholder="Впишите тему для обсуждения..."
                value={topicInput}
                onChange={(e) => setTopicInput(e.target.value)}
                disabled={isSettingTopic || !userData?.isActive}
                maxLength={200}
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSettingTopic || !topicInput.trim() || !userData?.isActive}
              >
                {isSettingTopic ? "..." : "Обсудить"}
              </button>
            </form>

            {!userData?.isActive && (
              <div className="chat-blocked">Оформите подписку, чтобы задавать свою тему — вкладка «Кабинет»</div>
            )}

            <div className="debate-topic-current">
              Сейчас обсуждают: <strong>{debateTopic || "…"}</strong>
              {userData?.isActive && <div style={{ marginTop: 4 }}>Осталось запросов сегодня: {userData?.dailyRemaining ?? "—"}</div>}
            </div>

            <div className="debate-arena">
              <CoreCharacter
                side="left"
                speaking={debateMessages[debateMessages.length - 1]?.speaker === "fast"}
                colorA="#a5f3fc"
                colorB="#0e7490"
              />

              <div className="debate-panel">
                <div className="debate-messages">
                  {debateMessages.length === 0 && (
                    <div className="chat-empty">
                      <div className="chat-empty-icon">✦</div>
                      <p>Ядра готовятся начать...</p>
                    </div>
                  )}
                  {debateMessages.map((m, i) =>
                    m.speaker === "system" ? (
                      <div className="debate-system" key={i}>
                        {m.text}
                      </div>
                    ) : (
                      <div key={i} className={`debate-msg ${m.speaker}`}>
                        <div className="debate-msg-name">{m.speaker === "fast" ? "CoreAI Fast" : "CoreAI Pro"}</div>
                        <div className="debate-msg-bubble">{m.text}</div>
                      </div>
                    )
                  )}
                  <div ref={debateEndRef} />
                </div>
              </div>

              <CoreCharacter
                side="right"
                speaking={debateMessages[debateMessages.length - 1]?.speaker === "pro"}
                colorA="#e9d5ff"
                colorB="#5b21b6"
              />
            </div>
          </div>
          </div>

          <div className="home-left">
          <div className="hero hero-compact">
            <div className="hero-eyebrow">
              <span className="pill">2 ядра</span>
              Не один ответ, а живой спор двух точек зрения
            </div>
            <p className="hero-tagline">
              Спросите — и два ИИ разберут это между собой
            </p>
            <p className="hero-sub">
              CoreAI Fast и CoreAI Pro обсуждают вопрос вживую, у вас на глазах: соглашаются,
              спорят, приводят контрдоводы друг другу. Вы видите не готовый ответ, а столкновение
              двух позиций — и делаете вывод сами. Впишите свою тему справа, и ядра переключатся
              на неё; не впишете — они всё равно что-то обсуждают.
            </p>
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
            <h3>Аккаунт</h3>
            {authEmail ? (
              <div className="status-active">
                <span className="status-dot green"></span>
                Вы вошли как {authEmail}
                <button className="btn btn-primary btn-sm" onClick={handleLogout} style={{ marginLeft: "auto" }}>
                  Выйти
                </button>
              </div>
            ) : (
              <>
                <p style={{ fontSize: 13 }}>
                  Привяжите email и пароль, чтобы не потерять подписку и историю платежей при смене устройства или
                  очистке браузера.
                </p>
                <form className="chat-input-form topic-form" onSubmit={handleAuth} style={{ flexWrap: "wrap" }}>
                  <input
                    type="email"
                    className="chat-input"
                    placeholder="Email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    disabled={isAuthing}
                  />
                  <input
                    type="password"
                    className="chat-input"
                    placeholder="Пароль (мин. 6 символов)"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    disabled={isAuthing}
                  />
                  <button type="submit" className="btn btn-primary" disabled={isAuthing || !emailInput.trim() || !passwordInput}>
                    {isAuthing ? "..." : authMode === "register" ? "Зарегистрироваться" : "Войти"}
                  </button>
                </form>
                <p style={{ fontSize: 12, marginTop: 10 }}>
                  {authMode === "register" ? "Уже есть аккаунт? " : "Ещё нет аккаунта? "}
                  <a
                    href="#"
                    style={{ color: "var(--cyan)" }}
                    onClick={(e) => {
                      e.preventDefault();
                      setAuthMode(authMode === "register" ? "login" : "register");
                    }}
                  >
                    {authMode === "register" ? "Войти" : "Зарегистрироваться"}
                  </a>
                </p>
              </>
            )}
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

          {userData?.isActive && (
            <div className="card">
              <h3>Остаток за весь период (30 дней)</h3>
              <div className="progress-bar-container">
                <div
                  className="progress-bar"
                  style={{
                    width: `${userData.periodAllowance > 0 ? (userData.periodUsed / userData.periodAllowance) * 100 : 0}%`,
                  }}
                ></div>
              </div>
              <div className="progress-label">
                {userData.periodUsed} / {userData.periodAllowance} использовано
                {userData.rolledOver > 0 && ` (включая ${userData.rolledOver} перенесённых с прошлого периода)`}
              </div>
              <p style={{ fontSize: 12, marginTop: 8 }}>
                Не использовали лимит — не сгорает. При продлении подписки остаток переносится в новый период.
              </p>
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

          {paymentHistory.length > 0 && (
            <div className="card">
              <h3>История платежей</h3>
              <div className="admin-users-table">
                <table>
                  <thead>
                    <tr>
                      <th>Дата</th>
                      <th>Сумма</th>
                      <th>Действует до</th>
                      <th>Перенесено</th>
                      <th>Tx</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentHistory.map((h, i) => (
                      <tr key={i}>
                        <td>{formatDate(h.activatedAt)}</td>
                        <td>
                          {h.amount} {TOKEN_SYMBOL}
                        </td>
                        <td>{formatDate(h.expiresAt)}</td>
                        <td>{h.rolledOver || 0}</td>
                        <td>
                          <a
                            href={`https://bscscan.com/tx/${h.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={h.txHash}
                          >
                            {shortTx(h.txHash)}
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
