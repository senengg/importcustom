export function getSelectedProducts(products, selectedIds) {
  const ids = selectedIds instanceof Set ? selectedIds : new Set(selectedIds);
  return products.filter((product) => ids.has(product.id));
}

export function removeSelectedProducts(products, selectedIds) {
  const ids = selectedIds instanceof Set ? selectedIds : new Set(selectedIds);
  return products.filter((product) => !ids.has(product.id));
}

export function getBulkDeleteWarning(selectedProducts) {
  const count = selectedProducts.length;
  const names = selectedProducts
    .slice(0, 5)
    .map((product) => product.productName || product.sku || product.asin || "Unnamed product");
  const remainingCount = Math.max(0, count - names.length);
  const preview = names.length
    ? `\n\n${names.map((name) => `• ${name}`).join("\n")}${remainingCount ? `\n• and ${remainingCount} more` : ""}`
    : "";

  return `Delete ${count} selected product${count === 1 ? "" : "s"} from the shared workspace?${preview}\n\nThis cannot be undone and will remove the selected products for every user.`;
}
