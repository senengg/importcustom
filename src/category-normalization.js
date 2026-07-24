const canonicalCategoryNames = new Map([
  ["mobile accessory", "Mobile Accessories"],
]);

export function getCommissionCategoryKey(category) {
  return String(category || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\baccessories?\b/g, "accessory");
}

export function getCanonicalCategoryName(category) {
  const cleaned = String(category || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");
  return canonicalCategoryNames.get(getCommissionCategoryKey(cleaned)) || cleaned;
}

export function getCanonicalCategoryFromRows(category, rows = []) {
  const key = getCommissionCategoryKey(category);
  const match = rows.find((row) => getCommissionCategoryKey(row.category) === key);
  return match ? getCanonicalCategoryName(match.category) : getCanonicalCategoryName(category);
}
