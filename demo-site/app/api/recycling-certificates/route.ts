import { requestClient, privateHeaders } from '@/lib/supabase/request-client';
import { downloadReportAsset } from '@/lib/server/report-storage';
import {
  CertificateFileError,
  validateCertificateFile,
} from '@/lib/server/certificate-file';
import {
  CERTIFICATE_MAX_BYTES,
  certificateExtension,
  certificateFilename,
  validCertificateDate,
} from '@/lib/recycling-certificate';
import { sha256 } from '@/lib/report-pdf';
import { koreanDate } from '@/lib/operational-assessment';

const uuid = (s: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const fail = (error: string, status: number) =>
  Response.json({ error }, { status, headers: privateHeaders });
export async function POST(request: Request) {
  let client;
  try {
    client = await requestClient(request);
  } catch {
    return fail('다시 로그인해 주세요.', 401);
  }
  try {
    const reader = request.body?.getReader();
    if (!reader) return fail('파일이 없습니다.', 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > CERTIFICATE_MAX_BYTES + 16000) {
        await reader.cancel();
        return fail('인증서는 10MB 이하로 준비해 주세요.', 413);
      }
      chunks.push(part.value);
    }
    const form = await new Response(new Blob(chunks as BlobPart[]), {
      headers: { 'Content-Type': request.headers.get('content-type') || '' },
    }).formData();
    const text = (key: string) =>
      typeof form.get(key) === 'string' ? (form.get(key) as string).trim() : '';
    const id = text('id'),
      plantId = text('plantId'),
      title = text('title'),
      issuer = text('issuer'),
      number = text('number'),
      issuedOn = text('issuedOn');
    const panelText = text('panelCount'),
      panelCount = panelText ? Number(panelText) : null;
    const file = form.get('file');
    if (
      !uuid(id) ||
      !uuid(plantId) ||
      !title ||
      title.length > 160 ||
      !issuer ||
      issuer.length > 120 ||
      number.length > 120 ||
      !validCertificateDate(issuedOn, koreanDate()) ||
      (panelCount !== null &&
        (!Number.isInteger(panelCount) ||
          panelCount < 1 ||
          panelCount > 1000000)) ||
      !(file instanceof Blob)
    )
      return fail('발전소·제목·발급기관·발급일·수량을 확인해 주세요.', 400);
    const { data: plant } = await client
      .from('plants')
      .select('id,organization_id')
      .eq('id', plantId)
      .maybeSingle();
    if (!plant) return fail('인증서를 등록할 권한이 없습니다.', 404);
    const { data: member } = await client
      .from('organization_members')
      .select('role,status')
      .eq('organization_id', plant.organization_id)
      .eq('user_id', (await client.auth.getUser()).data.user!.id)
      .maybeSingle();
    if (member?.role !== 'owner' || member.status !== 'active')
      return fail('관리자만 인증서를 등록할 수 있습니다.', 403);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mime = await validateCertificateFile(bytes),
      hash = await sha256(bytes);
    const path = `${plant.organization_id}/${plant.id}/${id}.${certificateExtension(mime)}`;
    const { data: duplicate } = await client
      .from('recycling_certificates')
      .select('id')
      .eq('plant_id', plant.id)
      .eq('sha256', hash)
      .maybeSingle();
    if (duplicate && duplicate.id !== id)
      return fail(
        '같은 파일이 이미 등록돼 있습니다. 기존 인증서를 확인해 주세요.',
        409,
      );
    const upload = await client.storage
      .from('recycling-certificates')
      .upload(path, bytes, {
        contentType: mime,
        cacheControl: '0',
        upsert: false,
      });
    if (upload.error) {
      const previous = await downloadReportAsset(
        'recycling-certificates',
        path,
        bytes.length,
      );
      if ((await sha256(previous)) !== hash)
        return fail(
          '이미 저장된 파일과 다릅니다. 파일을 다시 선택해 주세요.',
          409,
        );
    }
    const result = await client.rpc('register_recycling_certificate', {
      p_id: id,
      p_plant_id: plant.id,
      p_title: title,
      p_issuer: issuer,
      p_number: number,
      p_issued_on: issuedOn,
      p_panel_count: panelCount,
      p_mime_type: mime,
      p_bytes: bytes.length,
      p_sha256: hash,
    });
    if (result.error)
      return fail(
        '등록을 완료하지 못했습니다. 입력 내용과 기존 등록 여부를 확인하고 다시 시도해 주세요.',
        409,
      );
    return Response.json(
      { certificate: result.data },
      { headers: privateHeaders },
    );
  } catch (error) {
    return fail(
      error instanceof CertificateFileError
        ? error.message
        : '인증서를 저장하지 못했습니다. 파일 형식을 확인하고 다시 시도해 주세요.',
      400,
    );
  }
}
export async function GET(request: Request) {
  let client;
  try {
    client = await requestClient(request);
  } catch {
    return fail('다시 로그인해 주세요.', 401);
  }
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!uuid(id)) return fail('인증서를 찾을 수 없습니다.', 404);
  try {
    const { data: row, error } = await client
      .from('recycling_certificates')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error || !row)
      return fail('인증서가 없거나 접근 권한이 없습니다.', 404);
    const bytes = await downloadReportAsset(
      'recycling-certificates',
      row.storage_path,
      row.bytes,
    );
    if ((await sha256(bytes)) !== row.sha256)
      return fail('파일 확인값이 다릅니다. 관리자에게 문의해 주세요.', 409);
    if ((await validateCertificateFile(bytes)) !== row.mime_type)
      return fail('파일 형식을 확인할 수 없습니다.', 409);
    return new Response(Uint8Array.from(bytes), {
      headers: {
        ...privateHeaders,
        'Content-Type': row.mime_type,
        'Content-Disposition': `attachment; filename="${certificateFilename(row.id, row.mime_type)}"`,
        'Content-Security-Policy': "sandbox; default-src 'none'",
        'X-Frame-Options': 'DENY',
      },
    });
  } catch {
    return fail(
      '인증서 파일을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
      503,
    );
  }
}
