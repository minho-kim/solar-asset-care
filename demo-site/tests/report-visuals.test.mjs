import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { testJpeg } from './fixtures/report-image.mjs';
const source = ts.transpileModule(
  readFileSync(new URL('../lib/report-visuals.ts', import.meta.url), 'utf8'),
  {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const { cleanReportJpeg, validRect, reportBars } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
);
test('JPEG export strips APP/COM and trailing bytes, preserves dimensions and is idempotent', () => {
  const metadata = Buffer.from([
    255, 225, 0, 10, 69, 120, 105, 102, 0, 0, 0, 0,
  ]);
  const input = Buffer.concat([
    testJpeg.subarray(0, 2),
    metadata,
    testJpeg.subarray(2),
    Buffer.from('private trailing data'),
  ]);
  const clean = cleanReportJpeg(input);
  assert.equal(clean.width, 320);
  assert.equal(clean.height, 180);
  assert.ok(clean.bytes.length < testJpeg.length);
  assert.deepEqual(cleanReportJpeg(clean.bytes), clean);
  assert.equal(Buffer.from(clean.bytes).includes(Buffer.from('Exif')), false);
});
test('JPEG export rejects unsupported/truncated/oversized content and excessive dimensions', () => {
  for (const invalid of [
    Buffer.from('<svg/>'),
    testJpeg.subarray(0, 80),
    testJpeg.subarray(0, -2),
    Buffer.alloc(1200001),
  ])
    assert.throws(() => cleanReportJpeg(invalid));
  const huge = Buffer.from(testJpeg);
  const index = huge.indexOf(Buffer.from([255, 192]));
  huge[index + 7] = 255;
  huge[index + 8] = 255;
  assert.throws(() => cleanReportJpeg(huge));
});
test('mask coordinates reject negative, overflowing, zero-sized and non-finite regions', () => {
  assert.ok(validRect({ x: 0, y: 0.5, width: 1, height: 0.5 }));
  for (const r of [
    null,
    {},
    { x: -0.1, y: 0, width: 1, height: 1 },
    { x: 0.9, y: 0, width: 0.2, height: 1 },
    { x: 0, y: 0, width: 0, height: 1 },
    { x: NaN, y: 0, width: 1, height: 1 },
  ])
    assert.equal(validRect(r), false);
});
test('economic chart uses the same period snapshot amounts without annualizing or clipping actual revenue', () => {
  const bars = reportBars({
    currentRevenue: 120,
    recoverableAmount: 10,
    expectedRevenue: 100,
  });
  assert.deepEqual(
    bars.map((b) => b.value),
    [120, 130, 100],
  );
  assert.equal(bars[1].ratio, 1);
  assert.ok(
    reportBars({
      currentRevenue: 0,
      recoverableAmount: 0,
      expectedRevenue: 0,
    }).every((b) => b.ratio === 0),
  );
  assert.throws(() =>
    reportBars({
      currentRevenue: -1,
      recoverableAmount: 0,
      expectedRevenue: 0,
    }),
  );
});
