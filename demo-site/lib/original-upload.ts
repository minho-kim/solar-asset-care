import { Upload, type UrlStorage } from 'tus-js-client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './supabase/database.types';

export const ORIGINAL_CHUNK_BYTES = 6 * 1024 * 1024;
export const MAX_ORIGINAL_BYTES = 50 * 1024 * 1024;
export function uploadEndpoint(projectUrl: string) {
  const url = new URL(projectUrl);
  if (url.protocol !== 'https:' || url.username || url.password)
    throw new Error('파일 저장소 주소를 확인해 주세요.');
  if (/^[a-z0-9]+\.supabase\.co$/.test(url.hostname))
    url.hostname = url.hostname.replace('.supabase.co', '.storage.supabase.co');
  url.pathname = '/storage/v1/upload/resumable';
  url.search = '';
  url.hash = '';
  return url.href;
}
export function originalPath(
  org: string,
  inspection: string,
  kind: string,
  checksum: string,
  extension: string,
) {
  const uuid =
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  if (
    !uuid.test(org) ||
    !uuid.test(inspection) ||
    !['thermal_original', 'visible_original'].includes(kind) ||
    !/^[a-f0-9]{64}$/.test(checksum) ||
    !['jpg', 'png', 'tiff'].includes(extension)
  )
    throw new Error('업로드 대상을 확인해 주세요.');
  return `${org}/${inspection}/${kind}-${checksum}.${extension}`;
}
export function resumeFingerprint(
  userId: string,
  endpoint: string,
  path: string,
  checksum: string,
) {
  return `solar-original-v1:${endpoint}:${userId}:${path}:${checksum}`;
}
export function trustedUploadUrl(value: string | null, endpoint: string) {
  if (!value) return false;
  try {
    const candidate = new URL(value),
      base = new URL(endpoint);
    return (
      candidate.origin === base.origin &&
      !candidate.username &&
      !candidate.password &&
      (candidate.pathname === base.pathname ||
        candidate.pathname.startsWith(`${base.pathname}/`))
    );
  } catch {
    return false;
  }
}
export async function fileChecksum(file: Blob) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', await file.arrayBuffer()),
    ),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
}
export async function originalImageType(file: Blob) {
  if (file.size < 8 || file.size > MAX_ORIGINAL_BYTES)
    throw new Error('파일은 50MB 이하의 JPG·PNG·TIFF만 선택해 주세요.');
  const h = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (h[0] === 255 && h[1] === 216 && h[2] === 255)
    return { mimeType: 'image/jpeg', extension: 'jpg' };
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => n === h[i]))
    return { mimeType: 'image/png', extension: 'png' };
  if (
    (h[0] === 73 && h[1] === 73 && h[2] === 42 && h[3] === 0) ||
    (h[0] === 77 && h[1] === 77 && h[2] === 0 && h[3] === 42)
  )
    return { mimeType: 'image/tiff', extension: 'tiff' };
  throw new Error('파일 내용이 JPG·PNG·TIFF 형식이 아닙니다.');
}
export function sendResumableOriginal(options: {
  file: Blob;
  client: SupabaseClient<Database>;
  userId: string;
  projectUrl: string;
  path: string;
  checksum: string;
  mimeType: string;
  signal: AbortSignal;
  onProgress: (percent: number) => void;
  onChunkComplete?: (chunkBytes: number, acceptedBytes: number) => void;
  urlStorage?: UrlStorage;
}) {
  const endpoint = uploadEndpoint(options.projectUrl);
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    function done(error?: Error) {
      if (settled) return;
      settled = true;
      options.signal.removeEventListener('abort', pause);
      if (error) reject(error);
      else resolve();
    }
    const upload = new Upload(options.file, {
      endpoint,
      chunkSize: ORIGINAL_CHUNK_BYTES,
      uploadDataDuringCreation: true,
      retryDelays: [0, 1000, 3000, 5000],
      removeFingerprintOnSuccess: true,
      ...(options.urlStorage ? { urlStorage: options.urlStorage } : {}),
      fingerprint: async () =>
        resumeFingerprint(
          options.userId,
          endpoint,
          options.path,
          options.checksum,
        ),
      metadata: {
        bucketName: 'inspection-originals',
        objectName: options.path,
        contentType: options.mimeType,
        cacheControl: '0',
      },
      onBeforeRequest: async (request) => {
        options.signal.throwIfAborted();
        if (!trustedUploadUrl(request.getURL(), endpoint))
          throw new Error('업로드 재개 주소가 올바르지 않습니다.');
        const { data, error } = await options.client.auth.getSession();
        options.signal.throwIfAborted();
        if (error || !data.session || data.session.user.id !== options.userId)
          throw new Error('같은 계정으로 다시 로그인해 주세요.');
        request.setHeader(
          'authorization',
          `Bearer ${data.session.access_token}`,
        );
        request.setHeader('x-upsert', 'false');
      },
      onShouldRetry: (error) => {
        const status = error.originalResponse?.getStatus() || 0;
        return (
          !options.signal.aborted &&
          (status === 0 || status === 423 || status === 429 || status >= 500)
        );
      },
      onProgress: (sent, total) => {
        if (!settled)
          options.onProgress(total ? Math.floor((sent / total) * 100) : 0);
      },
      onChunkComplete: options.onChunkComplete,
      onSuccess: () => done(),
      onError: () =>
        done(
          new Error(
            '업로드가 중단됐습니다. 연결과 로그인 상태를 확인한 뒤 다시 시작해 주세요.',
          ),
        ),
    });
    function pause() {
      const paused = () =>
        done(new DOMException('업로드를 일시정지했습니다.', 'AbortError'));
      void upload.abort().then(paused, paused);
    }
    options.signal.addEventListener('abort', pause, { once: true });
    void (async () => {
      try {
        options.signal.throwIfAborted();
        const previous = await upload.findPreviousUploads();
        options.signal.throwIfAborted();
        const match = previous.find(
          (item) =>
            item.size === options.file.size &&
            trustedUploadUrl(item.uploadUrl, endpoint) &&
            item.metadata.objectName === options.path &&
            item.metadata.bucketName === 'inspection-originals',
        );
        if (match) upload.resumeFromPreviousUpload(match);
        upload.start();
      } catch (error) {
        done(
          error instanceof Error
            ? error
            : new Error('업로드를 시작하지 못했습니다.'),
        );
      }
    })();
  });
}

