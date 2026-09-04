'use client';

import {
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type SyntheticEvent,
} from 'react';
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  CheckCircle2,
  CircleAlert,
  Download,
  FileSearch,
  Gauge,
  ImageIcon,
  ReceiptText,
  RotateCcw,
  Save,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  UploadCloud,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  calculateSolarPerformance,
  defaultSolarSettings,
  formatKwh,
  formatWon,
  type SolarCalculationSettings,
} from '@/lib/solar-calculations';

type Notify = (message: string) => void;

function ViewHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-7">
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#0b8f87]">
        <Gauge className="size-4" />
        {eyebrow}
      </p>
      <h1 className="text-2xl font-bold tracking-[-0.03em] text-[#172033] sm:text-[28px]">
        {title}
      </h1>
      <p className="mt-2 max-w-3xl text-base leading-7 text-slate-500">
        {description}
      </p>
    </div>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-sm font-semibold text-slate-700">{children}</span>
  );
}

export function InspectionUploadView({
  settings,
  notify,
}: {
  settings: SolarCalculationSettings;
  notify: Notify;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [irradiance, setIrradiance] = useState(742);
  const [wind, setWind] = useState(3.4);
  const [temperature, setTemperature] = useState(26.8);
  const [angleChecked, setAngleChecked] = useState(true);
  const [distanceChecked, setDistanceChecked] = useState(true);
  const [privacyMasked, setPrivacyMasked] = useState(true);
  const [files, setFiles] = useState<string[]>([
    'DJI_00041_R.JPG',
    'DJI_00041_V.JPG',
  ]);
  const valid =
    irradiance >= settings.irradianceMinimum &&
    wind <= settings.windWarning &&
    angleChecked &&
    distanceChecked &&
    privacyMasked &&
    files.length >= 2;

  function addFiles(list: FileList | null) {
    if (!list) return;
    setFiles((current) => [
      ...current,
      ...Array.from(list, (file) => file.name),
    ]);
  }

  return (
    <>
      <ViewHeading
        eyebrow="A-1 점검 데이터 업로드"
        title="촬영 자료와 유효 조건 확인"
        description="열화상·가시광 파일과 촬영 조건을 함께 접수하고, 보고서 발행 가능 여부를 바로 판정합니다."
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_380px]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">촬영 조건</h2>
              <p className="mt-1 text-sm text-slate-500">
                2026. 09. 03. 13:42 · 경기 부천시 · 드론 비행 BEY-260903-01
              </p>
            </div>
            <Badge
              variant="outline"
              className={
                valid
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-red-200 bg-red-50 text-red-700'
              }
            >
              {valid ? '발행 가능' : '유효성 미달'}
            </Badge>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label htmlFor="capture-irradiance" className="grid gap-2">
              <FieldLabel>면내 일사량 (W/m²)</FieldLabel>
              <Input
                id="capture-irradiance"
                type="number"
                value={irradiance}
                onChange={(event) => setIrradiance(Number(event.target.value))}
                className="h-11 rounded-xl"
              />
              <span
                className={`text-sm ${irradiance >= settings.irradianceMinimum ? 'text-emerald-600' : 'text-red-600'}`}
              >
                기준 {settings.irradianceMinimum} 이상
              </span>
            </label>
            <label htmlFor="capture-wind" className="grid gap-2">
              <FieldLabel>풍속 (m/s)</FieldLabel>
              <Input
                id="capture-wind"
                type="number"
                step="0.1"
                value={wind}
                onChange={(event) => setWind(Number(event.target.value))}
                className="h-11 rounded-xl"
              />
              <span
                className={`text-sm ${wind <= settings.windWarning ? 'text-emerald-600' : 'text-amber-700'}`}
              >
                경고 기준 {settings.windWarning} 초과
              </span>
            </label>
            <label htmlFor="capture-temperature" className="grid gap-2">
              <FieldLabel>외기온 (℃)</FieldLabel>
              <Input
                id="capture-temperature"
                type="number"
                step="0.1"
                value={temperature}
                onChange={(event) => setTemperature(Number(event.target.value))}
                className="h-11 rounded-xl"
              />
            </label>
            <label htmlFor="capture-time" className="grid gap-2">
              <FieldLabel>촬영 시각</FieldLabel>
              <Input
                id="capture-time"
                type="datetime-local"
                defaultValue="2026-09-03T13:42"
                className="h-11 rounded-xl"
              />
            </label>
          </div>
          <div className="mt-5 grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-3">
            <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={angleChecked}
                onChange={(event) => setAngleChecked(event.target.checked)}
                className="size-4 accent-[#0b8f87]"
              />
              모듈면 대비 촬영각도 확인
            </label>
            <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={distanceChecked}
                onChange={(event) => setDistanceChecked(event.target.checked)}
                className="size-4 accent-[#0b8f87]"
              />
              촬영거리·초점 확인
            </label>
            <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={privacyMasked}
                onChange={(event) => setPrivacyMasked(event.target.checked)}
                className="size-4 accent-[#0b8f87]"
              />
              차량번호·얼굴 마스킹 확인
            </label>
          </div>
          <div className="mt-6 border-t border-slate-100 pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-bold">열화상·가시광 일괄 업로드</h3>
                <p className="mt-1 text-sm text-slate-500">
                  데모에서는 파일명만 확인하며 서버에 저장하지 않습니다.
                </p>
              </div>
              <>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(event) => addFiles(event.target.files)}
                />
                <Button
                  variant="outline"
                  onClick={() => fileRef.current?.click()}
                  className="rounded-xl"
                >
                  <UploadCloud className="size-4" />
                  파일 추가
                </Button>
              </>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {files.map((file, index) => (
                <div
                  key={`${file}-${index}`}
                  className="flex items-center gap-3 rounded-xl border border-slate-200 p-3"
                >
                  <ImageIcon className="size-4 text-[#0b8f87]" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {file}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {file.includes('_R')
                      ? '열화상'
                      : file.includes('_V')
                        ? '가시광'
                        : '확인 필요'}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        </section>
        <aside className="space-y-4">
          <section
            className={`rounded-2xl border p-5 ${valid ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}
          >
            <div className="flex items-start gap-3">
              {valid ? (
                <CheckCircle2 className="mt-0.5 size-5 text-emerald-600" />
              ) : (
                <CircleAlert className="mt-0.5 size-5 text-red-600" />
              )}
              <div>
                <h2 className="font-bold">
                  {valid ? '촬영 유효 조건 충족' : '리포트 발행 차단'}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {valid
                    ? '일사량·풍속·각도·거리와 열/가시광 파일 구성이 기준을 충족했습니다.'
                    : '미달 조건을 보완하거나 관리자가 재촬영을 요청해야 합니다.'}
                </p>
              </div>
            </div>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="font-bold">자동 확인 결과</h2>
            <div className="mt-4 space-y-3">
              {[
                [irradiance >= settings.irradianceMinimum, '일사량 기준'],
                [wind <= settings.windWarning, '풍속 기준'],
                [angleChecked && distanceChecked, '각도·거리 검수'],
                [privacyMasked, '개인정보 마스킹'],
                [files.length >= 2, '열·가시광 파일'],
              ].map(([ok, label]) => (
                <div
                  key={String(label)}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-slate-600">{label}</span>
                  <span
                    className={`font-semibold ${ok ? 'text-emerald-600' : 'text-red-600'}`}
                  >
                    {ok ? '통과' : '확인 필요'}
                  </span>
                </div>
              ))}
            </div>
            <Button
              disabled={!valid}
              onClick={() =>
                notify(
                  '점검 자료를 접수하고 이상 후보 분석 대기열에 추가했습니다.',
                )
              }
              className="mt-5 w-full rounded-xl bg-[#0b8f87] hover:bg-[#087c76]"
            >
              <ArrowRight className="size-4" />
              분석 단계로 보내기
            </Button>
          </section>
        </aside>
      </div>
    </>
  );
}

export function PerformanceCalculatorView({
  settings,
}: {
  settings: SolarCalculationSettings;
}) {
  const [capacity, setCapacity] = useState(99.8);
  const [installationYear, setInstallationYear] = useState(2019);
  const [actualGeneration, setActualGeneration] = useState(105400);
  const [operationType, setOperationType] = useState<'self-use' | 'generation'>(
    'generation',
  );
  const [repairCost, setRepairCost] = useState(2200000);
  const [improvementRate, setImprovementRate] = useState(0.7);
  const result = useMemo(
    () =>
      calculateSolarPerformance(
        {
          capacityKwp: capacity,
          installationYear,
          actualGenerationKwh: actualGeneration,
          operationType,
          repairCost,
          improvementRate,
        },
        settings,
      ),
    [
      actualGeneration,
      capacity,
      improvementRate,
      installationYear,
      operationType,
      repairCost,
      settings,
    ],
  );
  const statusTone =
    result.prStatus === '정상'
      ? 'text-emerald-600'
      : result.prStatus === '주의'
        ? 'text-amber-700'
        : 'text-red-600';

  return (
    <>
      <ViewHeading
        eyebrow="성능·수익 산출 엔진"
        title="발전 손실과 투자회수기간 계산"
        description="PDF의 계산식을 코드로 실행하고, AI가 아닌 동일한 규칙으로 매번 같은 결과를 만듭니다."
      />
      <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-bold">설비·발전량 입력</h2>
          <div className="mt-5 grid gap-4">
            <label htmlFor="calc-capacity" className="grid gap-2">
              <FieldLabel>설치용량 (kWp)</FieldLabel>
              <Input
                id="calc-capacity"
                type="number"
                step="0.1"
                value={capacity}
                onChange={(event) => setCapacity(Number(event.target.value))}
                className="h-11 rounded-xl"
              />
            </label>
            <label htmlFor="calc-year" className="grid gap-2">
              <FieldLabel>설치연도</FieldLabel>
              <Input
                id="calc-year"
                type="number"
                value={installationYear}
                onChange={(event) =>
                  setInstallationYear(Number(event.target.value))
                }
                className="h-11 rounded-xl"
              />
            </label>
            <label htmlFor="calc-generation" className="grid gap-2">
              <FieldLabel>연간 실발전량 (kWh)</FieldLabel>
              <Input
                id="calc-generation"
                type="number"
                value={actualGeneration}
                onChange={(event) =>
                  setActualGeneration(Number(event.target.value))
                }
                className="h-11 rounded-xl"
              />
            </label>
            <label htmlFor="calc-operation" className="grid gap-2">
              <FieldLabel>운영형태</FieldLabel>
              <select
                id="calc-operation"
                value={operationType}
                onChange={(event) =>
                  setOperationType(
                    event.target.value as 'self-use' | 'generation',
                  )
                }
                className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm"
              >
                <option value="self-use">자가소비형</option>
                <option value="generation">발전사업형</option>
              </select>
            </label>
            <label htmlFor="calc-repair-cost" className="grid gap-2">
              <FieldLabel>예상 수리비 (원)</FieldLabel>
              <Input
                id="calc-repair-cost"
                type="number"
                value={repairCost}
                onChange={(event) => setRepairCost(Number(event.target.value))}
                className="h-11 rounded-xl"
              />
            </label>
            <label htmlFor="calc-improvement" className="grid gap-2">
              <FieldLabel>개선가능비율</FieldLabel>
              <select
                id="calc-improvement"
                value={improvementRate}
                onChange={(event) =>
                  setImprovementRate(Number(event.target.value))
                }
                className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm"
              >
                <option value={0.9}>표면 오염·음영 90%</option>
                <option value={0.95}>스트링 단선 95%</option>
                <option value={1}>인버터 고장 100%</option>
                <option value={0.7}>바이패스 다이오드 70%</option>
                <option value={0.4}>셀 균열·PID 40%</option>
              </select>
            </label>
          </div>
        </section>
        <div className="space-y-5">
          <section className="overflow-hidden rounded-2xl bg-[#172b4b] p-6 text-white">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm text-white/60">성능비</p>
                <p className="mt-1 text-4xl font-bold">
                  {(result.performanceRatio * 100).toFixed(1)}%
                </p>
              </div>
              <Badge
                className={`${result.prStatus === '정상' ? 'bg-emerald-400/15 text-emerald-200' : result.prStatus === '주의' ? 'bg-amber-400/15 text-amber-200' : 'bg-red-400/15 text-red-200'}`}
              >
                {result.prStatus}
              </Badge>
            </div>
            <Progress
              value={Math.min(100, result.performanceRatio * 100)}
              className="mt-6 h-2 bg-white/10 [&>div]:bg-[#7dd8d1]"
            />
            <p className="mt-3 text-sm text-white/55">
              정상 {(settings.prNormal * 100).toFixed(0)}% 이상 · 주의{' '}
              {(settings.prWarning * 100).toFixed(0)}% 이상
            </p>
          </section>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[
              ['기대발전량', formatKwh(result.expectedGenerationKwh)],
              ['연간 손실량', formatKwh(result.lossKwh)],
              ['적용단가', `${result.tariff.toLocaleString('ko-KR')}원/kWh`],
              ['연간 기대수익', formatWon(result.expectedRevenue)],
              ['연간 손실금액', formatWon(result.lossAmount)],
              [
                '예상 회수기간',
                result.paybackYears === null
                  ? '산정 불가'
                  : `${result.paybackYears.toFixed(1)}년`,
              ],
            ].map(([label, value]) => (
              <article
                key={label}
                className="rounded-2xl border border-slate-200 bg-white p-4"
              >
                <p className="text-sm text-slate-500">{label}</p>
                <p
                  className={`mt-2 text-lg font-bold ${label === '연간 손실금액' ? statusTone : ''}`}
                >
                  {value}
                </p>
              </article>
            ))}
          </section>
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <div className="flex gap-3">
              <CircleAlert className="mt-0.5 size-5 shrink-0 text-amber-700" />
              <p className="text-sm leading-6 text-amber-900">
                본 금액은 관리자 설정과 입력 자료를 이용한 추정치이며 실제
                발전량·수익·수리 효과와 다를 수 있습니다. 계산 기준 판본:
                DEMO-2026.09.
              </p>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

const quoteRows = [
  {
    id: 'Q-01',
    company: '한빛O&M',
    amount: 1850000,
    period: '접수 후 5일',
    rating: 4.8,
    license: '전기공사업',
  },
  {
    id: 'Q-02',
    company: '새빛전기',
    amount: 2140000,
    period: '접수 후 3일',
    rating: 4.6,
    license: '전기공사업',
  },
  {
    id: 'Q-03',
    company: '그린케어솔루션',
    amount: 1690000,
    period: '접수 후 8일',
    rating: 4.7,
    license: '태양광 유지보수',
  },
];

export function PartnerQuotesView({
  notify,
  customerMode = false,
  commissionRatePercent = 3,
}: {
  notify: Notify;
  customerMode?: boolean;
  commissionRatePercent?: number;
}) {
  const [requested, setRequested] = useState(true);
  const [selected, setSelected] = useState('');
  const choice = quoteRows.find((quote) => quote.id === selected);
  return (
    <>
      <ViewHeading
        eyebrow={
          customerMode ? 'C-4 견적 요청·비교' : 'A-4 업체 매칭·견적 관리'
        }
        title="유지보수 업체 3곳 견적 비교"
        description="진단 조치 항목에 맞는 업체를 추천하고 금액·기간·평점·수수료를 한 화면에서 비교합니다."
      />
      <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="grid gap-4 lg:grid-cols-[1.2fr_.8fr_auto] lg:items-center">
          <div>
            <p className="text-sm text-slate-500">대상 설비</p>
            <h2 className="mt-1 font-bold">시민햇빛 7호 · 3번 스트링 접속부</h2>
          </div>
          <div>
            <p className="text-sm text-slate-500">권고 조치</p>
            <p className="mt-1 font-semibold">접속부 정밀진단·재체결</p>
          </div>
          <Button
            onClick={() => {
              setRequested(true);
              notify(
                '추천 업체 3곳에 견적 요청을 발송한 데모 상태로 전환했습니다.',
              );
            }}
            className="rounded-xl bg-[#0b8f87] hover:bg-[#087c76]"
          >
            <Send className="size-4" />
            3곳에 요청
          </Button>
        </div>
      </section>
      {requested ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {quoteRows.map((quote) => (
            <button
              key={quote.id}
              onClick={() => setSelected(quote.id)}
              className={`rounded-2xl border bg-white p-5 text-left transition ${selected === quote.id ? 'border-[#0b8f87] ring-2 ring-[#0b8f87]/15' : 'border-slate-200 hover:border-slate-300'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold">{quote.company}</p>
                  <p className="mt-1 text-sm text-slate-500">{quote.license}</p>
                </div>
                {selected === quote.id ? (
                  <CheckCircle2 className="size-5 text-[#0b8f87]" />
                ) : (
                  <Badge variant="outline">★ {quote.rating}</Badge>
                )}
              </div>
              <p className="mt-6 text-2xl font-bold">
                {formatWon(quote.amount)}
              </p>
              <div className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-sm text-slate-600">
                <p className="flex items-center justify-between">
                  <span>작업기간</span>
                  <strong>{quote.period}</strong>
                </p>
                <p className="flex items-center justify-between">
                  <span>수수료 {commissionRatePercent}%</span>
                  <strong>
                    {formatWon((quote.amount * commissionRatePercent) / 100)}
                  </strong>
                </p>
              </div>
            </button>
          ))}
        </div>
      ) : null}
      <section className="mt-5 flex flex-col justify-between gap-4 rounded-2xl bg-[#172b4b] p-5 text-white sm:flex-row sm:items-center">
        <div>
          <p className="text-sm text-white/55">선택 결과</p>
          <p className="mt-1 font-bold">
            {choice
              ? `${choice.company} · ${formatWon(choice.amount)} · ${choice.period}`
              : '비교할 업체를 선택하세요.'}
          </p>
        </div>
        <Button
          disabled={!choice}
          onClick={() =>
            choice &&
            notify(
              `${choice.company} 견적을 선택했습니다. 수수료 ${formatWon((choice.amount * commissionRatePercent) / 100)}이 기록됩니다.`,
            )
          }
          className="rounded-xl bg-white text-[#172b4b] hover:bg-white/90"
        >
          {customerMode ? '이 견적 선택' : '선택·수수료 확정'}
          <ArrowRight className="size-4" />
        </Button>
      </section>
    </>
  );
}

