import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './supabase/database.types';
export async function requestReportPdf(
  client: SupabaseClient<Database>,
  reportId: string,
  prepare = false,
) {
  const { data, error } = await client.auth.getSession();
  if (error || !data.session) throw new Error('다시 로그인해 주세요.');
  const response = await fetch(`/api/reports/${reportId}/pdf`, {
    method: prepare ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${data.session.access_token}` },
    cache: 'no-store',
  });
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new Error(
      result &&
        typeof result === 'object' &&
        'error' in result &&
        typeof result.error === 'string'
        ? result.error
        : 'PDF 요청을 처리하지 못했습니다.',
    );
  }
  return response;
}
