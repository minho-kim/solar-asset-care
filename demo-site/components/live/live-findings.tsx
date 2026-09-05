'use client';

import { useEffect, useState, type SyntheticEvent } from 'react';
import Image from 'next/image';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { Database, Tables } from '@/lib/supabase/database.types';
import {
  defectLabels,
  dispositionLabels,
  kindLabels,
  severityLabels,
} from '@/lib/finding-labels';

type Finding = Tables<'findings'>;
type Props = {
  supabase: SupabaseClient<Database>;
  session: Session;
  organizationId: string;
  inspections: Tables<'inspections'>[];
  files: Tables<'inspection_files'>[];
  findings: Finding[];
  canWrite: boolean;
  refresh: () => Promise<void>;
  setNotice: (
    n: { tone: 'success' | 'error' | 'info'; text: string } | null,
  ) => void;
};
const selectClass =
  'min-h-11 w-full min-w-0 rounded-lg border bg-white px-3 text-base';
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0 space-y-2 text-sm font-medium text-slate-700">
      <span>{label}</span>
      {children}
    </label>
  );
}
function message(e: unknown) {
  return e && typeof e === 'object' && 'message' in e
    ? String(e.message)
    : '판정을 저장하지 못했습니다.';
}
function get(f: FormData, k: string) {
  const v = f.get(k);
  return typeof v === 'string' ? v.trim() : '';
}
function optionalNumber(f: FormData, k: string) {
  const s = get(f, k);
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error('숫자 항목을 확인해 주세요.');
  return n;
}

