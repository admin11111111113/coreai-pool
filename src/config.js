// ============================================================
//  CoreAI Pool — Конфигурация фронтенда
//  Оплата: перевод USDT (BEP-20, BSC) на адрес, который выдаёт бэкенд —
//  без MetaMask/смарт-контракта на стороне сайта.
// ============================================================

// ——— Бэкенд ———
export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export const NETWORK_LABEL = "BSC (BEP-20)";
export const TOKEN_SYMBOL = "USDT";

// ——— Тариф — непрерывный слайдер $3-$1980/мес. "Запрос" = одна тема (один
//     полный диалог: 8 реплик + 2 итога), цена $3 за штуку. Блоков в месяц =
//     floor(amount/3); дневной лимит = блоков/30 (1980 -> 660 блоков -> ровно
//     22/день без остатка). Формула должна совпадать с
//     backend/server.js computeDailyLimit()/computeBlocksPerMonth() ———
export const TIER_MIN_AMOUNT = 3;
export const TIER_MAX_AMOUNT = 1980;
const TIER_BLOCK_PRICE = 3;

export function computeBlocksPerMonth(amount) {
  return Math.floor(amount / TIER_BLOCK_PRICE);
}

export function computeDailyLimit(amount) {
  return Math.max(1, Math.round(computeBlocksPerMonth(amount) / 30));
}
