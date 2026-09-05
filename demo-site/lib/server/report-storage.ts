import { createClient } from '@supabase/supabase-js';

/** Server-only byte access AFTER the caller has verified getUser + report/snapshot
 * visibility with the user's RLS client. Never use this client to authorize users. */
export async function downloadReportAsset(
  bucket: 'reports' | 'report-images',
  path: string,
  expectedBytes: number,
) {
  if (typeof window !== 'undefined')
    throw new Error('서버에서만 파일을 읽을 수 있습니다.');
  const keyMap = JSON.parse(process.env.SUPABASE_SECRET_KEYS || '{}') as Record<
    string,
    string
  >;
  const secret = keyMap.default;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || !secret?.startsWith('sb_secret_'))
    throw new Error(
      '보고서 파일 전달 설정이 필요합니다. 관리자에게 문의해 주세요.',
    );
  const max = bucket === 'reports' ? 20000000 : 1200000;
  if (
    !/^[a-f0-9/-]+\.(pdf|jpg)$/.test(path) ||
    !Number.isInteger(expectedBytes) ||
    expectedBytes < 1 ||
    expectedBytes > max
  )
    throw new Error('보관 파일 경로·크기를 확인해 주세요.');
  const storage = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).storage;
  // The provider caches authenticated object responses per user. A fresh nonce
  // avoids stale internal reads; customers never receive this URL or credential.
  const { data, error } = await storage
    .from(bucket)
    .download(
      path,
      { cacheNonce: crypto.randomUUID() },
      { cache: 'no-store', signal: AbortSignal.timeout(20000) },
    );
  if (error || !data || data.size !== expectedBytes)
    throw new Error('보관 파일을 불러오지 못했습니다.');
  return new Uint8Array(await data.arrayBuffer());
}