export function SettingsManagementView({
  settings,
  setSettings,
  notify,
}: {
  settings: SolarCalculationSettings;
  setSettings: (next: SolarCalculationSettings) => void;
  notify: Notify;
}) {
  const [draft, setDraft] = useState(settings);
  const [version, setVersion] = useState('SET-2026.09-v1');
  const fields: Array<[keyof SolarCalculationSettings, string, string]> = [
    ['sunHours', '일평균 발전시간', 'h'],
    ['degradationRatePercent', '연간 열화율', '%'],
    ['selfUseTariff', '자가소비 절감단가', '원/kWh'],
    ['smp', 'SMP', '원/kWh'],
    ['rec', 'REC 단가', '원/kWh'],
    ['recWeight', 'REC 가중치', '배'],
    ['prNormal', 'PR 정상 경계', '비율'],
    ['prWarning', 'PR 주의 경계', '비율'],
    ['irradianceMinimum', '최소 일사량', 'W/m²'],
    ['windWarning', '풍속 경고값', 'm/s'],
    ['commissionRatePercent', '견적 수수료율', '%'],
  ];
  function save() {
    setSettings(draft);
    setVersion((current) =>
      current.endsWith('v1') ? 'SET-2026.09-v2' : 'SET-2026.09-v3',
    );
    notify('설정값 새 판본을 저장했습니다. 이후 계산부터 적용됩니다.');
  }
  return (
    <>
      <ViewHeading
        eyebrow="A-6 설정값 관리"
        title="계산·판정 기준을 코드 수정 없이 관리"
        description="발전시간, 열화율, 단가, PR 구간과 촬영 임계값을 변경하고 적용 판본을 남깁니다."
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="grid grid-cols-[1fr_150px_90px] gap-3 border-b border-slate-100 bg-slate-50 px-5 py-3 text-sm font-bold text-slate-500">
            <span>설정 항목</span>
            <span>값</span>
            <span>단위</span>
          </div>
          {fields.map(([key, label, unit]) => (
            <label
              htmlFor={`setting-${key}`}
              key={key}
              className="grid grid-cols-[1fr_150px_90px] items-center gap-3 border-b border-slate-100 px-5 py-3 last:border-0"
            >
              <span className="text-sm font-medium">{label}</span>
              <Input
                id={`setting-${key}`}
                type="number"
                step="0.01"
                value={draft[key]}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    [key]: Number(event.target.value),
                  }))
                }
                className="h-9 rounded-lg"
              />
              <span className="text-sm text-slate-400">{unit}</span>
            </label>
          ))}
        </section>
        <aside className="space-y-4">
          <section className="rounded-2xl bg-[#172b4b] p-5 text-white">
            <Settings2 className="size-6 text-[#7dd8d1]" />
            <p className="mt-5 text-sm text-white/55">현재 작업 판본</p>
            <p className="mt-1 text-lg font-bold">{version}</p>
            <p className="mt-4 text-sm leading-6 text-white/55">
              기존 보고서는 저장 당시 판본을 유지합니다. 변경값은 새 계산부터
              적용됩니다.
            </p>
            <Button
              onClick={save}
              className="mt-5 w-full rounded-xl bg-white text-[#172b4b] hover:bg-white/90"
            >
              <Save className="size-4" />새 판본 저장
            </Button>
          </section>
          <Button
            variant="outline"
            onClick={() => setDraft(defaultSolarSettings)}
            className="w-full rounded-xl bg-white"
          >
            <RotateCcw className="size-4" />
            PDF 기본값 불러오기
          </Button>
        </aside>
      </div>
    </>
  );
}

