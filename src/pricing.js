export function calculateSellingPriceFromDeal(dealPriceInr, dealPriceRate) {
  const discountRate = Number(dealPriceRate);
  const listedPriceRate = 1 - discountRate;
  if (!Number.isFinite(discountRate) || discountRate < 0 || listedPriceRate <= 0) {
    return null;
  }

  const dealPrice = Number(dealPriceInr);
  const normalizedDealPrice = Number.isFinite(dealPrice) ? dealPrice : 0;
  return Math.round((normalizedDealPrice / listedPriceRate) * 100) / 100;
}