/** Server file/row state is authoritative; the local TUS fingerprint is only a
 * resume hint. A finished object without a row is verified and registered on retry. */
export async function saveOriginal(options: {
  file: File;
  client: SupabaseClient<Database>;
  userId: string;
  projectUrl: string;
  organizationId: string;
  inspectionId: string;
  kind: 'thermal_original' | 'visible_original';
  signal: AbortSignal;
  onProgress: (percent: number) => void;
}) {
  options.signal.throwIfAborted();
  const type = await originalImageType(options.file),
    checksum = await fileChecksum(options.file);
  const path = originalPath(
    options.organizationId,
    options.inspectionId,
    options.kind,
    checksum,
    type.extension,
  );
  const find = () =>
    options.client
      .from('inspection_files')
      .select('*')
      .eq('storage_bucket', 'inspection-originals')
      .eq('storage_path', path)
      .maybeSingle();
  const existing = await find();
  if (existing.error) throw existing.error;
  if (existing.data) {
    if (
      existing.data.sha256 !== checksum ||
      existing.data.bytes !== options.file.size
    )
      throw new Error('기존 원본의 확인값이 다릅니다.');
    options.signal.throwIfAborted();
    const remote = await options.client.storage
      .from('inspection-originals')
      .download(
        path,
        { cacheNonce: crypto.randomUUID() },
        { signal: options.signal },
      );
    if (
      remote.error ||
      !remote.data ||
      remote.data.size !== options.file.size ||
      (await fileChecksum(remote.data)) !== checksum
    )
      throw new Error(
        '이미 등록된 원본 파일을 확인하지 못했습니다. 관리자에게 문의해 주세요.',
      );
    options.onProgress(100);
    return existing.data;
  }
  const stored = await options.client.storage
    .from('inspection-originals')
    .download(path, { cacheNonce: crypto.randomUUID() });
  options.signal.throwIfAborted();
  if (!stored.error && stored.data) {
    if (
      stored.data.size !== options.file.size ||
      (await fileChecksum(stored.data)) !== checksum
    )
      throw new Error(
        '저장된 원본이 선택한 파일과 다릅니다. 덮어쓰지 않았습니다.',
      );
  } else {
    try {
      await sendResumableOriginal({
        ...options,
        path,
        checksum,
        mimeType: type.mimeType,
      });
      options.signal.throwIfAborted();
      const verified = await options.client.storage
        .from('inspection-originals')
        .download(
          path,
          { cacheNonce: crypto.randomUUID() },
          { signal: options.signal },
        );
      if (
        verified.error ||
        !verified.data ||
        verified.data.size !== options.file.size ||
        (await fileChecksum(verified.data)) !== checksum
      )
        throw new Error(
          '전송된 원본의 확인값을 검증하지 못했습니다. 같은 파일로 다시 시도해 주세요.',
        );
    } catch (error) {
      options.signal.throwIfAborted();
      // A concurrent same-content upload may have won. Verify it, never overwrite.
      const concurrent = await options.client.storage
        .from('inspection-originals')
        .download(path, { cacheNonce: crypto.randomUUID() });
      if (
        concurrent.error ||
        !concurrent.data ||
        concurrent.data.size !== options.file.size ||
        (await fileChecksum(concurrent.data)) !== checksum
      )
        throw error;
    }
  }
  options.signal.throwIfAborted();
  const row = await options.client
    .from('inspection_files')
    .insert({
      organization_id: options.organizationId,
      inspection_id: options.inspectionId,
      kind: options.kind,
      storage_bucket: 'inspection-originals',
      storage_path: path,
      original_name: options.file.name,
      mime_type: type.mimeType,
      bytes: options.file.size,
      sha256: checksum,
      captured_at: null,
      capture_timezone: 'Asia/Seoul',
      quality_status: 'pending',
      created_by: options.userId,
    })
    .select('*')
    .single();
  if (row.error) {
    const raced = await find();
    if (
      raced.error ||
      !raced.data ||
      raced.data.sha256 !== checksum ||
      raced.data.bytes !== options.file.size
    )
      throw new Error(
        '파일 전송은 끝났지만 목록 등록이 완료되지 않았습니다. 같은 파일로 다시 시작해 주세요.',
      );
    return raced.data;
  }
  options.onProgress(100);
  return row.data;
}
