'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables } from '@/lib/supabase/database.types';
import { reportBars, validRect, type ReportImage } from '@/lib/report-visuals';
import type { AssessmentResult } from '@/lib/operational-assessment';

export function EconomicChart({ result }: { result: AssessmentResult }) {
  return (
    <figure
      className="mt-6 space-y-4 rounded-xl border p-4 break-inside-avoid"
      aria-label="동일 분석기간의 수익 비교"
    >
      <figcaption className="text-base font-semibold">
        동일 분석기간의 수익 비교
      </figcaption>
      {reportBars(result).map((bar, index) => (
        <div key={bar.label}>
          <div className="mb-1 flex flex-wrap justify-between gap-2 text-sm">
            <span>{bar.label}</span>
            <span>{Math.round(bar.value).toLocaleString('ko-KR')}원</span>
          </div>
          <div className="h-5 rounded bg-slate-100" aria-hidden="true">
            <div
              className={`h-full rounded ${index === 1 ? 'bg-teal-600' : 'bg-slate-500'}`}
              style={{ width: `${bar.ratio * 100}%` }}
            />
          </div>
        </div>
      ))}
      <p className="text-sm text-slate-600">
        개선 후 추정 = 현재 수익 + 기간 회수가능액. 실제 수익을 보장하지
        않습니다.
      </p>
    </figure>
  );
}

export function ReportPhoto({
  client,
  photo,
  reportId,
  findings = [],
  onVerified,
}: {
  client: SupabaseClient<Database>;
  photo: ReportImage;
  reportId?: string;
  findings?: Tables<'findings'>[];
  onVerified?: () => void;
}) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true,
      objectUrl = '';
    void (async () => {
      try {
        const { data } = await client.auth.getSession();
        if (!data.session) throw new Error('다시 로그인해 주세요.');
        const response = await fetch(
          `/api/report-images?id=${photo.id}${reportId ? `&reportId=${reportId}` : ''}`,
          {
            headers: { Authorization: `Bearer ${data.session.access_token}` },
            cache: 'no-store',
          },
        );
        if (!response.ok) throw new Error('사진을 불러오지 못했습니다.');
        objectUrl = URL.createObjectURL(await response.blob());
        if (active) setUrl(objectUrl);
        else URL.revokeObjectURL(objectUrl);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : '사진 읽기 실패');
      }
    })();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [client, photo.id, photo.sha256, reportId, retry]);
  const markers = findings
    .map((finding, index) => ({ finding, number: index + 1 }))
    .filter(
      ({ finding }) =>
        finding.source_file_id === photo.source_file_id &&
        validRect(finding.region),
    );
  return (
    <figure className="min-w-0 break-inside-avoid">
      {error ? (
        <div className="rounded border p-4 text-sm" role="alert">
          {error}{' '}
          <button
            type="button"
            className="underline"
            onClick={() => {
              setError('');
              setUrl('');
              setRetry((n) => n + 1);
            }}
          >
            다시 시도
          </button>
        </div>
      ) : url ? (
        <div
          className="relative overflow-hidden rounded border"
          style={{
            width: `min(100%, ${(600 * photo.width) / photo.height}px)`,
          }}
        >
          <Image
            unoptimized
            src={url}
            alt={photo.caption}
            width={photo.width}
            height={photo.height}
            className="block h-auto w-full"
            onLoad={onVerified}
            onError={() => setError('사진 형식을 읽을 수 없습니다.')}
          />
          {markers.map(({ finding, number }) => {
            const r = finding.region as unknown as {
              x: number;
              y: number;
              width: number;
              height: number;
            };
            return (
              <div
                key={finding.id}
                className="pointer-events-none absolute border-2 border-red-600"
                style={{
                  left: `${r.x * 100}%`,
                  top: `${r.y * 100}%`,
                  width: `${r.width * 100}%`,
                  height: `${r.height * 100}%`,
                }}
              >
                <span className="absolute left-0 top-0 bg-red-700 px-1 text-sm text-white">
                  {number}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <output className="block p-4 text-sm">사진을 불러오는 중…</output>
      )}
      <figcaption className="mt-2 text-base">
        {photo.caption}
        {markers.length > 0 &&
          ` · 소견 ${markers.map((m) => m.number).join(', ')}번 영역`}
      </figcaption>
    </figure>
  );
}
