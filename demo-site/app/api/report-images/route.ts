import { requestClient, privateHeaders } from '@/lib/supabase/request-client';
import {
  cleanReportJpeg,
  MAX_IMAGE_BYTES,
  validRect,
  type ReportImage,
} from '@/lib/report-visuals';
import { sha256 } from '@/lib/report-pdf';
import type { Json } from '@/lib/supabase/database.types';
import { downloadReportAsset } from '@/lib/server/report-storage';

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
    // Bound the body even when Content-Length is absent (streamed requests).
    const reader = request.body?.getReader();
    if (!reader) return fail('사진이 없습니다.', 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > MAX_IMAGE_BYTES + 16000) {
        await reader.cancel();
        return fail('사진 용량을 줄여 주세요.', 413);
      }
      chunks.push(part.value);
    }
    const form = await new Response(new Blob(chunks as BlobPart[]), {
      headers: { 'Content-Type': request.headers.get('content-type') || '' },
    }).formData();
    const formText = (key: string) => {
      const value = form.get(key);
      return typeof value === 'string' ? value : '';
    };
    const sourceId = formText('sourceId');
    const id = formText('id');
    const caption = formText('caption').trim();
    const masks: unknown = JSON.parse(formText('masks') || '[]');
    const file = form.get('image');
    if (
      !uuid(sourceId) ||
      !uuid(id) ||
      !caption ||
      caption.length > 300 ||
      !Array.isArray(masks) ||
      masks.length > 20 ||
      !masks.every(validRect) ||
      !(file instanceof Blob)
    )
      return fail('사진 설명과 가림 영역을 확인해 주세요.', 400);
    const { data: source, error } = await client
      .from('inspection_files')
      .select('*')
      .eq('id', sourceId)
      .maybeSingle();
    if (error || !source) return fail('원본 사진에 접근할 수 없습니다.', 404);
    const jpeg = cleanReportJpeg(new Uint8Array(await file.arrayBuffer()));
    const checksum = await sha256(jpeg.bytes);
    const path = `${source.organization_id}/${source.inspection_id}/${id}.jpg`;
    const { error: uploadError } = await client.storage
      .from('report-images')
      .upload(path, jpeg.bytes, {
        contentType: 'image/jpeg',
        cacheControl: '0',
        upsert: false,
      });
    if (uploadError) {
      const previous = await client.storage
        .from('report-images')
        .download(path);
      if (
        previous.error ||
        !previous.data ||
        (await sha256(new Uint8Array(await previous.data.arrayBuffer()))) !==
          checksum
      )
        return fail(
          '사진을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.',
          409,
        );
    }
    const result = await client.rpc('register_report_image', {
      p_id: id,
      p_source_file_id: sourceId,
      p_sha256: checksum,
      p_bytes: jpeg.bytes.length,
      p_width: jpeg.width,
      p_height: jpeg.height,
      p_caption: caption,
      p_masks: masks as Json,
    });
    if (result.error) throw result.error;
    return Response.json({ image: result.data }, { headers: privateHeaders });
  } catch {
    return fail(
      '보고서 사진을 저장하지 못했습니다. JPG 형식·크기·연결 권한을 확인하고 다시 시도해 주세요.',
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
  const params = new URL(request.url).searchParams;
  const id = params.get('id') || '',
    reportId = params.get('reportId');
  if (!uuid(id) || (reportId && !uuid(reportId)))
    return fail('사진을 찾을 수 없습니다.', 404);
  try {
    let row: ReportImage | undefined;
    if (reportId) {
      const { data, error } = await client
        .from('report_snapshots')
        .select('content')
        .eq('report_id', reportId)
        .maybeSingle();
      if (error || !data) return fail('보고서에 접근할 수 없습니다.', 404);
      const content = data.content as unknown as {
        reportImages?: ReportImage[];
      };
      row = content.reportImages?.find((image) => image.id === id);
    } else {
      const result = await client
        .from('report_images')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (result.error) throw result.error;
      row = (result.data || undefined) as unknown as ReportImage | undefined;
    }
    if (!row) return fail('사진을 찾을 수 없습니다.', 404);
    const jpeg = cleanReportJpeg(
      await downloadReportAsset('report-images', row.storage_path, row.bytes),
    );
    if (
      (await sha256(jpeg.bytes)) !== row.sha256 ||
      jpeg.width !== row.width ||
      jpeg.height !== row.height
    )
      return fail('사진의 무결성 확인에 실패했습니다.', 409);
    return new Response(Uint8Array.from(jpeg.bytes), {
      headers: { ...privateHeaders, 'Content-Type': 'image/jpeg' },
    });
  } catch {
    return fail('사진을 불러오지 못했습니다.', 503);
  }
}