export function FacilityRegistrationView({ notify }: { notify: Notify }) {
  const [submitted, setSubmitted] = useState(false);
  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    notify('설비 등록 데모가 완료되었습니다.');
  }
  return (
    <>
      <ViewHeading
        eyebrow="C-1 설비 등록"
        title="내 태양광 설비 등록"
        description="진단 계산과 현장점검에 필요한 설비 기본정보를 등록합니다."
      />
      <form
        onSubmit={submit}
        className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]"
      >
        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label htmlFor="facility-name" className="grid gap-2">
              <FieldLabel>설비명</FieldLabel>
              <Input
                id="facility-name"
                required
                defaultValue="우리집 태양광"
                className="h-11 rounded-xl"
              />
            </label>
            <label htmlFor="facility-address" className="grid gap-2">
              <FieldLabel>주소</FieldLabel>
              <Input
                id="facility-address"
                required
                defaultValue="경기 부천시 원미구"
                className="h-11 rounded-xl"
              />
            </label>
            <label htmlFor="facility-capacity" className="grid gap-2">
              <FieldLabel>설치용량 (kWp)</FieldLabel>
              <Input
                id="facility-capacity"
                required
                type="number"
                defaultValue="12.4"
                className="h-11 rounded-xl"
              />
            </label>
            <label htmlFor="facility-year" className="grid gap-2">
              <FieldLabel>설치연도</FieldLabel>
              <Input
                id="facility-year"
                required
                type="number"
                defaultValue="2021"
                className="h-11 rounded-xl"
              />
            </label>
            <label htmlFor="facility-panel" className="grid gap-2">
              <FieldLabel>패널 제조사·모델</FieldLabel>
              <Input
                id="facility-panel"
                defaultValue="한화큐셀 Q.PEAK"
                className="h-11 rounded-xl"
              />
            </label>
            <label htmlFor="facility-inverter" className="grid gap-2">
              <FieldLabel>인버터 제조사·모델</FieldLabel>
              <Input
                id="facility-inverter"
                defaultValue="금비전자 GBI-12K"
                className="h-11 rounded-xl"
              />
            </label>
            <label htmlFor="facility-operation" className="grid gap-2">
              <FieldLabel>운영형태</FieldLabel>
              <select
                id="facility-operation"
                className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm"
              >
                <option>자가소비형</option>
                <option>발전사업형</option>
              </select>
            </label>
            <label htmlFor="facility-type" className="grid gap-2">
              <FieldLabel>설비유형</FieldLabel>
              <select
                id="facility-type"
                className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm"
              >
                <option>옥상형</option>
                <option>건물형</option>
                <option>베란다형</option>
              </select>
            </label>
          </div>
          <label className="mt-5 flex items-start gap-3 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
            <input
              required
              type="checkbox"
              className="mt-1 size-4 accent-[#0b8f87]"
            />
            진단 서비스 제공을 위한 설비정보·주소·사진의 수집 및 이용에
            동의합니다.
          </label>
        </section>
        <aside className="space-y-4">
          <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-center">
            <UploadCloud className="mx-auto size-7 text-[#0b8f87]" />
            <label htmlFor="facility-photos" className="mt-3 block font-bold">
              설비 사진 업로드
            </label>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              정면, 인버터 명판, 배치가 보이는 사진을 선택하세요.
            </p>
            <Input
              id="facility-photos"
              type="file"
              accept="image/*"
              multiple
              className="mt-4"
            />
          </section>
          <Button
            type="submit"
            className="w-full rounded-xl bg-[#0b8f87] hover:bg-[#087c76]"
          >
            <Building2 className="size-4" />
            설비 등록 완료
          </Button>
          {submitted ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
              <CheckCircle2 className="mb-2 size-5" />
              설비번호 FAC-DEMO-012가 생성됐습니다.
            </div>
          ) : null}
        </aside>
      </form>
    </>
  );
}

