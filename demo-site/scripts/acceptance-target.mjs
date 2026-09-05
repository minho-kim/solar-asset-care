import assert from 'node:assert/strict';

// Never send synthetic account tokens to an arbitrary caller-supplied host.
export function acceptanceTarget(env) {
  assert.equal(
    env.SOLAR_ACCEPTANCE_RUN,
    '1',
    'Acceptance tests require explicit opt-in.',
  );
  const origin = env.SOLAR_ACCEPTANCE_ORIGIN || 'http://localhost:3000';
  const local = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
  const hosted =
    origin === 'https://solar-asset-care-demo.kimminho0914.chatgpt.site';
  assert.ok(
    local || (hosted && env.SOLAR_ACCEPTANCE_DEPLOYED === '1'),
    'Only localhost or the explicitly opted-in existing Sites origin may be tested.',
  );
  assert.ok(
    local || env.SOLAR_UI_ACCEPTANCE !== '1',
    'Interactive fixture pauses are local-only.',
  );
  return origin;
}
