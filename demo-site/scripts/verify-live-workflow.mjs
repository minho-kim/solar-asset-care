// Explicit opt-in only. Creates isolated synthetic users/organizations, then removes them.
// Does not send email, alter existing users or deploy anything.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
if (process.env.SOLAR_ACCEPTANCE_RUN !== '1')
  throw new Error(
    'Set SOLAR_ACCEPTANCE_RUN=1 to run the isolated remote acceptance test.',
  );
const project = 'vzgmryqglptxowbdewkf';
const origin = process.env.SOLAR_ACCEPTANCE_ORIGIN || 'http://localhost:3000';
assert.ok(
  /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin),
  'Only a local site may be tested.',
);
const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => {
      const n = l.indexOf('=');
      return [l.slice(0, n), l.slice(n + 1).replace(/^['"]|['"]$/g, '')];
    }),
);
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, `https://${project}.supabase.co`);
const keys = JSON.parse(
  execFileSync(
    'npx',
    [
      '--no-install',
      'supabase',
      'projects',
      'api-keys',
      '--project-ref',
      project,
      '--reveal',
      '--output',
      'json',
    ],
    { encoding: 'utf8', maxBuffer: 1048576 },
  ),
);
const secret = keys.find((k) => k.api_key?.startsWith('sb_secret_'))?.api_key;
assert.ok(secret, 'A modern secret key is required in CLI memory.');
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, secret, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const users = [];
const organizations = [];
const paths = [];
const artifacts = [];
let reportId;
let checks = 0;
let failure;
const cleanupErrors = [];
const digest = (b) => createHash('sha256').update(b).digest('hex');
function check(value, description) {
  assert.ok(value, description);
  checks++;
  console.log(`PASS ${description}`);
}
async function required(p) {
  const r = await p;
  if (r.error) throw new Error(r.error.message);
  return r.data;
}
async function user() {
  const password = `T-${randomUUID()}-9a!`;
  const email = `acceptance-${randomUUID()}@example.invalid`;
  const data = await required(
    admin.auth.admin.createUser({ email, password, email_confirm: true }),
  );
  const client = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    options,
  );
  const entry = { id: data.user.id, client, token: null };
  users.push(entry);
  const signed = await required(
    client.auth.signInWithPassword({ email, password }),
  );
  entry.token = signed.session.access_token;
  return entry;
}
async function org(owner) {
  const row = await required(
    admin
      .from('organizations')
      .insert({
        name: '삭제예정 수용시험',
        slug: `acceptance-${randomUUID()}`,
        is_primary_operator: false,
      })
      .select('*')
      .single(),
  );
  organizations.push(row.id);
  await required(
    admin
      .from('organization_members')
      .insert({
        organization_id: row.id,
        user_id: owner.id,
        role: 'owner',
        status: 'active',
      }),
  );
  return row;
}
async function api(actor, method = 'GET') {
  return fetch(`${origin}/api/reports/${reportId}/pdf`, {
    method,
    headers: actor ? { Authorization: `Bearer ${actor.token}` } : {},
    signal: AbortSignal.timeout(60000),
  });
}
try {
  const owner = await user(),
    expert = await user(),
    client = await user(),
    otherClient = await user(),
    otherOwner = await user();
  const organization = await org(owner);
  await org(otherOwner);
  await required(
    admin.from('organization_members').insert([
      {
        organization_id: organization.id,
        user_id: expert.id,
        role: 'expert',
        status: 'active',
      },
      {
        organization_id: organization.id,
        user_id: client.id,
        role: 'client',
        status: 'active',
      },
      {
        organization_id: organization.id,
        user_id: otherClient.id,
        role: 'client',
        status: 'active',
      },
    ]),
  );
  const plant = await required(
    owner.client
      .from('plants')
      .insert({
        organization_id: organization.id,
        name: '가상 한글 발전소',
        capacity_kw: 100,
        commissioned_on: '2020-01-01',
        address: '수용시험용 가상 주소',
      })
      .select('*')
      .single(),
  );
  await required(
    admin
      .from('plant_requesters')
      .insert({ plant_id: plant.id, requester_user_id: client.id }),
  );
  const inspection = await required(
    owner.client
      .from('inspections')
      .insert({
        organization_id: organization.id,
        plant_id: plant.id,
        inspection_code: `TEST-${randomUUID().slice(0, 8)}`,
        status: 'quality_review',
        assigned_expert_user_id: expert.id,
        created_by: owner.id,
        purpose: '실제 고객 자료가 아닌 합성 자료 수용시험',
        notes: '가상 입력 자료로 계산과 권한·문서 보관만 확인합니다.',
      })
      .select('*')
      .single(),
  );
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=',
    'base64',
  );
  const path = `${organization.id}/${inspection.id}/${randomUUID()}.png`;
  await required(
    expert.client.storage
      .from('inspection-originals')
      .upload(path, png, { contentType: 'image/png', upsert: false }),
  );
  paths.push({ bucket: 'inspection-originals', path });
  const file = await required(
    expert.client
      .from('inspection_files')
      .insert({
        organization_id: organization.id,
        inspection_id: inspection.id,
        kind: 'thermal_original',
        storage_bucket: 'inspection-originals',
        storage_path: path,
        original_name: '합성-시험.png',
        mime_type: 'image/png',
        bytes: png.length,
        sha256: digest(png),
        created_by: expert.id,
      })
      .select('*')
      .single(),
  );
  const downloaded = await required(
    expert.client.storage.from('inspection-originals').download(path),
  );
  check(
    digest(Buffer.from(await downloaded.arrayBuffer())) === digest(png),
    'original upload and byte integrity',
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
  const setting = await required(
    owner.client.rpc('save_calculation_settings', {
      p_organization_id: organization.id,
      p_effective_from: '2020-01-01',
      p_values: s,
      p_reason: '삭제예정 수용시험 기준. 운영 단가 아님.',
    }),
  );
  const assessment = await required(
    expert.client.rpc('save_inspection_assessment', {
      p_inspection_id: inspection.id,
      p_settings_id: setting.id,
      p_capture: {
        measuredAt: new Date(Date.now() - 3600000).toISOString(),
        source: '합성 시험 기록',
        irradiance: 600,
        wind: 3,
        ambientTemperature: 25,
        angle: 45,
        distance: 20,
      },
      p_input: {
        periodStart: '2026-01-01',
        periodEnd: '2026-08-31',
        actualGenerationKwh: 60000,
        operationType: 'generation',
        repairCost: 2000000,
        defectType: 'soiling',
        generationSource: '합성 발전량 기록',
      },
      p_exception_reason: '',
      p_expected_revision: 0,
    }),
  );
  check(
    assessment.result.periodDays === 243 &&
      Math.abs(
        assessment.result.expectedGenerationKwh - 100 * 3.6 * 243 * 0.994 ** 6,
      ) < 0.00001,
    'expert assessment computed by database',
  );
  const finding = await required(
    expert.client
      .from('findings')
      .insert({
        organization_id: organization.id,
        inspection_id: inspection.id,
        source: 'expert_manual',
        source_file_id: file.id,
        kind: 'hotspot',
        defect_type: 'cell_hotspot',
        location_label: 'A열 01번',
        severity: 'major',
        disposition: 'accepted',
        temperature_max_c: 70,
        temperature_delta_c: 12,
        measurement_source: '합성 계측값 - 실제 온도 진단 아님',
        expert_note: '수용시험 소견. 현장 자료를 사용하지 않았습니다.',
        region: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
      })
      .select('*')
      .single(),
  );
  const report = await required(
    expert.client.rpc('create_report_draft', {
      p_inspection_id: inspection.id,
      p_title: '가상 발전소 진단 수용시험 보고서',
    }),
  );
  reportId = report.id;
  await required(
    expert.client.rpc('transition_report_status', {
      p_report_id: reportId,
      p_next_status: 'review',
    }),
  );
  check(
    Boolean(
      (
        await expert.client.rpc('transition_report_status', {
          p_report_id: reportId,
          p_next_status: 'approved',
        })
      ).error,
    ),
    'expert cannot approve',
  );
  await required(
    owner.client.rpc('transition_report_status', {
      p_report_id: reportId,
      p_next_status: 'approved',
    }),
  );
  check(
    (await api(client)).status === 404,
    'requester cannot read unissued PDF',
  );
  const snapshot = await required(
    owner.client
      .from('report_snapshots')
      .select('*')
      .eq('report_id', reportId)
      .single(),
  );
  const pdfPath = `${organization.id}/${inspection.id}/${reportId}/${snapshot.sha256}.pdf`;
  paths.push({ bucket: 'reports', path: pdfPath });
  const prepared = await api(owner, 'POST');
  if (!prepared.ok)
    throw new Error(
      `PDF preparation failed: ${prepared.status} ${await prepared.text()}`,
    );
  check(
    (await prepared.json()).archived === true,
    'server PDF generated and archived',
  );
  const again = await api(owner, 'POST');
  check(again.ok, 'PDF preparation is idempotent');
  await required(
    owner.client.rpc('transition_report_status', {
      p_report_id: reportId,
      p_next_status: 'published',
    }),
  );
  const result = await api(client);
  check(
    result.ok && result.headers.get('content-type') === 'application/pdf',
    'requester downloads issued PDF',
  );
  const pdf = Buffer.from(await result.arrayBuffer());
  check(
    pdf.subarray(0, 5).toString() === '%PDF-',
    'download contains actual PDF bytes',
  );
  const manifest = await required(
    client.client
      .from('report_documents')
      .select('*')
      .eq('report_id', reportId)
      .single(),
  );
  check(
    digest(pdf) === manifest.pdf_sha256,
    'download matches archived checksum',
  );
  for (const blocked of [otherClient, otherOwner])
    check(
      (await api(blocked)).status === 404,
      'other requester / organization cannot download',
    );
  check((await api(null)).status === 401, 'anonymous PDF access denied');
  const overwrite = await owner.client.storage
    .from('reports')
    .upload(pdfPath, pdf, { contentType: 'application/pdf', upsert: true });
  check(Boolean(overwrite.error), 'archived PDF overwrite blocked');
  await required(
    owner.client
      .from('plants')
      .update({ name: '발행 후 이름 수정' })
      .eq('id', plant.id),
  );
  await required(
    expert.client
      .from('findings')
      .update({
        expert_note: '발행 후 메모 수정',
        disposition: 'modified',
        reviewed_by: expert.id,
      })
      .eq('id', finding.id),
  );
  const frozen = await required(
    client.client
      .from('report_snapshots')
      .select('*')
      .eq('report_id', reportId)
      .single(),
  );
  check(
    frozen.sha256 === snapshot.sha256 &&
      frozen.content.plant.name === '가상 한글 발전소',
    'published content remains frozen',
  );
  const second = await api(client);
  check(
    digest(Buffer.from(await second.arrayBuffer())) === digest(pdf),
    'download does not regenerate from changed source',
  );
  mkdirSync(new URL('../work/acceptance/', import.meta.url), {
    recursive: true,
  });
  const artifact = new URL('../work/acceptance/report.pdf', import.meta.url);
  writeFileSync(artifact, pdf);
  artifacts.push(fileURLToPath(artifact));
  writeFileSync(
    new URL('../work/acceptance/report-fixture.json', import.meta.url),
    JSON.stringify({ report, snapshot }, null, 2),
  );
  await required(
    owner.client.rpc('transition_report_status', {
      p_report_id: reportId,
      p_next_status: 'withdrawn',
      p_reason: '수용시험 종료',
    }),
  );
  check(
    (await api(client)).status === 404,
    'withdrawal immediately removes requester access',
  );
} catch (error) {
  failure = error;
  console.error(`Acceptance failure: ${error.message}`);
} finally {
  for (const object of paths) {
    const r = await admin.storage.from(object.bucket).remove([object.path]);
    if (r.error) cleanupErrors.push(`storage: ${r.error.message}`);
  }
  if (reportId) {
    for (const table of ['report_documents', 'report_snapshots']) {
      const r = await admin.from(table).delete().eq('report_id', reportId);
      if (r.error) cleanupErrors.push(`${table}: ${r.error.message}`);
    }
  }
  for (const organizationId of organizations) {
    for (const table of [
      'reports',
      'findings',
      'analysis_runs',
      'inspection_assessments',
      'inspection_files',
      'maintenance_requests',
      'inspections',
    ]) {
      const r = await admin
        .from(table)
        .delete()
        .eq('organization_id', organizationId);
      if (r.error) cleanupErrors.push(`${table}: ${r.error.message}`);
    }
    const plants = await required(
      admin.from('plants').select('id').eq('organization_id', organizationId),
    );
    for (const p of plants) {
      const r = await admin
        .from('plant_requesters')
        .delete()
        .eq('plant_id', p.id);
      if (r.error) cleanupErrors.push(`access: ${r.error.message}`);
    }
    for (const table of ['plants', 'calculation_settings', 'audit_events']) {
      const r = await admin
        .from(table)
        .delete()
        .eq('organization_id', organizationId);
      if (r.error) cleanupErrors.push(`${table}: ${r.error.message}`);
    }
    const r = await admin
      .from('organizations')
      .delete()
      .eq('id', organizationId);
    if (r.error) cleanupErrors.push(`organization: ${r.error.message}`);
  }
  for (const u of users) {
    await u.client.auth.signOut({ scope: 'global' });
    const r = await admin.auth.admin.deleteUser(u.id);
    if (r.error) cleanupErrors.push(`user: ${r.error.message}`);
  }
  if (!cleanupErrors.length)
    console.log(
      `Removed ${users.length} synthetic users and ${organizations.length} test organizations.`,
    );
}
if (cleanupErrors.length)
  throw new Error(`Test cleanup incomplete: ${cleanupErrors.join('; ')}`);
if (failure) throw failure;
console.log(JSON.stringify({ passed: checks, artifacts }, null, 2));