export function QuickDiagnosisView({
  settings,
  notify,
}: {
  settings: SolarCalculationSettings;
  notify: Notify;
}) {
  const [fileName, setFileName] = useState('');
  const [capacity, setCapacity] = useState(12.4);
  const [actualGeneration, setActualGeneration] = useState(12800);
  const [diagnosed, setDiagnosed] = useState(false);
  const result = calculateSolarPerformance(
    {
      capacityKwp: capacity,
      installationYear: 2021,
      actualGenerationKwh: actualGeneration,
      operationType: 'self-use',
      repairCost: 420000,
      improvementRate: 0.9,
    },
    settings,
  );
  return (
    <>
      <ViewHeading
        eyebrow="C-2 무료 AI 진단"
        title="고지서로 발전효율 간이 확인"
        description="고지서 판독값과 설비 정보를 확인한 뒤 예상 발전량과 현재 차이를 간단히 계산합니다."
      />
      <div className="grid gap-5 xl:grid-cols-[440px_minmax(0,1fr)]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <label className="grid min-h-44 cursor-pointer place-items-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
            <ReceiptText className="size-8 text-[#0b8f87]" />
            <span className="mt-3 font-bold">전기요금 고지서 이미지</span>
            <span className="mt-1 text-sm text-slate-500">
              JPG·PNG·PDF를 선택하세요.
            </span>
            <input
              type="file"
              accept="image/*,application/pdf"
              className="sr-only"
              onChange={(event) =>
                setFileName(event.target.files?.[0]?.name ?? '')
              }
            />
          </label>
          {fileName ? (
            <p className="mt-3 truncate text-sm font-medium text-slate-600">
              선택: {fileName}
            </p>
          ) : null}
          <Button
            onClick={() => {
              setCapacity(12.4);
              setActualGeneration(12800);
              setDiagnosed(true);
              notify('고지서 판독 데모값을 확인하고 간이 진단을 계산했습니다.');
            }}
            className="mt-4 w-full rounded-xl bg-[#172b4b] hover:bg-[#213b64]"
          >
            <Sparkles className="size-4" />
            {fileName ? '판독 데모 실행' : '샘플 고지서로 실행'}
          </Button>
          <div className="mt-5 grid gap-4">
            <label htmlFor="diagnosis-capacity" className="grid gap-2">
              <FieldLabel>확인된 설치용량 (kWp)</FieldLabel>
              <Input
                id="diagnosis-capacity"
                type="number"
                step="0.1"
                value={capacity}
                onChange={(event) => setCapacity(Number(event.target.value))}
                className="h-11 rounded-xl"
              />
            </label>
            <label htmlFor="diagnosis-generation" className="grid gap-2">
              <FieldLabel>최근 1년 발전량 (kWh)</FieldLabel>
              <Input
                id="diagnosis-generation"
                type="number"
                value={actualGeneration}
                onChange={(event) =>
                  setActualGeneration(Number(event.target.value))
                }
                className="h-11 rounded-xl"
              />
            </label>
          </div>
        </section>
        <section className="rounded-2xl bg-[#172b4b] p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white/55">간이 진단 결과</p>
              <p className="mt-2 text-3xl font-bold">
                {diagnosed ? result.prStatus : '분석 전'}
              </p>
            </div>
            <FileSearch className="size-8 text-[#7dd8d1]" />
          </div>
          {diagnosed ? (
            <>
              <div className="mt-7 grid gap-3 sm:grid-cols-2">
                {[
                  ['성능비', `${(result.performanceRatio * 100).toFixed(1)}%`],
                  ['예상 발전량', formatKwh(result.expectedGenerationKwh)],
                  ['예상 손실금액', formatWon(result.lossAmount)],
                  ['청소 후 회수가능액', formatWon(result.recoverableAmount)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl bg-white/[.06] p-4">
                    <p className="text-sm text-white/50">{label}</p>
                    <p className="mt-2 text-lg font-bold">{value}</p>
                  </div>
                ))}
              </div>
              <p className="mt-6 rounded-xl bg-amber-300/10 p-4 text-sm leading-6 text-amber-100">
                간이 추정치이며 실제 진단이 아닙니다. 정확한 판단은 드론 촬영
                자료와 전문가 검수가 필요합니다.
              </p>
            </>
          ) : (
            <div className="mt-8 rounded-2xl border border-dashed border-white/15 py-20 text-center text-sm text-white/45">
              고지서를 선택하거나 샘플을 실행하면 결과가 표시됩니다.
            </div>
          )}
        </section>
      </div>
    </>
  );
}

