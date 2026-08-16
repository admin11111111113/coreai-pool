// ============================================================
//  CoreAI Pool — Главный компонент
//
//  Без MetaMask/смарт-контракта: у браузера есть свой sessionId
//  (localStorage). Оплата — перевод USDT на адрес от бэкенда,
//  бэкенд сам сверяет платёж по блокчейну и активирует подписку.
// ============================================================

import { useState, useEffect, useRef, useCallback } from "react";

import { API_URL, TOKEN_SYMBOL, NETWORK_LABEL, TIER_MIN_AMOUNT, TIER_MAX_AMOUNT, computeDailyLimit } from "./config.js";
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

  const [isSubscribing, setIsSubscribing] = useState(false);
  const [pendingPayment, setPendingPayment] = useState(null);
  const [openFaq, setOpenFaq] = useState(null);
  const [copied, setCopied] = useState(false);
  const [tierAmount, setTierAmount] = useState(30);

  const [activeTab, setActiveTab] = useState("chat");
  const [error, setError] = useState("");

  // ==================== ЭФИР: ДЕБАТЫ CoreAI Fast vs CoreAI Pro ====================
  const [debateTopic, setDebateTopic] = useState("");
  const [debateMessages, setDebateMessages] = useState([]);
  const [debateIsDefaultTopic, setDebateIsDefaultTopic] = useState(true);
  const [debatePhase, setDebatePhase] = useState(null);
  const [debateRepliesLeft, setDebateRepliesLeft] = useState(0);
  const [debateQueueLength, setDebateQueueLength] = useState(0);
  const [debateArchive, setDebateArchive] = useState([]);
  const [topicInput, setTopicInput] = useState("");
  const [topicMood, setTopicMood] = useState("tough");
  const [topicNotice, setTopicNotice] = useState("");
  const [isSettingTopic, setIsSettingTopic] = useState(false);
  const debateMessagesRef = useRef(null);
  const stickToBottomRef = useRef(true);

  // ==================== ФОН: пинг-понг воспроизведение видео ====================
  // Обычный loop даёт резкий рывок в конце ролика. Вместо этого сами гоним
  // currentTime вперёд-назад (вперёд до конца, потом обратно к началу) —
  // получается непрерывное "дыхание" без видимого шва, и медленнее оригинала.
  const bgVideoRef = useRef(null);
  useEffect(() => {
    const video = bgVideoRef.current;
    if (!video) return;
    const PLAYBACK_SPEED = 0.4; // доля от нормальной скорости
    let direction = 1;
    let lastTs = null;
    let rafId = null;
    let seeking = false; // ждём завершения предыдущего seek, иначе декодер захлёбывается и виснет

    function step(ts) {
      rafId = requestAnimationFrame(step);
      if (seeking) return;
      if (lastTs === null) lastTs = ts;
      const dt = (ts - lastTs) / 1000;
      lastTs = ts;
      if (video.duration) {
        let next = video.currentTime + direction * PLAYBACK_SPEED * dt;
        if (next >= video.duration) {
          next = video.duration;
          direction = -1;
        } else if (next <= 0) {
          next = 0;
          direction = 1;
        }
        seeking = true;
        video.currentTime = next;
      }
    }

    function onSeeked() {
      seeking = false;
      lastTs = null; // не копим большой dt пока ждали seek
    }

    function start() {
      video.pause();
      if (rafId === null) rafId = requestAnimationFrame(step);
    }

    video.addEventListener("seeked", onSeeked);
    if (video.readyState >= 1) start();
    else video.addEventListener("loadedmetadata", start, { once: true });

    return () => {
      video.removeEventListener("loadedmetadata", start);
      video.removeEventListener("seeked", onSeeked);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

  const loadDebate = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/debate/messages`);
      if (res.ok) {
        const data = await res.json();
        setDebateTopic(data.topic || "");
        setDebateMessages(data.messages || []);
        setDebateIsDefaultTopic(data.isDefaultTopic !== false);
        setDebatePhase(data.phase || null);
        setDebateRepliesLeft(data.repliesLeft || 0);
        setDebateQueueLength(data.queueLength || 0);
      }
    } catch (err) {
      console.error("Debate load error:", err);
    }
  }, []);

  const loadDebateArchive = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/debate/archive`);
      if (res.ok) {
        const data = await res.json();
        setDebateArchive(data.items || []);
      }
    } catch (err) {
      console.error("Debate archive load error:", err);
    }
  }, []);

  useEffect(() => {
    loadDebate();
    const interval = setInterval(loadDebate, 5000);
    return () => clearInterval(interval);
  }, [loadDebate]);

  useEffect(() => {
    loadDebateArchive();
    // Тот же темп, что у loadDebate — иначе документ по только что
    // завершённой теме до 20 сек не появлялся у итоговых сообщений.
    const interval = setInterval(loadDebateArchive, 5000);
    return () => clearInterval(interval);
  }, [loadDebateArchive]);

  useEffect(() => {
    const el = debateMessagesRef.current;
    if (!el) return;
    // "Прилипание" к низу — как в мессенджерах: пока пользователь реально
    // у самого низа, новые реплики докручивают вид; стоит чуть прокрутить
    // вверх почитать — автопрокрутка выключается, пока не вернётся к низу сам.
    function onScroll() {
      stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 16;
    }
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const el = debateMessagesRef.current;
    if (!el || debateMessages.length === 0) return;
    if (stickToBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [debateMessages]);

  async function handleSetTopic(e) {
    e.preventDefault();
    // ВРЕМЕННО (тестирование) — гейт по подписке убран, см. TODO у backend /api/debate/topic.
    if (!topicInput.trim() || isSettingTopic) return;
    setIsSettingTopic(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/debate/topic`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, topic: topicInput.trim(), mood: topicMood }),
      });
      const data = await res.json();
      if (res.ok) {
        setTopicInput("");
        setTopicNotice(
          data.queued
            ? `Тема встала в очередь (позиция ${data.position}) — начнётся, как только доспорит текущая тема.`
            : ""
        );
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

  async function handleSubscribe(amount) {
    setIsSubscribing(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/reserve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, amount }),
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

  function documentPdfUrl(round, speaker, download) {
    const params = new URLSearchParams({ finishedAt: String(round.finishedAt), speaker });
    if (download) params.set("download", "1");
    return `${API_URL}/api/debate/document.pdf?${params.toString()}`;
  }

  // Итоговое сообщение в живой ленте — не привязано к finishedAt напрямую
  // (это просто одно из debateMessages), поэтому ищем архивный раунд, в
  // котором есть сообщение с тем же timestamp.
  function findArchivedRoundForMessage(ts) {
    return debateArchive.find((r) => r.messages.some((mm) => mm.ts === ts));
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
      <video ref={bgVideoRef} className="bg-video" muted playsInline preload="auto" src={`${import.meta.env.BASE_URL}bg.mp4`} />
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
              Не один ассистент с готовым ответом, а два независимых ядра, которые спорят о вашем
              вопросе вживую. Вы читаете столкновение позиций и делаете вывод сами.
            </p>
          </div>

          <div className="debate-hub">
          <div className="chat-panel">
            <form className="chat-input-form topic-form" onSubmit={handleSetTopic}>
              <input
                type="text"
                className="chat-input"
                placeholder="Впишите тему для обсуждения..."
                value={topicInput}
                onChange={(e) => setTopicInput(e.target.value)}
                disabled={isSettingTopic}
                maxLength={200}
              />
              <button type="submit" className="btn btn-primary" disabled={isSettingTopic || !topicInput.trim()}>
                {isSettingTopic ? "..." : "Обсудить"}
              </button>
            </form>

            {topicInput.trim().length >= 2 &&
              (() => {
                const q = topicInput.trim().toLowerCase();
                const matches = debateArchive.filter((r) => r.topic.toLowerCase().includes(q)).slice(0, 3);
                if (matches.length === 0) return null;
                return (
                  <div className="topic-suggest">
                    <div className="topic-suggest-label">
                      Похожая тема уже обсуждалась — готовый ответ ниже, или впишите точнее и нажмите «Обсудить»,
                      чтобы создать новую:
                    </div>
                    {matches.map((round) => (
                      <div className="topic-suggest-card" key={round.finishedAt}>
                        <strong>{round.topic}</strong>
                        {round.messages
                          .filter((m) => m.isConclusion)
                          .map((m, j) => (
                            <p key={j} style={{ marginTop: 8 }}>
                              <span
                                style={{
                                  fontFamily: "var(--mono)",
                                  fontSize: 11,
                                  color: m.speaker === "fast" ? "var(--cyan)" : "var(--violet)",
                                }}
                              >
                                {m.speaker === "fast" ? "CoreAI Fast" : "CoreAI Pro"}:
                              </span>{" "}
                              {m.text}
                            </p>
                          ))}
                        <div className="doc-buttons">
                          {["fast", "pro"].map((speaker) => (
                            <a
                              key={speaker}
                              className="doc-btn"
                              href={documentPdfUrl(round, speaker, false)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {`📄 Документ ${speaker === "fast" ? "Fast" : "Pro"}`}
                            </a>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}

            <div className="mood-picker">
              {[
                { key: "tough", label: "🔥 Жёстко" },
                { key: "kind", label: "🤝 Мягко" },
                { key: "mixed", label: "🔥🤝 Вперемешку" },
              ].map((m) => (
                <button
                  key={m.key}
                  type="button"
                  className={`mood-btn ${topicMood === m.key ? "active" : ""}`}
                  onClick={() => setTopicMood(m.key)}
                  disabled={isSettingTopic}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* ВРЕМЕННО (тестирование) — блокировка по подписке скрыта, см. TODO у backend /api/debate/topic. */}

            {topicNotice && <div className="chat-blocked">{topicNotice}</div>}

            <div className="debate-topic-current">
              Сейчас обсуждают: <strong>{debateTopic || "…"}</strong>
              {debateQueueLength > 0 && (
                <div style={{ marginTop: 4 }}>В очереди тем: {debateQueueLength}</div>
              )}
              {!debateIsDefaultTopic && debatePhase === "replies" && (
                <div style={{ marginTop: 4 }}>Разбор вашей темы — осталось реплик: {debateRepliesLeft}</div>
              )}
              {!debateIsDefaultTopic && (debatePhase === "conclusion-fast" || debatePhase === "conclusion-pro") && (
                <div style={{ marginTop: 4 }}>Ядра подводят итоги...</div>
              )}
              {userData?.isActive && <div style={{ marginTop: 4 }}>Осталось тем в этом периоде: {userData?.dailyRemaining ?? "—"}</div>}
            </div>

            <div className="debate-panel">
              <div className="debate-messages" ref={debateMessagesRef}>
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
                    <div key={i} className={`debate-msg ${m.speaker} ${m.isConclusion ? "conclusion" : ""}`}>
                      <div className="debate-msg-name">
                        {m.isConclusion ? "Итог — " : ""}
                        {m.speaker === "fast" ? "CoreAI Fast" : "CoreAI Pro"}
                      </div>
                      <div className="debate-msg-bubble">{m.text}</div>
                      {m.isConclusion &&
                        (() => {
                          const round = findArchivedRoundForMessage(m.ts);
                          if (!round) return null;
                          return (
                            <a
                              className="doc-btn doc-btn-inline"
                              href={documentPdfUrl(round, m.speaker, false)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              📄 Документ
                            </a>
                          );
                        })()}
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
          </div>

          <div className="steps">
            <h3 className="steps-title">Как это устроено</h3>
            <div className="steps-grid">
              <div className="step">
                <span className="step-dot">1</span>
                <div>
                  <strong>Два разных движка</strong>
                  <p>
                    Внутри работают две разные модели: CoreAI Fast и CoreAI Pro. Разные архитектуры,
                    разные обучающие данные — поэтому на один и тот же вопрос они приходят к разным
                    выводам. Это не одна модель, играющая две роли: это два независимых движка,
                    которые действительно расходятся во мнениях.
                  </p>
                </div>
              </div>
              <div className="step">
                <span className="step-dot">2</span>
                <div>
                  <strong>Они отвечают друг другу, а не вам</strong>
                  <p>
                    Каждый ход ядро получает последнюю реплику оппонента и отвечает именно на неё:
                    соглашается, уточняет цифру, ловит натяжку в рассуждении. Каждому задано отстаивать
                    свою позицию и искать слабое место в чужой — поэтому диалог не скатывается во
                    взаимные кивки.
                  </p>
                </div>
              </div>
              <div className="step">
                <span className="step-dot">3</span>
                <div>
                  <strong>Тему задаёте вы</strong>
                  <p>
                    Впишите вопрос — ядра переключатся на него со следующей реплики. Ничего не
                    впишете — они всё равно продолжат обсуждать: на витрине всегда идёт живой спор,
                    его видно до всякой подписки.
                  </p>
                </div>
              </div>
              <div className="step">
                <span className="step-dot">4</span>
                <div>
                  <strong>Спор не обрывается</strong>
                  <p>
                    У бесплатных лимитов ИИ-провайдеров есть потолок. Если одно ядро упёрлось в
                    лимит, сервер молча подставляет второе — диалог продолжается, вы этого не
                    замечаете.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <h3>Зачем спор, если можно спросить один раз</h3>
            <p>
              Один ИИ всегда звучит уверенно — в том числе когда ошибается. Вы получаете гладкий
              абзац и не видите, где вывод натянут, а где держится на допущении.
            </p>
            <p>
              Когда спорят двое, слабое место всплывает само: ровно там, где второе ядро цепляется
              за формулировку. Вам не нужно быть экспертом, чтобы это заметить — достаточно
              прочитать, в чём именно они не сошлись.
            </p>
          </div>

          <div className="card">
            <h3>Чем отличается от обычного чата</h3>
            <div className="feature-grid">
              <div className="feature-tile">
                <h4>Обычный чат с ИИ</h4>
                <p>Вопрос → один уверенный ответ → верить или нет, решаете вслепую.</p>
              </div>
              <div className="feature-tile">
                <h4>CoreAI Pool</h4>
                <p>Вопрос → два разбора, которые сталкиваются → видно, что спорно, и вывод делаете вы.</p>
              </div>
            </div>
          </div>

          <div className="card">
            <h3>Честно об ограничениях</h3>
            <p>Оба ядра могут ошибаться в одну сторону. Спор снижает риск, но не отменяет проверку фактов.</p>
            <p>Это не финансовая, юридическая и не медицинская консультация — это два взгляда на вопрос, а не рекомендация.</p>
            <p>Итог не выносится. Ядра не голосуют и не объявляют победителя: вывод остаётся за вами. В этом смысл.</p>
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
                    style={{ color: "var(--signal)" }}
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

          <div className="section-heading" style={{ marginTop: 48 }}>
            <h2>Тарифы</h2>
          </div>

          {!pendingPayment ? (
            <div className="pricing-slider-card card">
              <div className="tier-price">
                {tierAmount} {TOKEN_SYMBOL}
                <span className="tier-period">/30 дней</span>
              </div>
              <input
                type="range"
                min={TIER_MIN_AMOUNT}
                max={TIER_MAX_AMOUNT}
                step={1}
                value={tierAmount}
                onChange={(e) => setTierAmount(Number(e.target.value))}
                className="pricing-slider"
              />
              <div className="pricing-slider-scale">
                <span>{TIER_MIN_AMOUNT} {TOKEN_SYMBOL}</span>
                <span>{TIER_MAX_AMOUNT} {TOKEN_SYMBOL}</span>
              </div>
              <div className="tier-requests">
                ≈ {computeDailyLimit(tierAmount)} запросов/день
                <div style={{ fontSize: 12, marginTop: 6, color: "var(--text-mute)" }}>
                  3 {TOKEN_SYMBOL} = один полный разбор темы (8 реплик + 2 итога)
                </div>
              </div>
              <button
                className="btn btn-primary btn-large"
                onClick={() => handleSubscribe(tierAmount)}
                disabled={isSubscribing}
              >
                {isSubscribing ? "..." : "Оформить"}
              </button>
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

    </div>
  );
}

export default App;
