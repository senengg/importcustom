import assert from "node:assert/strict";
import {
  formatFilterLabel,
  getUniqueFilterOptions,
  matchesFilterValue,
  normalizeFilterValue,
} from "../src/product-filters.js";

const products = [
  { category: "mobile accessories" },
  { category: "Mobile Accessories" },
  { category: "  MOBILE   ACCESSORIES " },
  { category: "phone cases" },
];

assert.equal(normalizeFilterValue("  MOBILE   Accessories "), "mobile accessories");
assert.equal(formatFilterLabel("mOBILE aCCESSORIES"), "Mobile Accessories");
assert.deepEqual(getUniqueFilterOptions(products, "category"), [
  { value: "mobile accessories", label: "Mobile Accessories" },
  { value: "phone cases", label: "Phone Cases" },
]);
assert.equal(matchesFilterValue("MOBILE ACCESSORIES", "mobile accessories"), true);
assert.equal(matchesFilterValue("Phone Cases", "mobile accessories"), false);

console.log("Product filter normalization verified.");
