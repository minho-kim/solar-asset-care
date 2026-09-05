import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export const privateHeaders = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
};
export async function requestClient(request: Request) {
  const token = request.headers.get('authorization');
  if (!token?.startsWith('Bearer ')) throw new Error('로그인이 필요합니다.');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key?.startsWith('sb_publishable_'))
    throw new Error('서비스 연결 설정을 확인해 주세요.');
  const client = createClient<Database>(url, key, {
    global: { headers: { Authorization: token } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(token.slice(7));
  if (error || !data.user) throw new Error('다시 로그인해 주세요.');
  return client;
}
