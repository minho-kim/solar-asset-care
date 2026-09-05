import type { AssessmentResult } from './operational-assessment';

export type Rect = { x: number; y: number; width: number; height: number };
export type ReportImage = {
  id: string;
  source_file_id: string;
  storage_path: string;
  sha256: string;
  caption: string;
  width: number;
  height: number;
  bytes: number;
  masks: Rect[];
  status: 'pending' | 'approved' | 'excluded';
  reviewed_at: string | null;
};
export const MAX_REPORT_IMAGES = 12;
export const MAX_IMAGE_BYTES = 1200000;
export function validRect(value: unknown): value is Rect {
  if (!value || typeof value !== 'object') return false;
  const r = value as Rect;
  return (
    [r.x, r.y, r.width, r.height].every(Number.isFinite) &&
    r.x >= 0 &&
    r.y >= 0 &&
    r.width > 0 &&
    r.height > 0 &&
    r.x + r.width <= 1.000001 &&
    r.y + r.height <= 1.000001
  );
}

/** Remove all APP/COM metadata and trailing payloads. Only bounded baseline RGB
 * JPEGs emitted by the canvas export are accepted; never serve uploaded HTML/SVG. */
export function cleanReportJpeg(input: Uint8Array) {
  const fail = () => {
    throw new Error('보고서 이미지는 1280px 이하의 JPG로 다시 저장해 주세요.');
  };
  if (input.length > MAX_IMAGE_BYTES || input[0] !== 255 || input[1] !== 216)
    return fail();
  const parts: Uint8Array[] = [input.slice(0, 2)];
  let at = 2,
    width = 0,
    height = 0,
    scan = false,
    ended = false;
  while (at < input.length) {
    if (input[at] !== 255) return fail();
    const marker = input[at + 1];
    if (marker === 217) {
      parts.push(input.slice(at, at + 2));
      ended = true;
      break;
    }
    if (marker === undefined || marker === 0 || marker === 216) return fail();
    const size = (input[at + 2] << 8) | input[at + 3];
    const end = at + 2 + size;
    if (size < 2 || end > input.length) return fail();
    if (marker === 192) {
      if (width || size !== 17 || input[at + 4] !== 8 || input[at + 9] !== 3)
        return fail();
      height = (input[at + 5] << 8) | input[at + 6];
      width = (input[at + 7] << 8) | input[at + 8];
      if (!width || !height || width > 1280 || height > 1280) return fail();
    } else if (
      ![196, 219, 221, 218, 254].includes(marker) &&
      !(marker >= 224 && marker <= 239)
    )
      return fail();
    if (!(marker >= 224 && marker <= 239) && marker !== 254)
      parts.push(input.slice(at, end));
    at = end;
    if (marker === 218) {
      if (!width || scan) return fail();
      scan = true;
      const start = at;
      while (at < input.length - 1) {
        if (input[at] !== 255) {
          at++;
          continue;
        }
        const next = input[at + 1];
        if (next === 0 || (next >= 208 && next <= 215)) {
          at += 2;
          continue;
        }
        if (next !== 217) return fail();
        break;
      }
      parts.push(input.slice(start, at));
    }
  }
  if (!ended || !scan) return fail();
  const bytes = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return { bytes, width, height };
}

export function reportBars(result: AssessmentResult) {
  const values = [
    result.currentRevenue,
    result.recoverableAmount,
    result.expectedRevenue,
  ];
  if (values.some((n) => !Number.isFinite(n) || n < 0))
    throw new Error('경제성 차트의 계산값을 확인해 주세요.');
  const rows = [
    { label: '현재 수익', value: values[0] },
    { label: '개선 후 추정', value: values[0] + values[1] },
    { label: '기대 수익', value: values[2] },
  ];
  const maximum = Math.max(1, ...rows.map((r) => r.value));
  return rows.map((r) => ({ ...r, ratio: r.value / maximum }));
}
