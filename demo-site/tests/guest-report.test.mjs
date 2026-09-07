import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import {
  createGuestReportPdf,
  guestReportFile,
  guestReportContent,
} from '../scripts/generate-guest-report.mjs';

test('public sample PDF is reproducible, A4, and explicitly not a real diagnosis', async () => {
  const bytes = await createGuestReportPdf();
  assert.deepEqual(
    Buffer.from(bytes),
    readFileSync(guestReportFile),
    'Regenerate the public PDF when its source changes',
  );
  const pdf = await PDFDocument.load(bytes);
  assert.match(pdf.getTitle(), /샘플 햇빛 1호/);
  assert.match(pdf.getSubject(), /실제 진단 아님/);
  assert.ok(pdf.getPageCount() >= 3 && pdf.getPageCount() <= 6);
  for (const page of pdf.getPages()) {
    assert.ok(Math.abs(page.getWidth() - 595.28) < 1);
    assert.ok(Math.abs(page.getHeight() - 841.89) < 1);
  }
});
test('sample calculation matches the guest summary and contains no production assets', () => {
  const c = guestReportContent;
  assert.ok(Math.abs(c.assessment.result.expectedGenerationKwh - 11000) < 0.01);
  assert.equal(c.assessment.result.actualGenerationKwh, 10000);
  assert.equal(c.assessment.result.periodDays, 31);
  assert.equal(c.findings.length, 2);
  assert.ok(
    c.findings.every((f) => f.temperature_max_c === null && !f.source_file_id),
  );
  assert.deepEqual(c.files, []);
  assert.doesNotMatch(
    JSON.stringify(c),
    /https?:|sb_secret_|@.*\.(com|kr)|[a-f0-9]{8}-[a-f0-9-]{27,}/i,
  );
});
test('guest report has public view and download links without changing private APIs', () => {
  const page = readFileSync(
    new URL('../app/guest/page.tsx', import.meta.url),
    'utf8',
  );
  assert.equal([...page.matchAll(/href=\{guestReportPdfPath\}/g)].length, 2);
  assert.match(page, /target="_blank"[\s\S]*?rel="noopener noreferrer"/);
  assert.match(page, /download="SolarScope-샘플-진단보고서.pdf"/);
  assert.match(page, /실제 크기\(100%\)/);
});
