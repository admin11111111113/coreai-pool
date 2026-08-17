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

// Приход по чужой реф-ссылке (?ref=<sessionId>) — запоминаем один раз,
// дальше используется при /api/reserve, чем бы ни закончился визит сейчас.
function captureReferrer(ownSessionId) {
  const ref = new URLSearchParams(window.location.search).get("ref");
  if (ref && ref !== ownSessionId && !localStorage.getItem("coreai_ref_id")) {
    localStorage.setItem("coreai_ref_id", ref);
  }
}

function shortTx(hash) {
  if (!hash) return "";
  return hash.slice(0, 8) + "..." + hash.slice(-6);
}


function App() {
  // ==================== СОСТОЯНИЕ ====================
  const [sessionId, setSessionId] = useState(getOrCreateSessionId);

  // ==================== РЕФЕРАЛЬНАЯ ПРОГРАММА ====================
  const [referralStats, setReferralStats] = useState({ referralPercent: 30, pendingBalance: 0, referredCount: 0 });
  const [refLinkCopied, setRefLinkCopied] = useState(false);
  const referralLink = `${window.location.origin}${window.location.pathname}?ref=${sessionId}`;

  useEffect(() => {
    captureReferrer(sessionId);
  }, [sessionId]);

  const loadReferralStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/session/${sessionId}/referrals`);
      if (res.ok) setReferralStats(await res.json());
    } catch (err) {
      console.error("Referral stats load error:", err);
    }
  }, [sessionId]);

  useEffect(() => {
    loadReferralStats();
    const interval = setInterval(loadReferralStats, 20000);
    return () => clearInterval(interval);
  }, [loadReferralStats]);

  function copyReferralLink() {
    navigator.clipboard.writeText(referralLink);
    setRefLinkCopied(true);
    setTimeout(() => setRefLinkCopied(false), 2000);
  }

  // ==================== БОНУСНЫЙ ПУЛ (само-обслуживание) ====================
  const [poolStats, setPoolStats] = useState({
    hasWallet: false,
    claimableBalance: 0,
    estimatedToday: 0,
    canClaimToday: false,
    nextClaimAt: null,
    minWithdrawal: 1,
  });
  const [isPoolClaiming, setIsPoolClaiming] = useState(false);
  const [isPoolWithdrawing, setIsPoolWithdrawing] = useState(false);
  const [poolMsg, setPoolMsg] = useState("");
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    const tick = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  function formatCountdown(ms) {
    if (ms <= 0) return "00:00:00";
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  const loadPoolStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/session/${sessionId}/pool`);
      if (res.ok) setPoolStats(await res.json());
    } catch (err) {
      console.error("Pool stats load error:", err);
    }
  }, [sessionId]);

  useEffect(() => {
    loadPoolStats();
    const interval = setInterval(loadPoolStats, 20000);
    return () => clearInterval(interval);
  }, [loadPoolStats]);

  async function handlePoolClaim() {
    setIsPoolClaiming(true);
    setPoolMsg("");
    try {
      const res = await fetch(`${API_URL}/api/session/${sessionId}/pool-claim`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setPoolMsg(data.message || data.error || "Не удалось забрать долю");
      } else if (data.claimed > 0) {
        setPoolMsg(`Забрано: ${data.claimed} USDT`);
      } else {
        setPoolMsg(data.message || "Пока нечего забирать");
      }
      await loadPoolStats();
    } catch (err) {
      setPoolMsg("Ошибка: " + err.message);
    } finally {
      setIsPoolClaiming(false);
    }
  }

  async function handlePoolWithdraw() {
    setIsPoolWithdrawing(true);
    setPoolMsg("");
    try {
      const res = await fetch(`${API_URL}/api/session/${sessionId}/pool-withdraw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        setPoolMsg(data.message || data.error || "Не удалось вывести");
      } else {
        setPoolMsg(`Выведено: ${data.amount} USDT`);
      }
      await loadPoolStats();
    } catch (err) {
      setPoolMsg("Ошибка: " + err.message);
    } finally {
      setIsPoolWithdrawing(false);
    }
  }

  // ==================== АККАУНТ (email+пароль — для восстановления sessionId) ====================
  // authMode: "login" | "register" | "forgot" (запрос кода) | "reset" (код + новый пароль)
  const [authEmail, setAuthEmail] = useState(() => localStorage.getItem("coreai_account_email") || "");
  const [authMode, setAuthMode] = useState("login");
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [resetCodeInput, setResetCodeInput] = useState("");
  const [newPasswordInput, setNewPasswordInput] = useState("");
  const [authNotice, setAuthNotice] = useState("");
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

  async function handleForgotPassword(e) {
    e.preventDefault();
    if (!emailInput.trim() || isAuthing) return;
    setIsAuthing(true);
    setError("");
    setAuthNotice("");
    try {
      const res = await fetch(`${API_URL}/api/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || "Ошибка");
      } else {
        setAuthMode("reset");
        setAuthNotice(data.message || "Если такой email зарегистрирован, код отправлен на почту.");
      }
    } catch (err) {
      setError("Ошибка: " + err.message);
    } finally {
      setIsAuthing(false);
    }
  }

  async function handleResetPassword(e) {
    e.preventDefault();
    if (!emailInput.trim() || !resetCodeInput.trim() || !newPasswordInput || isAuthing) return;
    setIsAuthing(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailInput.trim(), code: resetCodeInput.trim(), newPassword: newPasswordInput }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || "Ошибка");
      } else {
        persistSessionId(data.sessionId);
        localStorage.setItem("coreai_account_email", data.email);
        setAuthEmail(data.email);
        setEmailInput("");
        setPasswordInput("");
        setResetCodeInput("");
        setNewPasswordInput("");
        setAuthNotice("");
        setAuthMode("login");
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
  const [debateMoodFast, setDebateMoodFast] = useState("tough");
  const [debateMoodPro, setDebateMoodPro] = useState("tough");
  const [debateArchive, setDebateArchive] = useState([]);
  const [topicInput, setTopicInput] = useState("");
  const [topicMood, setTopicMood] = useState("tough");
  const [topicNotice, setTopicNotice] = useState("");
  const [isSettingTopic, setIsSettingTopic] = useState(false);
  const debateMessagesRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const topicInputRef = useRef(null);

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
        setDebateMoodFast(data.moodFast || "tough");
        setDebateMoodPro(data.moodPro || "tough");
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

  // Тема может быть длинным вопросом — растим textarea под текст вместо
  // того, чтобы прятать его в однострочном инпуте со скроллом влево.
  useEffect(() => {
    const el = topicInputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 220) + "px";
  }, [topicInput]);

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
        body: JSON.stringify({ sessionId, amount, refSessionId: localStorage.getItem("coreai_ref_id") || undefined }),
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

  function moodBadge(moodFast, moodPro) {
    if (moodFast === "tough" && moodPro === "tough") return "🔥 Жёстко";
    if (moodFast === "kind" && moodPro === "kind") return "🤝 Мягко";
    return "🔥🤝 Вперемешку";
  }

  function speakerLabel(speaker) {
    if (speaker === "fast") return "CoreAI Fast";
    if (speaker === "pro") return "CoreAI Pro";
    return "Итог спора";
  }

  function speakerColor(speaker) {
    if (speaker === "fast") return "var(--cyan)";
    if (speaker === "pro") return "var(--violet)";
    return "var(--signal)";
  }

  function documentPdfUrl(round, download) {
    const params = new URLSearchParams({ finishedAt: String(round.finishedAt) });
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
              <textarea
                ref={topicInputRef}
                className="chat-input topic-textarea"
                placeholder="Впишите тему для обсуждения..."
                value={topicInput}
                onChange={(e) => setTopicInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSetTopic(e);
                  }
                }}
                disabled={isSettingTopic}
                maxLength={1000}
                rows={1}
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
                              <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: speakerColor(m.speaker) }}>
                                {speakerLabel(m.speaker)}:
                              </span>{" "}
                              {m.text}
                            </p>
                          ))}
                        <div className="doc-buttons">
                          <a className="doc-btn" href={documentPdfUrl(round, false)} target="_blank" rel="noreferrer">
                            📄 Документ
                          </a>
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
              <div style={{ marginTop: 4 }}>Настроение раунда: {moodBadge(debateMoodFast, debateMoodPro)}</div>
              {debateQueueLength > 0 && (
                <div style={{ marginTop: 4 }}>В очереди тем: {debateQueueLength}</div>
              )}
              {!debateIsDefaultTopic && debatePhase === "replies" && (
                <div style={{ marginTop: 4 }}>Разбор вашей темы — осталось реплик: {debateRepliesLeft}</div>
              )}
              {!debateIsDefaultTopic && debatePhase === "joint-draft" && (
                <div style={{ marginTop: 4 }}>CoreAI Fast пишет черновик общего итога...</div>
              )}
              {!debateIsDefaultTopic && debatePhase === "joint-final" && (
                <div style={{ marginTop: 4 }}>CoreAI Pro дорабатывает общий итог...</div>
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
                    <div
                      key={i}
                      className={`debate-msg ${m.speaker} ${m.isConclusion ? "conclusion" : ""} ${m.isDraft ? "draft" : ""}`}
                    >
                      <div className="debate-msg-name" style={{ color: speakerColor(m.speaker) }}>
                        {m.isDraft ? "Черновик итога — " : m.isConclusion ? "🤝 " : ""}
                        {speakerLabel(m.speaker)}
                      </div>
                      <div className="debate-msg-bubble">{m.text}</div>
                      {m.isConclusion &&
                        (() => {
                          const round = findArchivedRoundForMessage(m.ts);
                          if (!round) return null;
                          return (
                            <a
                              className="doc-btn doc-btn-inline"
                              href={documentPdfUrl(round, false)}
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
            <p>
              В конце спора ядра сходятся на одном общем выводе — это не голосование за победителя, а честная
              попытка учесть сильные стороны обеих позиций. Проверять его на своей ситуации всё равно вам.
            </p>
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
            ) : authMode === "forgot" ? (
              <>
                <p style={{ fontSize: 13 }}>Впишите email — пришлём код для сброса пароля.</p>
                <form className="chat-input-form topic-form" onSubmit={handleForgotPassword} style={{ flexWrap: "wrap" }}>
                  <input
                    type="email"
                    className="chat-input"
                    placeholder="Email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    disabled={isAuthing}
                  />
                  <button type="submit" className="btn btn-primary" disabled={isAuthing || !emailInput.trim()}>
                    {isAuthing ? "..." : "Отправить код"}
                  </button>
                </form>
                <p style={{ fontSize: 12, marginTop: 10 }}>
                  <a
                    href="#"
                    style={{ color: "var(--signal)" }}
                    onClick={(e) => {
                      e.preventDefault();
                      setAuthMode("login");
                      setAuthNotice("");
                      setError("");
                    }}
                  >
                    ← Назад ко входу
                  </a>
                </p>
              </>
            ) : authMode === "reset" ? (
              <>
                <p style={{ fontSize: 13 }}>
                  {authNotice || `Код отправлен на ${emailInput || "почту"} — впишите его и новый пароль.`}
                </p>
                <form className="chat-input-form topic-form" onSubmit={handleResetPassword} style={{ flexWrap: "wrap" }}>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="chat-input"
                    placeholder="Код из письма (6 цифр)"
                    value={resetCodeInput}
                    onChange={(e) => setResetCodeInput(e.target.value.replace(/\D/g, ""))}
                    disabled={isAuthing}
                    maxLength={6}
                  />
                  <input
                    type="password"
                    className="chat-input"
                    placeholder="Новый пароль (мин. 6 символов)"
                    value={newPasswordInput}
                    onChange={(e) => setNewPasswordInput(e.target.value)}
                    disabled={isAuthing}
                  />
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={isAuthing || !resetCodeInput.trim() || !newPasswordInput}
                  >
                    {isAuthing ? "..." : "Сохранить пароль"}
                  </button>
                </form>
                <p style={{ fontSize: 12, marginTop: 10 }}>
                  <a
                    href="#"
                    style={{ color: "var(--signal)" }}
                    onClick={(e) => {
                      e.preventDefault();
                      setAuthMode("forgot");
                      setAuthNotice("");
                      setError("");
                    }}
                  >
                    Не пришёл код? Отправить заново
                  </a>
                </p>
              </>
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
                      setError("");
                    }}
                  >
                    {authMode === "register" ? "Войти" : "Зарегистрироваться"}
                  </a>
                  {authMode === "login" && (
                    <>
                      {" · "}
                      <a
                        href="#"
                        style={{ color: "var(--signal)" }}
                        onClick={(e) => {
                          e.preventDefault();
                          setAuthMode("forgot");
                          setError("");
                        }}
                      >
                        Забыли пароль?
                      </a>
                    </>
                  )}
                </p>
              </>
            )}
          </div>

          <div className="card">
            <h3>Реферальная программа</h3>
            {authEmail ? (
              <>
                <p style={{ fontSize: 13 }}>
                  Приведите друга по своей ссылке — получайте {referralStats.referralPercent}% с каждой его оплаты,
                  не только с первой.
                </p>
                <div className="row" style={{ marginTop: 10 }}>
                  <input type="text" readOnly value={referralLink} className="ref-link-input" />
                  <button className="btn btn-primary" onClick={copyReferralLink}>
                    {refLinkCopied ? "Скопировано" : "Скопировать"}
                  </button>
                </div>
                <div style={{ marginTop: 10, fontSize: 13 }}>
                  Приведено: <strong>{referralStats.referredCount}</strong> · Накоплено к выплате:{" "}
                  <strong>{referralStats.pendingBalance} USDT</strong>
                </div>
              </>
            ) : (
              <p style={{ fontSize: 13 }}>
                Своя реферальная ссылка появится здесь после регистрации — привяжите email и пароль в блоке «Аккаунт» выше.
              </p>
            )}
          </div>

          <div className="card">
            <h3>Бонусный пул</h3>
            {poolStats.hasWallet ? (
              <>
                <p style={{ fontSize: 13 }}>
                  Каждый день до 19:00 по Москве можно забрать свою долю от того, что упало в общий пул —
                  пропорционально тому, сколько вы всего заплатили. Не успели до дедлайна — доля достаётся тем, кто
                  забирает регулярно, не пропадает впустую, но и не копится за вас. Понедельник — выходной, ничего
                  нажимать не нужно, его доля сама объединится со вторником.
                </p>
                <div className="stats-grid" style={{ marginTop: 10 }}>
                  <div className="stat">
                    <div className="stat-label">Доступно к выводу</div>
                    <div className="stat-value">{poolStats.claimableBalance} USDT</div>
                  </div>
                  <div className="stat">
                    <div className="stat-label">Оценка на сегодня</div>
                    <div className="stat-value">{poolStats.estimatedToday} USDT</div>
                  </div>
                </div>
                <div className="row" style={{ marginTop: 10 }}>
                  <button className="btn btn-primary" onClick={handlePoolClaim} disabled={!poolStats.canClaimToday || isPoolClaiming}>
                    {isPoolClaiming
                      ? "..."
                      : poolStats.canClaimToday
                      ? "Забрать сегодняшнюю долю"
                      : poolStats.nextClaimAt
                      ? `Можно через ${formatCountdown(poolStats.nextClaimAt - nowTick)}`
                      : "Уже забрано"}
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={handlePoolWithdraw}
                    disabled={poolStats.claimableBalance < poolStats.minWithdrawal || isPoolWithdrawing}
                  >
                    {isPoolWithdrawing ? "..." : "Вывести на кошелёк"}
                  </button>
                </div>
                {poolMsg && <p style={{ fontSize: 12, marginTop: 8 }}>{poolMsg}</p>}
                <p style={{ fontSize: 11, marginTop: 8, color: "var(--text-mute)" }}>
                  Вывод идёт автоматически на кошелёк, с которого вы платили за подписку. Минимум для вывода —{" "}
                  {poolStats.minWithdrawal} USDT.
                </p>
              </>
            ) : (
              <p style={{ fontSize: 13 }}>
                Появится после первой оплаты подписки — вывод идёт на тот же кошелёк, с которого вы платите.
              </p>
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
                  3 {TOKEN_SYMBOL} = один полный разбор темы (16 реплик + общий итог)
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
