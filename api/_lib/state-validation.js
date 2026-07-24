const MAX_PRODUCTS = 5_000;
const MAX_COMMISSION_ROWS = 1_000;
const MAX_OBJECT_KEYS = 64;
const MAX_TEXT_LENGTH = 2_000;
const MAX_SETTINGS_ARRAY_ITEMS = 100;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_KEY = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isSafePrimitive(value) {
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value) && Math.abs(value) <= 1_000_000_000_000;
  return typeof value === "string" && value.length <= MAX_TEXT_LENGTH;
}

function hasSafeObjectShape(value) {
  if (!isPlainObject(value)) return false;
  const entries = Object.entries(value);
  return entries.length <= MAX_OBJECT_KEYS && entries.every(([key, item]) =>
    SAFE_KEY.test(key) && isSafePrimitive(item),
  );
}

function hasUniqueSafeIds(rows) {
  const ids = new Set();
  for (const row of rows) {
    if (!hasSafeObjectShape(row) || typeof row.id !== "string" || !SAFE_ID.test(row.id) || ids.has(row.id)) {
      return false;
    }
    ids.add(row.id);
  }
  return true;
}

function hasSafeSettings(settings) {
  if (!isPlainObject(settings) || Object.keys(settings).length > MAX_OBJECT_KEYS) return false;
  return Object.entries(settings).every(([key, value]) => {
    if (!SAFE_KEY.test(key)) return false;
    if (isSafePrimitive(value)) return true;
    return Array.isArray(value) &&
      value.length <= MAX_SETTINGS_ARRAY_ITEMS &&
      value.every((item) => typeof item === "string" && item.length <= 128);
  });
}

export function validateState(state) {
  if (!isPlainObject(state)) return { valid: false, error: "State must be an object." };
  if (!hasSafeSettings(state.settings)) return { valid: false, error: "Settings are invalid." };
  if (!Array.isArray(state.commissionMaster) || state.commissionMaster.length > MAX_COMMISSION_ROWS) {
    return { valid: false, error: "Commission data is invalid." };
  }
  if (!Array.isArray(state.products) || state.products.length > MAX_PRODUCTS) {
    return { valid: false, error: "Product data is invalid." };
  }
  if (!hasUniqueSafeIds(state.commissionMaster)) {
    return { valid: false, error: "Commission rows require unique, safe identifiers." };
  }
  if (!state.commissionMaster.every((row) =>
    typeof row.category === "string" &&
    row.category.trim().length > 0 &&
    row.category.length <= 200 &&
    Number.isFinite(row.commissionRate) &&
    row.commissionRate >= 0 &&
    row.commissionRate <= 1
  )) {
    return { valid: false, error: "Commission rows contain invalid values." };
  }
  if (!hasUniqueSafeIds(state.products)) {
    return { valid: false, error: "Products require unique, safe identifiers." };
  }
  return { valid: true, error: "" };
}
