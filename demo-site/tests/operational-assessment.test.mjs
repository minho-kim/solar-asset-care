import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const code = ts.transpileModule(
  readFileSync(
    new URL('../lib/operational-assessment.ts', import.meta.url),
    'utf8',
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const {
  calculateAssessment,
  captureWarnings,
  validateSettings,
  periodDays,
  koreanDate,
  parseKoreanInput,
  toKoreanInput,
} = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
);
const s = {
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
  angleMinimum: 10,
  angleMaximum: 80,
  distanceMaximum: 30,
  deltaTWarning: 5,
  deltaTCritical: 10,
  improvementRates: {
    soiling: 0.9,
    string: 0.95,
    inverter: 1,
    diode: 0.7,
    cell_pid: 0.4,
  },
};
const p = {
  periodStart: '2026-01-01',
  periodEnd: '2026-08-31',
  capacityKwp: 100,
  installationYear: 2020,
  actualGenerationKwh: 60000,
  operationType: 'generation',
  repairCost: 2000000,
  defectType: 'soiling',
  generationSource: 'test fixture',
};
test('period calculation uses identical inclusive dates and explicit installation year', () => {
  const r = calculateAssessment(p, s);
  assert.equal(r.periodDays, 243);
  assert.equal(r.expectedGenerationKwh, 100 * 3.6 * 243 * 0.994 ** 6);
  assert.equal(r.tariff, 197);
  assert.ok(
    Math.abs(r.paybackYears - 2000000 / ((r.recoverableAmount * 365) / 243)) <
      1e-10,
  );
});
test('zero loss and zero tariff do not produce infinite payback or negative loss', () => {
  const r = calculateAssessment({ ...p, actualGenerationKwh: 1000000 }, s);
  assert.equal(r.lossKwh, 0);
  assert.equal(r.paybackYears, null);
  assert.equal(
    calculateAssessment(
      { ...p, operationType: 'self-use' },
      { ...s, selfUseTariff: 0 },
    ).paybackYears,
    null,
  );
});
test('leap years, DST boundaries and invalid calendar dates are deterministic', () => {
  assert.equal(periodDays('2024-01-01', '2024-12-31'), 366);
  assert.equal(periodDays('2026-03-07', '2026-03-10'), 4);
  assert.throws(() => periodDays('2026-02-29', '2026-03-01'));
  assert.throws(() => periodDays('2026-03-02', '2026-03-01'));
  assert.equal(koreanDate(new Date('2026-09-04T15:30:00Z')), '2026-09-05');
  assert.equal(
    parseKoreanInput('2026-09-05T09:30'),
    '2026-09-05T00:30:00.000Z',
  );
  assert.equal(toKoreanInput('2026-09-05T00:30:00Z'), '2026-09-05T09:30');
  assert.throws(() => parseKoreanInput('2026-02-30T09:30'));
});
test('capture boundaries and all four warnings', () => {
  const c = {
    irradiance: 600,
    wind: 7,
    ambientTemperature: 25,
    angle: 10,
    distance: 30,
  };
  assert.deepEqual(captureWarnings(c, s), []);
  assert.equal(
    captureWarnings(
      { ...c, irradiance: 599, wind: 7.1, angle: 9, distance: 31 },
      s,
    ).length,
    4,
  );
});
test('bad settings and inputs are rejected instead of creating plausible results', () => {
  assert.throws(() => validateSettings({ ...s, prWarning: 0.9 }));
  assert.throws(() =>
    validateSettings({
      ...s,
      improvementRates: { ...s.improvementRates, soiling: 1.1 },
    }),
  );
  assert.throws(() =>
    calculateAssessment({ ...p, actualGenerationKwh: NaN }, s),
  );
  assert.throws(() => calculateAssessment({ ...p, installationYear: 2027 }, s));
  assert.throws(() => calculateAssessment({ ...p, generationSource: '' }, s));
  assert.throws(() =>
    calculateAssessment({ ...p, operationType: 'invalid' }, s),
  );
});