export function CustomerMyPageView({ notify }: { notify: Notify }) {
  return (
    <>
      <ViewHeading
        eyebrow="C-5 마이페이지"
        title="점검·견적·조치 이력"
        description="내 설비의 진단 진행상태와 발행 문서, 재활용 인증서를 시간순으로 확인합니다."
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-bold">해오름 제2발전소 타임라인</h2>
          <div className="mt-6 space-y-0">
            {[
              [
                '2026.09.04',
                '유지보수 견적 3건 도착',
                '금액·기간·평점을 비교할 수 있습니다.',
              ],
              [
                '2026.09.03',
                '진단보고서 v1.0 발행',
                '전문가 승인 후 고객에게 공개됐습니다.',
              ],
              [
                '2026.09.02',
                '이상 후보 3건 관리자 확정',
                '접속부 과열 1건은 우선조치로 분류됐습니다.',
              ],
              [
                '2026.09.01',
                '열화상·가시광 촬영자료 접수',
                '촬영 유효 조건을 통과했습니다.',
              ],
            ].map(([date, title, body], index) => (
              <div key={title} className="grid grid-cols-[26px_1fr] gap-3">
                <div className="flex flex-col items-center">
                  <span
                    className={`mt-1 size-3 rounded-full ${index === 0 ? 'bg-[#0b8f87]' : 'bg-slate-300'}`}
                  />
                  {index < 3 ? (
                    <span className="min-h-20 w-px bg-slate-200" />
                  ) : null}
                </div>
                <div className="pb-7">
                  <p className="text-sm text-slate-400">{date}</p>
                  <h3 className="mt-1 font-bold">{title}</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    {body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
        <aside className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <BadgeCheck className="size-7 text-[#0b8f87]" />
            <p className="mt-4 text-sm text-slate-500">폐패널 재활용 인증서</p>
            <h2 className="mt-1 font-bold">RECYCLE-2026-0018</h2>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              모듈 4매 · 2026.08.18 처리 · 순환자원센터
            </p>
            <Button
              variant="outline"
              onClick={() => notify('재활용 인증서 조회 화면을 열었습니다.')}
              className="mt-5 w-full rounded-xl"
            >
              <Download className="size-4" />
              인증서 조회
            </Button>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <ShieldCheck className="size-6 text-[#31486c]" />
            <h2 className="mt-4 font-bold">개인정보·동의 관리</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              설비 등록 동의일 2026.09.01 · 적용 약관 v1.0
            </p>
            <Button
              variant="ghost"
              onClick={() => notify('동의 내역을 확인했습니다.')}
              className="mt-3 px-0 text-[#0b8f87]"
            >
              동의 내역 확인 <ArrowRight className="size-4" />
            </Button>
          </section>
        </aside>
      </div>
    </>
  );
}

export function RfpCoverageView() {
  const items = [
    ['A-1', '점검 데이터 업로드·유효성', '구현'],
    ['A-2', '이상 태깅·관리자 확정', '구현'],
    ['A-3', '리포트 승인·발행', '구현'],
    ['A-4', '업체 3곳 견적·수수료', '구현'],
    ['A-5', '설비·고객·업체 기준정보', '구현'],
    ['A-6', '설정값 판본 관리', '구현'],
    ['C-1', '설비 등록·동의', '구현'],
    ['C-2', '고지서 간이 진단', '구현'],
    ['C-3', '진단 리포트·PDF 저장', '구현'],
    ['C-4', '견적 비교·선택', '구현'],
    ['C-5', '점검 이력·재활용 인증서', '구현'],
  ];
  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-semibold text-[#0b8f87]">
            PDF 화면 요구사항
          </p>
          <h2 className="mt-1 text-lg font-bold">11개 화면 데모 대응</h2>
        </div>
        <Badge className="w-fit bg-emerald-50 text-emerald-700">
          11 / 11 화면
        </Badge>
      </div>
      <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {items.map(([id, label, status]) => (
          <div
            key={id}
            className="flex items-center gap-3 rounded-xl bg-slate-50 p-3"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white text-sm font-bold text-[#0b8f87]">
              {id}
            </span>
            <span className="min-w-0 flex-1 text-sm font-medium text-slate-700">
              {label}
            </span>
            <span className="text-xs font-semibold text-emerald-600">
              {status}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-500">
        현재는 비용 없는 샘플 데이터 데모입니다. 실제 Claude API, 방사온도 원본
        파서, 운영 Supabase 저장과 외부 업체 발송은 계정·샘플·운영 기준 확정 후
        연결합니다.
      </p>
    </section>
  );
}
