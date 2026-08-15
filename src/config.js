// ============================================================
//  CoreAI Pool — Конфигурация фронтенда
//  Оплата: перевод USDT (BEP-20, BSC) на адрес, который выдаёт бэкенд —
//  без MetaMask/смарт-контракта на стороне сайта.
// ============================================================

// ——— Бэкенд ———
export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export const NETWORK_LABEL = "BSC (BEP-20)";
export const TOKEN_SYMBOL = "USDT";

// ——— Тарифы для ползунка (цена ориентирована на реальную стоимость
//     Gemini Flash / Llama 3.1). Индексы должны совпадать с TIERS в backend/server.js ———
export const SUBSCRIPTION_TIERS = [
  { amount: 5, label: "Старт", requests: "10 запросов/день" },
  { amount: 12, label: "Стандарт", requests: "50 запросов/день" },
  { amount: 25, label: "Про", requests: "200 запросов/день" },
  { amount: 49, label: "Безлимит", requests: "1000 запросов/день" },
];
