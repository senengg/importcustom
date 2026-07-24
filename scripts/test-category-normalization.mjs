import assert from "node:assert/strict";
import {
  getCanonicalCategoryFromRows,
  getCanonicalCategoryName,
  getCommissionCategoryKey,
} from "../src/category-normalization.js";

const mobileAccessoryVariants = [
  "Mobile Accessories",
  "mobile accessories",
  "Mobile accessories",
  "mobile Accessories",
  "mobile accessorie",
];

mobileAccessoryVariants.forEach((category) => {
  assert.equal(getCommissionCategoryKey(category), "mobile accessory");
  assert.equal(getCanonicalCategoryName(category), "Mobile Accessories");
});

assert.equal(
  getCanonicalCategoryFromRows("mobile accessorie", [
    { category: "Mobile Accessories", commissionRate: 0.105 },
  ]),
  "Mobile Accessories",
);
assert.equal(getCanonicalCategoryName("  Camera   Lens Protector "), "Camera Lens Protector");

console.log("Category normalization verified.");
