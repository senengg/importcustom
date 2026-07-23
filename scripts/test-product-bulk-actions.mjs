import assert from "node:assert/strict";
import {
  getBulkDeleteWarning,
  getSelectedProducts,
  removeSelectedProducts,
} from "../src/product-bulk-actions.js";

const products = [
  { id: "one", productName: "Product One" },
  { id: "two", productName: "Product Two" },
  { id: "three", productName: "Product Three" },
];
const selectedIds = new Set(["one", "three"]);

assert.deepEqual(getSelectedProducts(products, selectedIds).map((product) => product.id), ["one", "three"]);
assert.deepEqual(removeSelectedProducts(products, selectedIds).map((product) => product.id), ["two"]);
assert.match(getBulkDeleteWarning(getSelectedProducts(products, selectedIds)), /Delete 2 selected products/);
assert.match(getBulkDeleteWarning(getSelectedProducts(products, selectedIds)), /cannot be undone/i);
assert.match(getBulkDeleteWarning(getSelectedProducts(products, selectedIds)), /every user/i);

console.log("Product bulk deletion verified.");
