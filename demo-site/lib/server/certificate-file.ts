import { PDFDocument, PDFDict, PDFName, PDFArray, PDFStream } from 'pdf-lib';
import { CERTIFICATE_MAX_BYTES } from '../recycling-certificate';
export class CertificateFileError extends Error {}

/** Validate without rewriting issuer bytes or invalidating signatures. This is
 * bounded format/active-content screening, not malware or issuer verification. */
export async function validateCertificateFile(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > CERTIFICATE_MAX_BYTES)
    throw new CertificateFileError('인증서는 10MB 이하로 준비해 주세요.');
  const starts = (...signature: number[]) =>
    signature.every((b, i) => bytes[i] === b);
  if (starts(37, 80, 68, 70, 45)) {
    if (!new TextDecoder('latin1').decode(bytes.slice(-2048)).includes('%%EOF'))
      throw new CertificateFileError('PDF 파일의 끝부분이 손상됐습니다.');
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    if (doc.getPageCount() < 1 || doc.getPageCount() > 100)
      throw new CertificateFileError('PDF는 1~100쪽으로 준비해 주세요.');
    const blocked = new Set([
      'JavaScript',
      'JS',
      'AA',
      'OpenAction',
      'Launch',
      'SubmitForm',
      'ImportData',
      'RichMedia',
      'XFA',
      'EmbeddedFiles',
      'EmbeddedFile',
    ]);
    const objects = doc.context.enumerateIndirectObjects();
    if (objects.length > 20000)
      throw new CertificateFileError(
        'PDF 구조가 너무 복잡합니다. 일반 PDF로 다시 저장해 주세요.',
      );
    const seen = new Set<unknown>();
    const inspect = (value: unknown, depth: number) => {
      if (!value || seen.has(value)) return;
      if (depth > 40)
        throw new CertificateFileError('PDF 구조가 너무 복잡합니다.');
      seen.add(value);
      if (value instanceof PDFName && blocked.has(value.decodeText()))
        throw new CertificateFileError(
          '스크립트·첨부·자동 실행이 없는 PDF로 준비해 주세요.',
        );
      if (value instanceof PDFDict)
        for (const [key, item] of value.entries()) {
          inspect(key, depth + 1);
          inspect(item, depth + 1);
        }
      if (value instanceof PDFArray)
        for (const item of value.asArray()) inspect(item, depth + 1);
      if (value instanceof PDFStream) inspect(value.dict, depth + 1);
    };
    for (const [, value] of objects) inspect(value, 0);
    return 'application/pdf';
  }
  const doc = await PDFDocument.create();
  if (starts(137, 80, 78, 71, 13, 10, 26, 10)) {
    if (
      bytes.length < 33 ||
      new TextDecoder().decode(bytes.slice(12, 16)) !== 'IHDR'
    )
      throw new CertificateFileError('PNG 파일을 확인해 주세요.');
    const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = data.getUint32(16),
      height = data.getUint32(20);
    if (!width || !height || width * height > 4000000)
      throw new CertificateFileError('PNG는 400만 화소 이하로 준비해 주세요.');
    await doc.embedPng(bytes);
    return 'image/png';
  }
  if (starts(255, 216, 255)) {
    if (bytes[bytes.length - 2] !== 255 || bytes[bytes.length - 1] !== 217)
      throw new CertificateFileError('JPG 파일을 확인해 주세요.');
    const jpg = await doc.embedJpg(bytes);
    if (!jpg.width || !jpg.height || jpg.width * jpg.height > 20000000)
      throw new CertificateFileError(
        'JPG는 2,000만 화소 이하로 준비해 주세요.',
      );
    return 'image/jpeg';
  }
  throw new CertificateFileError('PDF·JPG·PNG 파일만 등록할 수 있습니다.');
}
