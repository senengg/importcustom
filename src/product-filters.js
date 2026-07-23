export function normalizeFilterValue(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en-IN");
}

export function formatFilterLabel(value) {
  return normalizeFilterValue(value)
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toLocaleUpperCase("en-IN") + word.slice(1))
    .join(" ");
}

export function getUniqueFilterOptions(products, field) {
  const values = new Map();
  products.forEach((product) => {
    const value = normalizeFilterValue(product?.[field]);
    if (!value || values.has(value)) return;
    values.set(value, formatFilterLabel(value));
  });

  return [...values]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
}

export function matchesFilterValue(productValue, selectedValue) {
  return !selectedValue || normalizeFilterValue(productValue) === normalizeFilterValue(selectedValue);
}
