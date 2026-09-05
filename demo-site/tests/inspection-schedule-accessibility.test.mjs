import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const text = readFileSync(
  new URL('../components/live/live-app.tsx', import.meta.url),
  'utf8',
);
const source = ts.createSourceFile(
  'live-app.tsx',
  text,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const inspection = source.statements.find(
  (node) =>
    ts.isFunctionDeclaration(node) && node.name?.text === 'InspectionsView',
);
assert.ok(inspection);
const fields = new Map();
function visit(node) {
  if (
    ts.isPropertyAssignment(node) &&
    ['status', 'scheduled_at', 'due_at', 'capture_timezone'].includes(
      node.name.getText(source),
    )
  ) {
    fields.set(node.name.getText(source), node.initializer.getText(source));
  }
  ts.forEachChild(node, visit);
}
visit(inspection);
assert.equal(fields.size, 4);

// Execute the actual form's storage expressions, not a duplicate implementation.
const helper = ts.transpileModule(
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
const moduleUrl = `data:text/javascript;base64,${Buffer.from(`${helper}
export function scheduleForTest(scheduledAt, dueAt) {
  return {${Array.from(fields, ([key, value]) => `${key}: ${value}`).join(',')}};
}`).toString('base64')}`;
const { scheduleForTest, parseKoreanInput } = await import(moduleUrl);

for (const zone of ['Asia/Seoul', 'UTC', 'America/Los_Angeles']) {
  test(`inspection storage remains Korean time in ${zone}`, () => {
    const output = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
      const {scheduleForTest, koreanDate} = await import(${JSON.stringify(moduleUrl)});
      console.log(JSON.stringify({
        regular: scheduleForTest('2026-09-05T13:30', '2026-09-06T15:00'),
        midnight: scheduleForTest('2026-01-01T00:00', '2026-01-01T00:01'),
        dstBoundary: scheduleForTest('2026-03-08T02:30', '2026-11-01T01:30'),
        codeDate: koreanDate(new Date('2026-09-04T15:30:00Z'))
      }));
    `,
      ],
      { env: { ...process.env, TZ: zone }, encoding: 'utf8' },
    );
    const data = JSON.parse(output);
    assert.deepEqual(data.regular, {
      status: 'scheduled',
      scheduled_at: '2026-09-05T04:30:00.000Z',
      due_at: '2026-09-06T06:00:00.000Z',
      capture_timezone: 'Asia/Seoul',
    });
    assert.equal(data.midnight.scheduled_at, '2025-12-31T15:00:00.000Z');
    assert.equal(data.midnight.due_at, '2025-12-31T15:01:00.000Z');
    assert.equal(data.dstBoundary.scheduled_at, '2026-03-07T17:30:00.000Z');
    assert.equal(data.dstBoundary.due_at, '2026-10-31T16:30:00.000Z');
    assert.equal(data.codeDate, '2026-09-05');
  });
}

test('omitted schedules stay null and validation identifies the correct field', () => {
  assert.deepEqual(scheduleForTest('', ''), {
    status: 'requested',
    scheduled_at: null,
    due_at: null,
    capture_timezone: 'Asia/Seoul',
  });
  assert.equal(scheduleForTest('', '2026-09-06T15:00').status, 'requested');
  assert.throws(() => scheduleForTest('2026-02-30T13:30', ''), /예정 일시/);
  assert.throws(() => scheduleForTest('', '2026-13-01T13:30'), /완료 목표/);
  assert.throws(() => parseKoreanInput('2026-09-05T25:00'), /촬영 시각/);
  assert.throws(() => parseKoreanInput('bad', '완료 목표'), /완료 목표/);
});

test('inspection default code uses the Korean calendar date', () => {
  const init = inspection
    .getText(source)
    .match(/const \[code, setCode\] = useState\(([\s\S]*?)\);/);
  assert.ok(init);
  assert.match(init[1], /koreanDate\(\)/);
  assert.doesNotMatch(init[1], /toISOString/);
});

test('mobile header refresh and logout keep explicit accessible names', () => {
  const labels = [];
  function check(node) {
    if (
      ts.isJsxElement(node) &&
      node.openingElement.tagName.getText(source) === 'Button'
    ) {
      const hiddenLabel = node.children.find(
        (child) =>
          ts.isJsxElement(child) &&
          child.openingElement.tagName.getText(source) === 'span' &&
          child.getText(source).includes('hidden md:inline'),
      );
      if (hiddenLabel) {
        const label = hiddenLabel.children
          .filter(ts.isJsxText)
          .map((n) => n.text.trim())
          .join('');
        const attr = node.openingElement.attributes.properties.find(
          (p) =>
            ts.isJsxAttribute(p) && p.name.getText(source) === 'aria-label',
        );
        assert.ok(attr?.initializer && ts.isStringLiteral(attr.initializer));
        assert.equal(attr.initializer.text, label);
        labels.push(label);
      }
    }
    ts.forEachChild(node, check);
  }
  check(source);
  assert.deepEqual(labels, ['새로고침', '로그아웃']);
});
