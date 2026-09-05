import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import {
  PDF_RENDERER_VERSION,
  renderReportPdf,
  sha256,
} from '@/lib/report-pdf';

let cachedFont: Promise<Uint8Array> | null = null;
let rendering = false;
const noStore = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
};
function json(error: string, status: number) {
  return Response.json({ error }, { status, headers: noStore });
}
function font() {
  cachedFont ??= (async () => {
    // Do not derive this origin from an untrusted Host / forwarded header.
    const origin =
      process.env.REPORT_ASSET_ORIGIN ||
      (process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : '');
    if (!origin) throw new Error('PDF 파일 제공 주소가 설정되지 않았습니다.');
    const url = new URL('/fonts/NanumGothic-Regular.ttf', origin);
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('PDF 글꼴을 불러올 수 없습니다.');
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > 6000000)
      throw new Error('PDF 글꼴 크기가 올바르지 않습니다.');
    return bytes;
  })().catch((error) => {
    cachedFont = null;
    throw error;
  });
  return cachedFont;
}
type Context = { params: Promise<{ id: string }> };
async function handle(request: Request, context: Context, prepare: boolean) {
  const { id } = await context.params;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    return json('보고서를 찾을 수 없습니다.', 404);
  const authorization = request.headers.get('authorization') ?? '';
  if (!authorization.startsWith('Bearer '))
    return json('로그인이 필요합니다.', 401);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key?.startsWith('sb_publishable_'))
    return json('서비스 연결 설정을 확인해 주세요.', 503);
  const client = createClient<Database>(url, key, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: authError } = await client.auth.getUser(
    authorization.slice(7),
  );
  if (authError || !userData.user) return json('다시 로그인해 주세요.', 401);
  const { data: report, error: reportError } = await client
    .from('reports')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (reportError || !report)
    return json('보고서를 찾을 수 없거나 접근 권한이 없습니다.', 404);
  const { data: snapshot, error: snapshotError } = await client
    .from('report_snapshots')
    .select('*')
    .eq('report_id', id)
    .maybeSingle();
  if (snapshotError || !snapshot) return json('검토 보관본이 없습니다.', 409);
  const { data: existing, error: documentError } = await client
    .from('report_documents')
    .select('*')
    .eq('report_id', id)
    .eq('snapshot_sha256', snapshot.sha256)
    .maybeSingle();
  if (documentError) return json('보관 파일을 확인하지 못했습니다.', 503);
  if (!prepare) {
    if (!existing)
      return json(
        '아직 PDF가 보관되지 않았습니다. 관리자가 발행을 진행해 주세요.',
        409,
      );
    const { data: blob, error } = await client.storage
      .from('reports')
      .download(existing.storage_path);
    if (error || !blob)
      return json(
        '보관 파일을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
        503,
      );
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if ((await sha256(bytes)) !== existing.pdf_sha256)
      return json(
        '보관 파일의 무결성 확인에 실패했습니다. 관리자에게 문의해 주세요.',
        409,
      );
    return new Response(Uint8Array.from(bytes), {
      headers: {
        ...noStore,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="report-${report.version}.pdf"`,
      },
    });
  }
  const { data: member } = await client
    .from('organization_members')
    .select('role,status')
    .eq('organization_id', report.organization_id)
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (member?.role !== 'owner' || member.status !== 'active')
    return json('관리자만 PDF를 생성할 수 있습니다.', 403);
  if (report.status !== 'approved')
    return json('승인된 보고서만 PDF로 보관할 수 있습니다.', 409);
  if (existing)
    return Response.json(
      { archived: true, sha256: existing.pdf_sha256 },
      { headers: noStore },
    );
  if (rendering)
    return json('다른 PDF를 생성 중입니다. 잠시 후 다시 시도해 주세요.', 503);
  rendering = true;
  try {
    if (JSON.stringify(snapshot.content).length > 2000000)
      throw new Error('보고서가 너무 큽니다. 점검별로 소견을 나눠 주세요.');
    const bytes = await renderReportPdf(report, snapshot, await font());
    if (bytes.length > 20000000)
      throw new Error('PDF 크기가 보관 한도를 초과했습니다.');
    const checksum = await sha256(bytes);
    const path = `${report.organization_id}/${report.inspection_id}/${id}/${snapshot.sha256}.pdf`;
    const { error: uploadError } = await client.storage
      .from('reports')
      .upload(path, bytes, { contentType: 'application/pdf', upsert: false });
    if (uploadError) {
      // An interrupted previous request may have uploaded bytes but not registered them.
      const { data: previous, error } = await client.storage
        .from('reports')
        .download(path);
      if (
        error ||
        !previous ||
        (await sha256(new Uint8Array(await previous.arrayBuffer()))) !==
          checksum
      ) {
        throw new Error(
          'PDF 보관에 실패했습니다. 기존 파일을 덮어쓰지 않았습니다. 잠시 후 다시 시도해 주세요.',
        );
      }
    }
    const { error } = await client.rpc('archive_report_pdf', {
      p_report_id: id,
      p_snapshot_sha256: snapshot.sha256,
      p_pdf_sha256: checksum,
      p_bytes: bytes.length,
      p_renderer_version: PDF_RENDERER_VERSION,
    });
    if (error) throw error;
    return Response.json(
      { archived: true, sha256: checksum },
      { headers: noStore },
    );
  } catch (error) {
    const reason =
      error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : 'PDF를 생성하지 못했습니다.';
    return json(reason, 503);
  } finally {
    rendering = false;
  }
}
export function GET(request: Request, context: Context) {
  return handle(request, context, false);
}
export function POST(request: Request, context: Context) {
  return handle(request, context, true);
}
