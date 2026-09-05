/** Framework/provider-independent inputs. The database recomputes the authoritative result. */
export const improvementLabels = {
  soiling: '표면 오염·음영',
  string: '스트링 단선',
  inverter: '인버터 고장',
  diode: '바이패스 다이오드',
  cell_pid: '셀 균열·PID',
} as const;

export const settingFields = [
  ['sunHours', '일평균 발전시간 (h)', 0.01, 24, 3.6],
  ['degradationRatePercent', '연간 열화율 (%)', 0, 20, 0.6],
  ['orientationFactor', '방위·경사 보정계수', 0.01, 2, 1],
  ['selfUseTariff', '자가소비 절감단가 (원/kWh)', 0, 10000, ''],
  ['smp', 'SMP (원/kWh)', 0, 10000, ''],
  ['rec', 'REC 환산단가 (원/kWh)', 0, 10000, ''],
  ['recWeight', 'REC 가중치', 0, 10, 1],
  ['prNormal', '성능비 정상 하한', 0.01, 2, 0.85],
  ['prWarning', '성능비 주의 하한', 0, 2, 0.7],
  ['irradianceMinimum', '최소 일사량 (W/m²)', 1, 2000, 600],
  ['windWarning', '최대 풍속 (m/s)', 0, 100, ''],
  ['angleMinimum', '최소 촬영각도 (°·패널면 기준)', 0, 90, ''],
  ['angleMaximum', '최대 촬영각도 (°·패널면 기준)', 0, 90, ''],
  ['distanceMaximum', '최대 촬영거리 (m)', 0.01, 1000, ''],
  ['deltaTWarning', '온도차 주의 기준 (℃)', 0, 500, ''],
  ['deltaTCritical', '온도차 긴급 기준 (℃)', 0, 500, ''],
] as const;
export type Settings = Record<(typeof settingFields)[number][0], number> & {
  improvementRates: Record<keyof typeof improvementLabels, number>;
};
export type CalculationInput = {
  periodStart: string;
  periodEnd: string;
  capacityKwp: number;
  installationYear: number;
  actualGenerationKwh: number;
  operationType: 'self-use' | 'generation';
  repairCost: number;
  defectType: keyof typeof improvementLabels;
  generationSource: string;
};
export type Capture = {
  measuredAt: string;
  source: string;
  irradiance: number;
  wind: number;
  ambientTemperature: number;
  angle: number;
  distance: number;
};
export type AssessmentResult = ReturnType<typeof calculateAssessment>;

export function koreanDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
export function toKoreanInput(iso: string) {
  return new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 16);
}
export function parseKoreanInput(local: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local))
    throw new Error('촬영 시각을 입력해 주세요.');
  const iso = new Date(`${local}:00+09:00`).toISOString();
  if (toKoreanInput(iso) !== local)
    throw new Error('올바른 촬영 시각을 입력해 주세요.');
  return iso;
}
function finite(n: number, min: number, max: number, label: string) {
  if (!Number.isFinite(n) || n < min || n > max)
    throw new Error(`${label}의 범위를 확인해 주세요.`);
  return n;
}
export function validateSettings(s: Settings) {
  for (const [key, label, min, max] of settingFields)
    finite(s[key], min, max, label);
  for (const key of Object.keys(
    improvementLabels,
  ) as (keyof typeof improvementLabels)[]) {
    finite(s.improvementRates?.[key], 0, 1, improvementLabels[key]);
  }
  if (
    s.prWarning >= s.prNormal ||
    s.angleMinimum >= s.angleMaximum ||
    s.deltaTWarning >= s.deltaTCritical
  ) {
    throw new Error('성능비·촬영각도·온도차의 하한은 상한보다 작아야 합니다.');
  }
}
export function periodDays(start: string, end: string) {
  for (const value of [start, end]) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString().slice(0, 10) !== value
    ) {
      throw new Error('분석기간을 확인해 주세요.');
    }
  }
  return finite(
    (Date.parse(end) - Date.parse(start)) / 86400000 + 1,
    1,
    3660,
    '분석기간',
  );
}
export function calculateAssessment(input: CalculationInput, s: Settings) {
  validateSettings(s);
  const days = periodDays(input.periodStart, input.periodEnd);
  finite(input.capacityKwp, 0.001, 1000000, '설비용량');
  finite(input.actualGenerationKwh, 0, 100000000000, '실발전량');
  finite(input.repairCost, 0, 1000000000000, '예상 수리비');
  finite(
    input.installationYear,
    1900,
    Number(input.periodEnd.slice(0, 4)),
    '설치연도',
  );
  if (
    !Number.isInteger(input.installationYear) ||
    !input.generationSource.trim() ||
    input.generationSource.length > 1000
  )
    throw new Error('설치연도와 발전량 출처를 확인해 주세요.');
  if (
    !['self-use', 'generation'].includes(input.operationType) ||
    !Object.hasOwn(improvementLabels, input.defectType)
  )
    throw new Error('운영형태와 개선 대상을 선택해 주세요.');
  const elapsedYears =
    Number(input.periodEnd.slice(0, 4)) - input.installationYear;
  const expectedGenerationKwh =
    input.capacityKwp *
    s.sunHours *
    days *
    (1 - s.degradationRatePercent / 100) ** elapsedYears *
    s.orientationFactor;
  const tariff =
    input.operationType === 'self-use'
      ? s.selfUseTariff
      : s.smp + s.rec * s.recWeight;
  const performanceRatio = input.actualGenerationKwh / expectedGenerationKwh;
  const lossKwh = Math.max(
    0,
    expectedGenerationKwh - input.actualGenerationKwh,
  );
  const lossAmount = lossKwh * tariff;
  const improvementRate = s.improvementRates[input.defectType];
  const recoverableAmount = lossAmount * improvementRate;
  const annualRecoverableAmount = (recoverableAmount * 365) / days;
  return {
    engineVersion: 'period-estimate-v1',
    periodDays: days,
    elapsedYears,
    expectedGenerationKwh,
    actualGenerationKwh: input.actualGenerationKwh,
    performanceRatio,
    lossKwh,
    tariff,
    expectedRevenue: expectedGenerationKwh * tariff,
    currentRevenue: input.actualGenerationKwh * tariff,
    lossAmount,
    improvementRate,
    recoverableAmount,
    annualRecoverableAmount,
    paybackYears:
      annualRecoverableAmount > 0
        ? input.repairCost / annualRecoverableAmount
        : null,
    prStatus:
      performanceRatio >= s.prNormal
        ? '정상'
        : performanceRatio >= s.prWarning
          ? '주의'
          : '점검 필요',
  };
}
export function captureWarnings(c: Capture, s: Settings) {
  finite(c.irradiance, 0, 2000, '일사량');
  finite(c.wind, 0, 100, '풍속');
  finite(c.ambientTemperature, -80, 80, '외기온');
  finite(c.angle, 0, 90, '촬영각도');
  finite(c.distance, 0.01, 1000, '촬영거리');
  return [
    c.irradiance < s.irradianceMinimum && '일사량 기준 미달',
    c.wind > s.windWarning && '풍속 기준 초과',
    (c.angle < s.angleMinimum || c.angle > s.angleMaximum) &&
      '촬영각도 기준 이탈',
    c.distance > s.distanceMaximum && '촬영거리 기준 초과',
  ].filter(Boolean) as string[];
}
