function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function calculateAmazonAmounts(price, product, landingCost, settings) {
  const gstRate = safeNumber(product.gstRate);
  const gstOnSellingPrice = price * (gstRate / (100 + gstRate));
  const waiverApplies =
    settings.amazonCommissionWaiverEnabled === true &&
    price > 0 &&
    price <= safeNumber(settings.amazonCommissionWaiverThresholdInr);
  const commissionRate = waiverApplies ? 0 : safeNumber(product.commissionRate);
  const settlement = (
    price -
    commissionRate * price -
    safeNumber(product.pickPackFeeInr) -
    safeNumber(product.weightHandlingFeeInr) -
    safeNumber(product.fixedClosingFeeInr) -
    (price - gstOnSellingPrice) * safeNumber(product.tdsTcsRate)
  );
  return {
    gstOnSellingPrice,
    settlement,
    profit: settlement - gstOnSellingPrice - landingCost,
  };
}

export function calculateCatalogProductMetrics(product, settings, dealPrice) {
  const domesticProduct = String(product.procurementType || "").trim().toLowerCase() === "india";
  const usdRate = safeNumber(settings.usdRate);
  const freightPerKgUsd = safeNumber(settings.freightPerKgUsd);
  const productCostUsd = domesticProduct ? 0 : safeNumber(product.productCostUsd);
  const productCostInr = domesticProduct
    ? safeNumber(product.productCostInr)
    : productCostUsd * usdRate;
  const freightUsd = domesticProduct ? 0 : freightPerKgUsd * safeNumber(product.weightKg);
  const insuranceUsd = domesticProduct
    ? 0
    : (productCostUsd + freightUsd) * (safeNumber(settings.insuranceRate) / 100);
  const customsBaseUsd = productCostUsd + freightUsd + insuranceUsd;
  const hasCooBenefit = String(product.cooBenefit || "").trim().toLowerCase() === "yes";
  const bcdRate = product.bcdRate ?? settings.bcdRate;
  const basicCustomDutyUsd = domesticProduct || hasCooBenefit
    ? 0
    : customsBaseUsd * (safeNumber(bcdRate) / 100);
  const swsUsd = domesticProduct
    ? 0
    : basicCustomDutyUsd * (safeNumber(settings.swsRate) / 100);
  const igstUsd = domesticProduct
    ? 0
    : (productCostUsd + freightUsd + insuranceUsd + basicCustomDutyUsd + swsUsd) *
      (safeNumber(product.gstRate) / 100);
  const importCostUsd = productCostUsd + freightUsd + insuranceUsd + basicCustomDutyUsd + swsUsd;
  const importCostInr = domesticProduct ? productCostInr : importCostUsd * usdRate;
  const landingCost = (
    importCostInr +
    importCostInr * (safeNumber(settings.warehouseRate) / 100) +
    safeNumber(product.overheadCostInr)
  );
  const amazon = calculateAmazonAmounts(
    safeNumber(product.amazonSellingPriceInr),
    product,
    landingCost,
    settings,
  );
  const deal = calculateAmazonAmounts(safeNumber(dealPrice), product, landingCost, settings);

  return {
    usdRate,
    freightPerKgUsd,
    freightInr: freightUsd * usdRate,
    insuranceInr: insuranceUsd * usdRate,
    basicCustomDutyInr: basicCustomDutyUsd * usdRate,
    swsInr: swsUsd * usdRate,
    igstInr: igstUsd * usdRate,
    importCostInr,
    landingCost,
    gstAmazon: amazon.gstOnSellingPrice,
    gstAmazonDeal: deal.gstOnSellingPrice,
    settlementAmazon: amazon.settlement,
    settlementAmazonDeal: deal.settlement,
    amazonProfit: amazon.profit,
    amazonDealProfit: deal.profit,
  };
}