export function FindingsEditorView(props: Props) {
  const [inspection, setInspection] = useState('');
  const id = inspection || props.inspections[0]?.id || '';
  const [editing, setEditing] = useState<Finding | null>(null);
  const findings = props.findings.filter((f) => f.inspection_id === id);
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">이상 소견·전문가 판정</h1>
      <Field label="점검">
        <select
          className={selectClass}
          value={id}
          onChange={(e) => {
            setInspection(e.target.value);
            setEditing(null);
          }}
        >
          <option value="" disabled>
            점검을 선택하세요
          </option>
          {props.inspections.map((i) => (
            <option key={i.id} value={i.id}>
              {i.inspection_code}
            </option>
          ))}
        </select>
      </Field>
      <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
        색상 후보 점수는 실제 온도가 아닙니다. 온도를 입력할 때는 측정 장비와
        근거를 함께 기록해 주세요.
      </p>
      <div className="grid items-start gap-5 xl:grid-cols-2">
        {id && props.canWrite && (
          <FindingForm
            key={`${id}-${editing?.id ?? 'new'}-${editing?.updated_at ?? ''}`}
            {...props}
            inspectionId={id}
            initial={editing}
            finish={() => setEditing(null)}
          />
        )}
        <section className="space-y-3">
          {findings.map((f) => (
            <article
              key={f.id}
              className="rounded-2xl border bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-bold">
                  {f.defect_type
                    ? defectLabels[f.defect_type]
                    : kindLabels[f.kind]}
                </h2>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-sm">
                  {dispositionLabels[f.disposition]}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-600">
                {f.location_label || '위치 미입력'} ·{' '}
                {severityLabels[f.severity]} · 상대 점수{' '}
                {f.relative_heat_score ?? '없음'}
              </p>
              {f.temperature_max_c != null && (
                <p className="mt-2 text-sm">
                  최고 온도 {f.temperature_max_c} ℃
                </p>
              )}
              {f.temperature_delta_c != null && (
                <p className="text-sm">온도차 {f.temperature_delta_c} ℃</p>
              )}
              {f.measurement_source && (
                <p className="mt-1 break-words text-sm text-slate-500">
                  측정 근거: {f.measurement_source}
                </p>
              )}
              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">
                {f.expert_note || '검토 메모가 없습니다.'}
              </p>
              <Button
                type="button"
                variant="outline"
                className="mt-4"
                disabled={!props.canWrite}
                onClick={() => setEditing(f)}
              >
                판정·수정
              </Button>
            </article>
          ))}
          {!findings.length && (
            <p className="rounded-2xl border bg-white p-5 text-sm text-slate-600">
              후보가 없더라도 원본을 확인한 뒤 수동 소견을 등록할 수 있습니다.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
function FindingForm(
  props: Props & {
    inspectionId: string;
    initial: Finding | null;
    finish: () => void;
  },
) {
  const f = props.initial;
  const files = props.files.filter(
    (file) => file.inspection_id === props.inspectionId,
  );
  const [fileId, setFileId] = useState(f?.source_file_id ?? '');
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const sourceFile = files.find((file) => file.id === fileId);
  const region = f?.region as {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  const { supabase } = props;
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setPreview('');
      setPreviewError('');
      if (
        !sourceFile ||
        !['image/jpeg', 'image/png'].includes(sourceFile.mime_type ?? '')
      )
        return;
      void supabase.storage
        .from(sourceFile.storage_bucket)
        .createSignedUrl(sourceFile.storage_path, 180)
        .then(({ data, error }) => {
          if (!active) return;
          if (error) setPreviewError('원본 미리보기를 불러오지 못했습니다.');
          else setPreview(data.signedUrl);
        });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [sourceFile, supabase]);
  async function submit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const formElement = e.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    props.setNotice(null);
    try {
      const values = ['x', 'y', 'width', 'height'].map((k) =>
        optionalNumber(form, k),
      );
      if (values.some((v) => v !== null) && values.some((v) => v === null))
        throw new Error(
          '이미지 영역은 네 좌표를 모두 입력하거나 모두 비워 주세요.',
        );
      const nextRegion = values.every((v) => v !== null)
        ? {
            x: values[0]! / 100,
            y: values[1]! / 100,
            width: values[2]! / 100,
            height: values[3]! / 100,
          }
        : null;
      const change = {
        kind: get(form, 'kind'),
        defect_type: get(form, 'defectType'),
        location_label: get(form, 'locationLabel') || null,
        severity: get(form, 'severity'),
        disposition: get(form, 'disposition'),
        expert_note: get(form, 'note'),
        temperature_max_c: optionalNumber(form, 'maxTemperature'),
        temperature_delta_c: optionalNumber(form, 'deltaTemperature'),
        measurement_source: get(form, 'measurementSource') || null,
        source_file_id: fileId || null,
        region: nextRegion,
        reviewed_by: props.session.user.id,
        reviewed_at: new Date().toISOString(),
      };
      if (
        (change.temperature_max_c !== null ||
          change.temperature_delta_c !== null) &&
        !change.measurement_source
      )
        throw new Error('온도의 측정 장비·근거를 입력해 주세요.');
      const result = f
        ? await supabase
            .from('findings')
            .update(change)
            .eq('id', f.id)
            .eq('updated_at', f.updated_at)
            .select('id')
            .maybeSingle()
        : await supabase
            .from('findings')
            .insert({
              ...change,
              organization_id: props.organizationId,
              inspection_id: props.inspectionId,
              source: 'expert_manual',
            })
            .select('id')
            .single();
      if (result.error) throw result.error;
      if (!result.data)
        throw new Error(
          '다른 사용자가 수정했습니다. 새로고침 후 다시 확인해 주세요.',
        );
      props.setNotice({
        tone: 'success',
        text: '전문가 판정과 변경 이력을 저장했습니다. 이미 검토 중이거나 발행된 보고서에는 자동 반영되지 않습니다.',
      });
      if (!f) {
        formElement.reset();
        setFileId('');
      }
      props.finish();
      await props.refresh();
    } catch (e) {
      props.setNotice({ tone: 'error', text: message(e) });
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={submit}
      className="min-w-0 space-y-4 rounded-2xl border bg-white p-5 shadow-sm"
    >
      <div className="flex justify-between gap-3">
        <h2 className="font-bold">{f ? '소견 수정' : '수동 소견 등록'}</h2>
        {f && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={props.finish}
          >
            새 소견
          </Button>
        )}
      </div>
      <Field label="근거 원본">
        <select
          className={selectClass}
          value={fileId}
          onChange={(e) => setFileId(e.target.value)}
          disabled={f?.source === 'rule_candidate'}
        >
          <option value="">원본 선택</option>
          {files.map((file) => (
            <option key={file.id} value={file.id}>
              {file.original_name}
            </option>
          ))}
        </select>
      </Field>
      {previewError && (
        <p role="alert" className="text-sm text-rose-700">
          {previewError}
        </p>
      )}
      {preview && (
        <div className="relative overflow-hidden rounded-lg bg-slate-100">
          <Image
            unoptimized
            src={preview}
            alt="판정 근거 원본"
            width={1024}
            height={768}
            className="block h-auto w-full"
            onError={() =>
              setPreviewError(
                '원본 링크가 만료됐습니다. 원본을 다시 선택해 주세요.',
              )
            }
          />
          {region && (
            <div
              aria-label="기록된 판정 영역"
              className="pointer-events-none absolute border-2 border-rose-500 bg-rose-500/15"
              style={{
                left: `${region.x * 100}%`,
                top: `${region.y * 100}%`,
                width: `${region.width * 100}%`,
                height: `${region.height * 100}%`,
              }}
            />
          )}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="후보 구분">
          <select
            name="kind"
            className={selectClass}
            defaultValue={f?.kind ?? 'hotspot'}
          >
            {Object.entries(kindLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="이상 유형">
          <select
            name="defectType"
            className={selectClass}
            defaultValue={f?.defect_type ?? 'other'}
          >
            {Object.entries(defectLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="위치·모듈 식별">
          <Input
            name="locationLabel"
            maxLength={200}
            defaultValue={f?.location_label ?? ''}
            placeholder="예: 2열 5번 모듈"
          />
        </Field>
        <Field label="심각도">
          <select
            name="severity"
            className={selectClass}
            defaultValue={f?.severity ?? 'review'}
          >
            {Object.entries(severityLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="최고 온도 (℃·측정값이 있을 때만)">
          <Input
            name="maxTemperature"
            type="number"
            min="-273.15"
            max="2000"
            step="0.01"
            defaultValue={f?.temperature_max_c ?? ''}
          />
        </Field>
        <Field label="기준 부위 대비 온도차 (℃)">
          <Input
            name="deltaTemperature"
            type="number"
            min="-1000"
            max="1000"
            step="0.01"
            defaultValue={f?.temperature_delta_c ?? ''}
          />
        </Field>
      </div>
      <Field label="온도 측정 장비·원본·근거">
        <Input
          name="measurementSource"
          maxLength={1000}
          defaultValue={f?.measurement_source ?? ''}
        />
      </Field>
      <fieldset className="rounded-xl border p-3">
        <legend className="px-1 text-sm">
          이미지 영역 (선택·원본 너비/높이 대비 %)
        </legend>
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              ['x', '왼쪽'],
              ['y', '위쪽'],
              ['width', '폭'],
              ['height', '높이'],
            ] as const
          ).map(([key, label]) => (
            <Field key={key} label={label}>
              <Input
                name={key}
                type="number"
                min={key === 'width' || key === 'height' ? 0.0001 : 0}
                max="100"
                step="any"
                defaultValue={region ? region[key] * 100 : ''}
              />
            </Field>
          ))}
        </div>
      </fieldset>
      <Field label="판정">
        <select
          name="disposition"
          className={selectClass}
          defaultValue={
            f?.disposition === 'rejected'
              ? 'rejected'
              : f
                ? 'modified'
                : 'accepted'
          }
        >
          <option value="accepted">채택</option>
          <option value="modified">수정 채택</option>
          <option value="rejected">제외 (이력 보존)</option>
        </select>
      </Field>
      <Field label="판정 근거·권고 조치">
        <Textarea
          name="note"
          required
          maxLength={4000}
          defaultValue={f?.expert_note ?? ''}
        />
      </Field>
      <Button type="submit" disabled={busy}>
        {busy ? '저장 중…' : '판정 저장'}
      </Button>
    </form>
  );
}
