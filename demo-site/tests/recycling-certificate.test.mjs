import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { PDFDocument, PDFName, PDFString } from 'pdf-lib';
import { testJpeg } from './fixtures/report-image.mjs';
const transpile = (path) =>
  ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
const moduleUrl = (code) =>
  `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const shared = moduleUrl(transpile('../lib/recycling-certificate.ts'));
const { validCertificateDate, certificateFilename } = await import(shared);
const code = transpile('../lib/server/certificate-file.ts')
  .replace(/from ['"]pdf-lib['"]/g, `from '${import.meta.resolve('pdf-lib')}'`)
  .replace(/from ['"]\.\.\/recycling-certificate['"]/g, `from '${shared}'`);
const { validateCertificateFile } = await import(moduleUrl(code));
test('certificate date rejects impossible, future and out-of-range dates', () => {
  assert.ok(validCertificateDate('2024-02-29', '2026-09-05'));
  for (const bad of [
    '2025-02-29',
    '2026-09-06',
    '1899-12-31',
    '2026-1-1',
    'no date',
  ])
    assert.equal(validCertificateDate(bad, '2026-09-05'), false);
});
test('certificate download names cannot inject a path or header', () => {
  assert.match(
    certificateFilename(
      '11111111-1111-4111-8111-111111111111',
      'application/pdf',
    ),
    /\.pdf$/,
  );
  assert.throws(() =>
    certificateFilename('../../unsafe\r\nHeader: value', 'application/pdf'),
  );
  assert.throws(() =>
    certificateFilename('11111111-1111-4111-8111-111111111111', 'text/html'),
  );
});
test('certificate format checks actual bytes and refuses missing/oversized content', async () => {
  assert.equal(await validateCertificateFile(testJpeg), 'image/jpeg');
  for (const bytes of [
    new Uint8Array(),
    new TextEncoder().encode('<script>not PDF</script>'),
    new Uint8Array(10000001),
    testJpeg.slice(0, -2),
  ])
    await assert.rejects(() => validateCertificateFile(bytes));
});
test('certificate PDFs retain original bytes and reject active content or broken files', async () => {
  const doc = await PDFDocument.create();
  doc.addPage();
  const bytes = await doc.save(),
    copy = bytes.slice();
  assert.equal(await validateCertificateFile(bytes), 'application/pdf');
  assert.deepEqual(bytes, copy);
  await assert.rejects(() =>
    validateCertificateFile(bytes.slice(0, bytes.length - 20)),
  );
  doc.catalog.set(
    PDFName.of('OpenAction'),
    doc.context.obj({
      S: PDFName.of('JavaScript'),
      JS: PDFString.of('alert(1)'),
    }),
  );
  await assert.rejects(
    () => doc.save().then(validateCertificateFile),
    /스크립트/,
  );
});
test('certificate PDF page limits are enforced', async () => {
  const doc = await PDFDocument.create();
  for (let n = 0; n < 101; n++) doc.addPage();
  await assert.rejects(() => doc.save().then(validateCertificateFile), /100쪽/);
});
