const canonicalCategoryNames = new Map([
  ["mobile accessory", "Mobile Accessories"],
  ["mobile screen protector", "Mobile Screen Protector"],
  ["tablet screen protector", "Tablet Screen Protector"],
  ["watch screen protector", "Watch Screen Protector"],
]);

export function getCommissionCategoryKey(category) {
  return String(category || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\baccessories?\b/g, "accessory")
    .replace(/\bscreen protectors\b/g, "screen protector");
}

export function getCanonicalCategoryName(category) {
  const cleaned = String(category || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");
  return canonicalCategoryNames.get(getCommissionCategoryKey(cleaned))
    || cleaned.replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
}

export function getCanonicalCategoryFromRows(category, rows = []) {
  const key = getCommissionCategoryKey(category);
  const match = rows.find((row) => getCommissionCategoryKey(row.category) === key);
  return match ? getCanonicalCategoryName(match.category) : getCanonicalCategoryName(category);
}
