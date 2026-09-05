import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const model = readFileSync(
  new URL('../lib/guest-preview.ts', import.meta.url),
  'utf8',
);
const code = ts.transpileModule(model, {
  compilerOptions: { module: ts.ModuleKind.ESNext },
}).outputText;
const { resolveGuestView, guestSections, guestPlants, guestInspections } =
  await import(
    `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
  );
test('guest navigation defaults safely and rejects hostile/repeated parameters', () => {
  assert.equal(resolveGuestView().role, 'client');
  for (const role of [
    '__proto__',
    'constructor',
    '<script>',
    ['owner'],
    'guest',
  ]) {
    assert.equal(resolveGuestView(role, 'members').role, 'client');
    assert.equal(resolveGuestView(role, 'members').section, 'overview');
  }
  for (const section of ['../../admin', ['members'], '<script>']) {
    assert.equal(resolveGuestView('owner', section).section, 'overview');
  }
});
test('guest roles only select sample presentation menus', () => {
  assert.equal(resolveGuestView('owner', 'members').section, 'members');
  assert.equal(resolveGuestView('owner').sections.length, guestSections.length);
  assert.equal(resolveGuestView('client', 'files').section, 'overview');
  assert.equal(resolveGuestView('expert', 'members').section, 'overview');
  assert.equal(resolveGuestView('expert', 'findings').section, 'findings');
  for (const role of ['client', 'expert', 'owner'])
    for (const [section] of resolveGuestView(role).sections) {
      assert.equal(resolveGuestView(role, section).section, section);
    }
});
test('guest samples contain no production identifiers or personal accounts', () => {
  assert.ok(guestPlants.every((p) => p.name.startsWith('샘플 ')));
  assert.ok(
    guestInspections.every(
      (p) => p.id.startsWith('SAMPLE-') && p.expert.startsWith('샘플 '),
    ),
  );
  assert.doesNotMatch(
    model,
    /sb_secret_|@.*\.(com|kr)|[a-f0-9]{8}-[a-f0-9-]{27,}/i,
  );
});
test('guest entry is separate from login and cannot perform data mutations', () => {
  const page = readFileSync(
    new URL('../app/guest/page.tsx', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(
    page + model,
    /fetch\(|\/api\/|supabase|localStorage|sessionStorage|use server|onSubmit|<form|<input|<button|<Button\b/,
  );
  const imports = [...page.matchAll(/from ['"]([^'"]+)['"]/g)].map((m) => m[1]);
  assert.deepEqual(
    imports.filter((x) => x.startsWith('@/')),
    ['@/components/ui/button', '@/lib/guest-preview'],
  );
  assert.match(page, /모든 내용은 샘플 자료입니다/);
  const live = readFileSync(
    new URL('../components/live/live-app.tsx', import.meta.url),
    'utf8',
  );
  assert.match(live, /<Link[\s\S]*?href="\/guest"[\s\S]*?게스트로 둘러보기/);
  assert.doesNotMatch(
    live,
    /signInAnonymously|email === ['"]guest['"]|password === ['"]['"]/,
  );
});
