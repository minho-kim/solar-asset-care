export const CERTIFICATE_MAX_BYTES = 10000000;
export const certificateStatus = {
  pending: '확인 대기',
  published: '의뢰인 공개',
  withdrawn: '회수',
} as const;
export function certificateExtension(mime: string) {
  return (
    {
      'application/pdf': 'pdf',
      'image/jpeg': 'jpg',
      'image/png': 'png',
    } as Record<string, string>
  )[mime];
}
export function validCertificateDate(value: string, today: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value < '1900-01-01' ||
    value > today
  )
    return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
export function certificateFilename(id: string, mime: string) {
  if (!/^[a-f0-9-]{36}$/i.test(id) || !certificateExtension(mime))
    throw new Error('파일 정보가 올바르지 않습니다.');
  return `recycling-certificate-${id}.${certificateExtension(mime)}`;
}
