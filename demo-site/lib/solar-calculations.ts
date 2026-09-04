export type SolarCalculationSettings = {
  sunHours: number;
  degradationRatePercent: number;
  orientationFactor: number;
  selfUseTariff: number;
  smp: number;
  rec: number;
  recWeight: number;
  prNormal: number;
  prWarning: number;
  irradianceMinimum: number;
  windWarning: number;
  commissionRatePercent: number;
};

export const defaultSolarSettings: SolarCalculationSettings = {
  sunHours: 3.6,
  degradationRatePercent: 0.6,
  orientationFactor: 1,
  selfUseTariff: 165,
  smp: 125,
  rec: 72,
  recWeight: 1,
  prNormal: 0.85,
  prWarning: 0.7,
  irradianceMinimum: 600,
  windWarning: 7,
  commissionRatePercent: 3,
};

export type SolarCalculationInput = {
  capacityKwp: number;
  installationYear: number;
  actualGenerationKwh: number;
  operationType: 'self-use' | 'generation';
  repairCost: number;
  improvementRate: number;
  currentYear?: number;
};

export function calculateSolarPerformance(
  input: SolarCalculationInput,
  settings: SolarCalculationSettings,
) {
  const elapsedYears = Math.max(
    0,
    (input.currentYear ?? 2026) - input.installationYear,
  );
  const degradationFactor =
    (1 - settings.degradationRatePercent / 100) ** elapsedYears;
  const expectedGenerationKwh =
    Math.max(0, input.capacityKwp) *
    settings.sunHours *
    365 *
    degradationFactor *
    settings.orientationFactor;
  const actualGenerationKwh = Math.max(0, input.actualGenerationKwh);
  const performanceRatio =
    expectedGenerationKwh > 0 ? actualGenerationKwh / expectedGenerationKwh : 0;
  const lossKwh = Math.max(0, expectedGenerationKwh - actualGenerationKwh);
  const tariff =
    input.operationType === 'self-use'
      ? settings.selfUseTariff
      : settings.smp + settings.rec * settings.recWeight;
  const expectedRevenue = expectedGenerationKwh * tariff;
  const lossAmount = lossKwh * tariff;
  const recoverableAmount = lossAmount * Math.max(0, input.improvementRate);
  const paybackYears =
    recoverableAmount > 0
      ? Math.max(0, input.repairCost) / recoverableAmount
      : null;
  const prStatus =
    performanceRatio >= settings.prNormal
      ? '정상'
      : performanceRatio >= settings.prWarning
        ? '주의'
        : '점검 필요';

  return {
    elapsedYears,
    degradationFactor,
    expectedGenerationKwh,
    actualGenerationKwh,
    performanceRatio,
    lossKwh,
    tariff,
    expectedRevenue,
    lossAmount,
    recoverableAmount,
    paybackYears,
    prStatus,
  };
}

export function formatWon(value: number) {
  return `${Math.round(value).toLocaleString('ko-KR')}원`;
}

export function formatKwh(value: number) {
  return `${Math.round(value).toLocaleString('ko-KR')} kWh`;
}
