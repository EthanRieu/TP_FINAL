const RATE = 0.08;

export const commissionService = {
  calculate(finalPrice: number): number {
    return Math.round(finalPrice * RATE * 100) / 100;
  },
};
