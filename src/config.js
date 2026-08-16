// ============================================================
//  CoreAI Pool — Конфигурация фронтенда
//  Оплата: перевод USDT (BEP-20, BSC) на адрес, который выдаёт бэкенд —
//  без MetaMask/смарт-контракта на стороне сайта.
// ============================================================

// ——— Бэкенд ———
export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export const NETWORK_LABEL = "BSC (BEP-20)";
export const TOKEN_SYMBOL = "USDT";

// ——— Тариф — непрерывный слайдер $3-$2000/мес. $3 — цена одного полного
//     диалога ядер (8 реплик + 2 итога = 10 сообщений). Дневной лимит =
//     (amount/3 блоков в месяц * 10 сообщений) / 30 дней, минимум 1/день.
//     Формула должна совпадать с backend/server.js computeDailyLimit() ———
export const TIER_MIN_AMOUNT = 3;
export const TIER_MAX_AMOUNT = 2000;

export function computeDailyLimit(amount) {
  return Math.max(1, Math.round(amount / 9));
}
