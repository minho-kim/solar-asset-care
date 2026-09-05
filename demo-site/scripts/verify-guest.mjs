// Read-only HTTP checks: no users, sessions, messages or records are created.
import assert from 'node:assert/strict';
const origin = process.env.SOLAR_GUEST_ORIGIN || 'http://localhost:3000';
assert.ok(
  [
    'http://localhost:3000',
    'https://solar-asset-care-demo.kimminho0914.chatgpt.site',
  ].includes(origin),
);
let checked = 0;
const queue = ['/guest'];
const seen = new Set();
while (queue.length) {
  const path = queue.shift();
  if (seen.has(path)) continue;
  seen.add(path);
  assert.ok(seen.size <= 40, 'Unexpected sample route expansion');
  const r = await fetch(origin + path, {
    redirect: 'error',
    signal: AbortSignal.timeout(20000),
  });
  assert.equal(r.status, 200, path);
  const html = await r.text();
  assert.match(html, /모든 내용은 샘플 자료입니다/);
  assert.match(html, /게스트 · 읽기 전용/);
  assert.match(html, /noindex/);
  assert.match(html, /<h1[^>]*>.+?<\/h1>/);
  assert.doesNotMatch(
    html,
    /<form\b|type="password"|sb_secret_|\/api\/reports\/|\/storage\/v1/,
  );
  for (const m of html.matchAll(/href="(\/guest(?:\?[^"#]*)?)"/g)) {
    const target = m[1].replaceAll('&amp;', '&');
    if (!seen.has(target)) queue.push(target);
  }
  checked++;
}
assert.equal(seen.size, 27, 'All role/section sample routes should be linked');
const malicious = await fetch(origin + '/guest?role=__proto__&section=members');
assert.match(
  await malicious.text(),
  /의뢰인<!-- --> 화면 예시|의뢰인 화면 예시/,
);
const live = await fetch(origin + '/');
assert.equal(live.status, 200);
// Some framework builds defer AuthPanel to the client; the bundle is also tested by source guards.
for (const path of [
  '/api/reports/11111111-1111-4111-8111-111111111111/pdf',
  '/api/report-images?id=11111111-1111-4111-8111-111111111111',
  '/api/recycling-certificates?id=11111111-1111-4111-8111-111111111111',
]) {
  const r = await fetch(origin + path, {
    headers: { 'X-Guest-Role': 'owner' },
  });
  assert.equal(
    r.status,
    401,
    'A guest role must never authenticate API access: ' + path,
  );
  checked++;
}
console.log(
  `PASS ${checked} guest pages/private API boundaries; no authentication or data writes performed.`,
);
