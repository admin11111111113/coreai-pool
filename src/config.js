// ============================================================
//  CoreAI Pool — Конфигурация фронтенда
// ============================================================

// ——— Сеть: BNB Smart Chain ———
export const CHAIN_ID = 56;
export const CHAIN_NAME = "BNB Smart Chain";
export const RPC_URL = "https://bsc-dataseed.binance.org";
export const EXPLORER_URL = "https://bscscan.com";

// ——— Бэкенд ———
export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

// ——— Контракт ———
export const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || "0x_YOUR_CONTRACT_ADDRESS";

// ——— Токен оплаты (USDT на BSC) ———
export const TOKEN_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";
export const TOKEN_DECIMALS = 18;
export const TOKEN_SYMBOL = "USDT";

// ——— Тарифы для ползунка (цена ориентирована на реальную стоимость
//     Gemini Flash / Llama 3.1, не на реферальную схему) ———
export const SUBSCRIPTION_TIERS = [
  { amount: 5,  label: "Старт",    requests: "10 запросов/день" },
  { amount: 12, label: "Стандарт", requests: "50 запросов/день" },
  { amount: 25, label: "Про",      requests: "200 запросов/день" },
  { amount: 49, label: "Безлимит", requests: "1000 запросов/день" },
];
