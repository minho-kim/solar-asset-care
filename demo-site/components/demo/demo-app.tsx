'use client';

import NextImage from 'next/image';
import {
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type SyntheticEvent,
} from 'react';
import {
  Activity,
  ArrowRight,
  Bell,
  Building2,
  CalendarDays,
  Calculator,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  ClipboardCheck,
  ClipboardPlus,
  Clock3,
  Cloud,
  Database,
  Download,
  Eye,
  FileCheck2,
  FileText,
  Gauge,
  Handshake,
  ImageIcon,
  LayoutDashboard,
  MapPin,
  Menu,
  PanelTop,
  Plus,
  RefreshCw,
  Search,
  Settings,
  SlidersHorizontal,
  ShieldCheck,
  Sparkles,
  SunMedium,
  ThermometerSun,
  UploadCloud,
  UserCheck,
  Users,
  Wrench,
  X,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import {
  AppRole,
  inspections as seedInspections,
  maintenance,
  plants,
  reports,
} from '@/lib/demo-data';
import { defaultSolarSettings } from '@/lib/solar-calculations';
import { backendConfig } from '@/lib/supabase/client';
import {
  CustomerMyPageView,
  FacilityRegistrationView,
  InspectionUploadView,
  PartnerQuotesView,
  PerformanceCalculatorView,
  QuickDiagnosisView,
  RfpCoverageView,
  SettingsManagementView,
} from '@/components/demo/rfp-views';

type View =
  | 'dashboard'
  | 'inspections'
  | 'inspection-upload'
  | 'assets'
  | 'thermal'
  | 'performance'
  | 'reports'
  | 'quotes'
  | 'maintenance'
  | 'settings'
  | 'facility-register'
  | 'quick-diagnosis'
  | 'customer'
  | 'mypage';

type Region = {
  id: string;
  kind: 'hot' | 'cold';
  x: number;
  y: number;
  width: number;
  height: number;
  areaPercent: number;
  score: number;
};

type AnalysisResult = {
  disclaimer: string;
  summary: {
    heatIndex: number;
    contrast: number;
    hotCandidates: number;
    coldCandidates: number;
  };
  thresholds: { hot: number; cold: number };
  regions: Region[];
  analyzedAt: string;
};

const anomalyTypes = [
  '단일 셀 핫스팟',
  '서브모듈 과열',
  '모듈 전체 과열',
  '스트링 전체 이상',
  '접속함·인버터 과열',
  '표면 오염·음영',
  'PID·열화',
];

function suggestedAnomaly(region: Region) {
  if (region.kind === 'cold')
    return {
      type: '표면 오염·음영',
      delta: 5.2,
      action: '청소 서비스 / 수목 정리',
    };
  if (region.score >= 86)
    return { type: '접속함·인버터 과열', delta: 12.4, action: '긴급 유지보수' };
  if (region.score >= 76)
    return { type: '단일 셀 핫스팟', delta: 10.8, action: '정밀진단' };
  return { type: '서브모듈 과열', delta: 9.6, action: '모듈 교체 검토' };
}

const navigation: Array<{
  id: View;
  label: string;
  icon: typeof LayoutDashboard;
  count?: number;
}> = [
  { id: 'dashboard', label: '운영 현황', icon: LayoutDashboard },
  { id: 'inspections', label: '검사 관리', icon: ClipboardCheck, count: 8 },
  { id: 'inspection-upload', label: '점검 업로드', icon: ClipboardPlus },
  { id: 'thermal', label: '이미지 검토', icon: ImageIcon, count: 3 },
  { id: 'performance', label: '성과·수익 산출', icon: Calculator },
  { id: 'reports', label: '보고서', icon: FileCheck2, count: 2 },
  { id: 'quotes', label: '업체·견적 관리', icon: Handshake, count: 3 },
  { id: 'assets', label: '기준정보 관리', icon: Building2 },
  { id: 'maintenance', label: '조치 이력', icon: Wrench, count: 4 },
  { id: 'settings', label: '설정값 관리', icon: SlidersHorizontal },
];

const roleLabels: Record<AppRole, string> = {
  operator: '운영 관리자',
  expert: '진단 전문가',
  client: '고객 사용자',
};

function statusClass(tone: string) {
  if (tone === 'amber') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (tone === 'blue') return 'border-blue-200 bg-blue-50 text-blue-700';
  if (tone === 'green')
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (tone === 'violet')
    return 'border-violet-200 bg-violet-50 text-violet-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-[#0b8f87]">
          <Gauge className="size-4" />
          {eyebrow}
        </p>
        <h1 className="text-2xl font-bold tracking-[-0.03em] text-[#172033] sm:text-[28px]">
          {title}
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-500">
          {description}
        </p>
      </div>
      {action}
    </div>
  );
}

function MetricCard({
  label,
  value,
  unit,
  note,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  unit: string;
  note: string;
  icon: typeof Activity;
  tone: string;
}) {
  return (
    <article className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,.02)]">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="mt-1 text-[26px] font-bold tracking-tight text-[#172033]">
            {value}
            <span className="ml-1 text-xs font-semibold text-slate-400">
              {unit}
            </span>
          </p>
        </div>
        <span className={`metric-icon metric-${tone}`}>
          <Icon className="size-[18px]" />
        </span>
      </div>
      <p className="mt-3 flex items-center gap-1 text-[11px] font-medium text-slate-400">
        <ArrowRight className="size-3" />
        {note}
      </p>
    </article>
  );
}

function NewInspectionDialog({
  onCreate,
}: {
  onCreate: (item: (typeof seedInspections)[number]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [plant, setPlant] = useState('해오름 제2발전소');
  const [purpose, setPurpose] = useState('정기 열화상 점검');
  const [schedule, setSchedule] = useState('2026-09-08T10:00');

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const now = Date.now().toString().slice(-4);
    onCreate({
      id: `INSP-2609-${now}`,
      plant,
      client: plant.includes('해오름') ? '에너지이음 협동조합' : '부천시민햇빛',
      location: '경기 부천시',
      status: '접수 완료',
      statusTone: 'blue',
      progress: 8,
      task: purpose,
      due: new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul',
        month: 'long',
        day: 'numeric',
      }).format(new Date(`${schedule}:00+09:00`)),
      files: 0,
      expert: '미배정',
    });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button className="h-11 rounded-xl bg-[#0b8f87] px-4 font-semibold text-white shadow-[0_8px_24px_rgba(11,143,135,.22)] hover:bg-[#087c76]" />
        }
      >
        <Plus className="mr-1 size-4" />새 검사 접수
      </DialogTrigger>
      <DialogContent className="rounded-2xl sm:max-w-[520px]">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>새 검사 접수</DialogTitle>
            <DialogDescription>
              발전소와 촬영 일정을 등록합니다. 데모에서는 화면에만 추가됩니다.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-5">
            <label
              htmlFor="inspection-plant"
              className="grid gap-2 text-xs font-semibold text-slate-600"
            >
              발전소
              <select
                id="inspection-plant"
                value={plant}
                onChange={(event) => setPlant(event.target.value)}
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium outline-none focus:border-[#0b8f87]"
              >
                {plants.map((item) => (
                  <option key={item.name}>{item.name}</option>
                ))}
              </select>
            </label>
            <label
              htmlFor="inspection-purpose"
              className="grid gap-2 text-xs font-semibold text-slate-600"
            >
              검사 목적
              <Input
                id="inspection-purpose"
                value={purpose}
                onChange={(event) => setPurpose(event.target.value)}
                required
                className="rounded-xl"
              />
            </label>
            <label
              htmlFor="inspection-schedule"
              className="grid gap-2 text-xs font-semibold text-slate-600"
            >
              촬영 예정 시각
              <Input
                id="inspection-schedule"
                type="datetime-local"
                value={schedule}
                onChange={(event) => setSchedule(event.target.value)}
                required
                className="rounded-xl"
              />
              <span className="font-normal leading-5 text-slate-400">
                입력은 한국 시간(Asia/Seoul), 저장 시 UTC 절대시각으로
                변환합니다.
              </span>
            </label>
            <label
              htmlFor="inspection-note"
              className="grid gap-2 text-xs font-semibold text-slate-600"
            >
              요청 메모
              <Textarea
                id="inspection-note"
                placeholder="출입 절차, 촬영 시 주의사항 등을 적어주세요."
                className="min-h-20 rounded-xl"
              />
            </label>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              className="rounded-xl"
            >
              취소
            </Button>
            <Button
              type="submit"
              className="rounded-xl bg-[#0b8f87] hover:bg-[#087c76]"
            >
              접수 만들기
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DashboardView({
  onNavigate,
  onCreate,
}: {
  onNavigate: (view: View) => void;
  onCreate: (item: (typeof seedInspections)[number]) => void;
}) {
  return (
    <>
      <PageHeading
        eyebrow="2026년 9월 4일 · 운영 현황"
        title="좋은 아침이에요, 김하늘님"
        description="검토가 필요한 검사 8건과 승인 대기 보고서 2건이 있습니다."
        action={<NewInspectionDialog onCreate={onCreate} />}
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="진행 중 검사"
          value="12"
          unit="건"
          note="이번 주 +4건"
          icon={Activity}
          tone="cyan"
        />
        <MetricCard
          label="검토 대기"
          value="8"
          unit="건"
          note="기한 임박 2건"
          icon={ThermometerSun}
          tone="orange"
        />
        <MetricCard
          label="발행 대기"
          value="2"
          unit="건"
          note="승인 요청됨"
          icon={FileCheck2}
          tone="violet"
        />
        <MetricCard
          label="후속 조치"
          value="4"
          unit="건"
          note="완료 예정 1건"
          icon={Wrench}
          tone="emerald"
        />
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,.7fr)]">
        <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-sm font-bold">우선 처리할 검사</h2>
              <p className="mt-0.5 text-[11px] text-slate-400">
                기한과 현재 단계 기준으로 정렬했습니다.
              </p>
            </div>
            <Button
              variant="ghost"
              onClick={() => onNavigate('inspections')}
              className="h-8 rounded-lg text-xs font-semibold text-[#0b8f87]"
            >
              전체 보기 <ArrowRight className="ml-1 size-3.5" />
            </Button>
          </div>
          <div className="divide-y divide-slate-100">
            {seedInspections.slice(0, 3).map((inspection) => (
              <button
                key={inspection.id}
                onClick={() =>
                  onNavigate(
                    inspection.status.includes('전문가')
                      ? 'thermal'
                      : 'inspections',
                  )
                }
                className="grid w-full gap-4 px-5 py-4 text-left transition hover:bg-slate-50/70 md:grid-cols-[minmax(0,1.2fr)_minmax(180px,.7fr)_90px] md:items-center"
              >
                <div className="min-w-0">
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-bold text-[#22304a]">
                      {inspection.plant}
                    </span>
                    <Badge
                      variant="outline"
                      className={`h-5 rounded-full px-2 text-[9px] font-bold ${statusClass(inspection.statusTone)}`}
                    >
                      {inspection.status}
                    </Badge>
                  </div>
                  <p className="truncate text-[11px] text-slate-400">
                    {inspection.id} · {inspection.client}
                  </p>
                  <p className="mt-2 flex items-center gap-1 text-[11px] text-slate-500">
                    <MapPin className="size-3" />
                    {inspection.location}
                  </p>
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between text-[11px]">
                    <span className="font-medium text-slate-600">
                      {inspection.task}
                    </span>
                    <span className="font-bold text-slate-400">
                      {inspection.progress}%
                    </span>
                  </div>
                  <Progress
                    value={inspection.progress}
                    className="h-1.5 bg-slate-100 [&>div]:bg-[#0b8f87]"
                  />
                </div>
                <div className="flex items-center justify-between md:block md:text-right">
                  <p className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 md:justify-end">
                    <CalendarDays className="size-3" />
                    {inspection.due}
                  </p>
                  <ArrowRight className="mt-3 ml-auto hidden size-4 text-slate-300 md:block" />
                </div>
              </button>
            ))}
          </div>
        </section>
        <aside className="space-y-5">
          <section className="rounded-2xl bg-[#172b4b] p-5 text-white shadow-[0_16px_35px_rgba(23,43,75,.16)]">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#7dd8d1]">
                  오늘의 흐름
                </p>
                <h2 className="mt-1 text-sm font-bold">검사 처리 단계</h2>
              </div>
              <PanelTop className="size-5 text-white/45" />
            </div>
            <div className="space-y-4">
              {(
                [
                  ['접수·촬영', 4, 'bg-cyan-400'],
                  ['품질·짝 확인', 3, 'bg-sky-400'],
                  ['전문가 판정', 3, 'bg-amber-400'],
                  ['승인·발행', 2, 'bg-violet-400'],
                ] as const
              ).map(([label, count, color]) => (
                <div
                  key={label}
                  className="grid grid-cols-[88px_1fr_20px] items-center gap-3 text-[11px]"
                >
                  <span className="font-medium text-white/75">{label}</span>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className={`h-full rounded-full ${color}`}
                      style={{ width: `${24 + count * 15}%` }}
                    />
                  </div>
                  <span className="text-right font-bold">{count}</span>
                </div>
              ))}
            </div>
            <button
              onClick={() => onNavigate('inspections')}
              className="mt-5 flex w-full items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/[.06] py-2.5 text-xs font-semibold text-white/85 transition hover:bg-white/10"
            >
              단계별 현황 보기 <ArrowRight className="size-3.5" />
            </button>
          </section>
          <section className="rounded-2xl border border-slate-200/80 bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-bold">최근 완료</h2>
              <span className="text-[10px] text-slate-400">최근 7일</span>
            </div>
            <div className="space-y-4">
              {[
                ['시민햇빛 3호 보고서 발행', '10분 전'],
                ['온누리 공장 전문가 판정', '1시간 전'],
                ['대성물류 재촬영 자료 접수', '어제'],
              ].map(([label, time]) => (
                <div key={label} className="flex gap-3">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#15a097]" />
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-semibold text-slate-600">
                      {label}
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-400">{time}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
      <RfpCoverageView />
    </>
  );
}

function InspectionsView({
  rows,
  onCreate,
  onNavigate,
}: {
  rows: typeof seedInspections;
  onCreate: (item: (typeof seedInspections)[number]) => void;
  onNavigate: (view: View) => void;
}) {
  const [filter, setFilter] = useState('전체');
  const filtered =
    filter === '전체'
      ? rows
      : rows.filter((item) => item.status.includes(filter));
  return (
    <>
      <PageHeading
        eyebrow="검사 운영"
        title="검사 접수와 진행 현황"
        description="촬영 준비부터 파일 확인, 전문가 판정과 발행까지 검사 한 건의 현재 위치를 추적합니다."
        action={<NewInspectionDialog onCreate={onCreate} />}
      />
      <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="검사번호, 발전소, 고객사 검색"
            className="rounded-xl border-slate-200 bg-slate-50 pl-9"
          />
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {['전체', '파일', '전문가', '승인'].map((item) => (
            <Button
              key={item}
              size="sm"
              variant={filter === item ? 'default' : 'ghost'}
              onClick={() => setFilter(item)}
              className={`rounded-lg text-xs ${filter === item ? 'bg-[#172b4b]' : 'text-slate-500'}`}
            >
              {item}
            </Button>
          ))}
        </div>
      </div>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="hidden grid-cols-[1.25fr_.8fr_.65fr_.55fr_80px] gap-4 border-b border-slate-100 bg-slate-50/70 px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 md:grid">
          <span>검사·발전소</span>
          <span>현재 단계</span>
          <span>담당 전문가</span>
          <span>기한</span>
          <span />
        </div>
        <div className="divide-y divide-slate-100">
          {filtered.map((item) => (
            <article
              key={item.id}
              className="grid gap-4 px-5 py-4 md:grid-cols-[1.25fr_.8fr_.65fr_.55fr_80px] md:items-center"
            >
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold">{item.plant}</h3>
                  <Badge
                    variant="outline"
                    className={`h-5 rounded-full px-2 text-[9px] ${statusClass(item.statusTone)}`}
                  >
                    {item.files}개 파일
                  </Badge>
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  {item.id} · {item.client} · {item.location}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-600">
                  {item.status}
                </p>
                <Progress
                  value={item.progress}
                  className="mt-2 h-1.5 bg-slate-100 [&>div]:bg-[#0b8f87]"
                />
              </div>
              <p className="text-xs font-medium text-slate-500">
                {item.expert}
              </p>
              <p className="flex items-center gap-1 text-xs font-medium text-slate-500">
                <Clock3 className="size-3.5" />
                {item.due}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  onNavigate(
                    item.status.includes('전문가') ? 'thermal' : 'inspections',
                  )
                }
                className="rounded-lg text-xs"
              >
                열기
              </Button>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const points = values
    .map(
      (value, index) =>
        `${(index / (values.length - 1)) * 100},${40 - ((value - 55) / 35) * 34}`,
    )
    .join(' ');
  return (
    <svg
      viewBox="0 0 100 44"
      className="h-16 w-full overflow-visible"
      aria-label="최근 7일 발전량 추이"
    >
      <defs>
        <linearGradient id="spark" x1="0" y1="0" x2="1" y2="0">
          <stop stopColor="#0b8f87" />
          <stop offset="1" stopColor="#59c8bd" />
        </linearGradient>
      </defs>
      <polyline
        points={points}
        fill="none"
        stroke="url(#spark)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AssetsView() {
  const clients = [
    {
      name: '에너지이음 협동조합',
      facilities: 3,
      manager: '김하늘',
      consent: '동의 완료',
    },
    {
      name: '부천시민햇빛',
      facilities: 2,
      manager: '박서준',
      consent: '동의 완료',
    },
    {
      name: '온누리산업',
      facilities: 1,
      manager: '정민아',
      consent: '갱신 예정',
    },
  ];
  const partners = [
    {
      name: '한빛O&M',
      area: '부천·인천',
      specialty: '전기·인버터',
      verified: true,
    },
    {
      name: '새빛전기',
      area: '경기 서부',
      specialty: '긴급 출동',
      verified: true,
    },
    {
      name: '그린케어솔루션',
      area: '수도권',
      specialty: '모듈 세척·교체',
      verified: false,
    },
  ];
  return (
    <>
      <PageHeading
        eyebrow="A-5 기준정보 관리"
        title="설비·고객·협력업체"
        description="보고서, 점검과 견적에 공통으로 쓰는 기본정보를 한곳에서 관리합니다."
        action={
          <Button variant="outline" className="h-11 rounded-xl bg-white">
            <Plus className="size-4" />
            기준정보 등록
          </Button>
        }
      />
      <div className="grid gap-5 lg:grid-cols-3">
        {plants.map((plant) => (
          <article
            key={plant.name}
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
          >
            <div className="border-b border-slate-100 p-5">
              <div className="mb-4 flex items-start justify-between">
                <div className="grid size-10 place-items-center rounded-xl bg-[#eaf6f5] text-[#0b8f87]">
                  <SunMedium className="size-5" />
                </div>
                <Badge
                  variant="outline"
                  className={
                    plant.health >= 95
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-amber-200 bg-amber-50 text-amber-700'
                  }
                >
                  {plant.health >= 95 ? '양호' : '관찰 필요'}
                </Badge>
              </div>
              <h2 className="font-bold">{plant.name}</h2>
              <p className="mt-1 text-xs text-slate-400">{plant.client}</p>
              <p className="mt-3 flex items-center gap-1 text-xs text-slate-500">
                <MapPin className="size-3.5" />
                {plant.location}
              </p>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[10px] text-slate-400">설비용량</p>
                  <p className="mt-1 text-xs font-bold">{plant.capacity}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">건강지수</p>
                  <p className="mt-1 text-xs font-bold text-[#0b8f87]">
                    {plant.health}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">누적검사</p>
                  <p className="mt-1 text-xs font-bold">
                    {plant.inspections}건
                  </p>
                </div>
              </div>
              <div className="mt-5 rounded-xl bg-slate-50 px-3 pt-3">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-semibold text-slate-500">
                    최근 7일 발전량
                  </span>
                  <span className="text-slate-400">상대 지수</span>
                </div>
                <Sparkline values={plant.yield} />
              </div>
              <div className="mt-4 flex items-center justify-between">
                <span
                  className={`text-[11px] font-semibold ${plant.issue === '정상' ? 'text-emerald-600' : 'text-amber-700'}`}
                >
                  {plant.issue}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-[#0b8f87]"
                >
                  상세 보기 <ArrowRight className="size-3" />
                </Button>
              </div>
            </div>
          </article>
        ))}
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <p className="text-xs font-bold text-[#0b8f87]">고객 기준정보</p>
              <h2 className="mt-1 font-bold">고객사·담당자·동의 상태</h2>
            </div>
            <Users className="size-5 text-slate-400" />
          </div>
          <div className="divide-y divide-slate-100">
            {clients.map((client) => (
              <div
                key={client.name}
                className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_90px_90px] sm:items-center"
              >
                <div>
                  <p className="text-sm font-bold">{client.name}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    담당 {client.manager} · 설비 {client.facilities}개
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={`w-fit ${client.consent === '동의 완료' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}
                >
                  {client.consent}
                </Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  className="justify-start text-xs text-[#0b8f87]"
                >
                  상세 확인
                </Button>
              </div>
            ))}
          </div>
        </section>
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <p className="text-xs font-bold text-[#0b8f87]">
                협력업체 기준정보
              </p>
              <h2 className="mt-1 font-bold">영업지역·전문분야·검증 상태</h2>
            </div>
            <Handshake className="size-5 text-slate-400" />
          </div>
          <div className="divide-y divide-slate-100">
            {partners.map((partner) => (
              <div
                key={partner.name}
                className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_110px_90px] sm:items-center"
              >
                <div>
                  <p className="text-sm font-bold">{partner.name}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {partner.area} · {partner.specialty}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={`w-fit ${partner.verified ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-blue-200 bg-blue-50 text-blue-700'}`}
                >
                  {partner.verified ? '서류 검증' : '검증 대기'}
                </Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  className="justify-start text-xs text-[#0b8f87]"
                >
                  업체 확인
                </Button>
              </div>
            ))}
          </div>
        </section>
      </div>
      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-sm font-bold">인버터 데이터 연동 준비</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              현재는 샘플 추이만 표시합니다. 제조사·모델·API 권한이 확정되면
              공급자 어댑터를 추가합니다.
            </p>
          </div>
          <Badge
            variant="outline"
            className="w-fit border-blue-200 bg-blue-50 text-blue-700"
          >
            <Cloud className="mr-1 size-3" />
            연동 전
          </Badge>
        </div>
      </section>
    </>
  );
}

function ThermalReviewView() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string>('');
  const [fileName, setFileName] = useState('');
  const [sensitivity, setSensitivity] = useState(72);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [decisions, setDecisions] = useState<
    Record<string, 'accepted' | 'rejected'>
  >({});
  const [classifications, setClassifications] = useState<
    Record<string, string>
  >({});

  async function sendAnalysis(values: number[], width: number, height: number) {
    setLoading(true);
    setError('');
    setDecisions({});
    setClassifications({});
    try {
      const response = await fetch('/api/thermal/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ width, height, values, sensitivity }),
      });
      const data = (await response.json()) as AnalysisResult & {
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? '분석에 실패했습니다.');
      setResult(data);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : '분석에 실패했습니다.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function analyzeImage(source: string, name: string) {
    const image = new window.Image();
    image.onload = async () => {
      const scale = Math.min(1, 220 / image.width, 140 / image.height);
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return;
      context.drawImage(image, 0, 0, width, height);
      const pixels = context.getImageData(0, 0, width, height).data;
      const values: number[] = [];
      for (let index = 0; index < pixels.length; index += 4) {
        const red = pixels[index] / 255;
        const green = pixels[index + 1] / 255;
        const blue = pixels[index + 2] / 255;
        const luminance = red * 0.45 + green * 0.35 + blue * 0.2;
        const warmBias = Math.max(0, Math.min(1, (red - blue + 1) / 2));
        values.push(
          Math.max(0, Math.min(1, luminance * 0.56 + warmBias * 0.44)),
        );
      }
      setPreview(source);
      setFileName(name);
      await sendAnalysis(values, width, height);
    };
    image.onerror = () =>
      setError('이미지를 열 수 없습니다. JPG 또는 PNG 파일을 확인해주세요.');
    image.src = source;
  }

  function loadSample() {
    const width = 720;
    const height = 420;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return;
    const imageData = context.createImageData(width, height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const hotspotA = Math.exp(
          -((x - 510) ** 2 / 4200 + (y - 160) ** 2 / 2200),
        );
        const hotspotB = Math.exp(
          -((x - 250) ** 2 / 2100 + (y - 300) ** 2 / 1800),
        );
        const panelBand = 0.15 * Math.sin(x / 54) + 0.08 * Math.cos(y / 36);
        const heat = Math.max(
          0,
          Math.min(
            1,
            0.26 +
              (x / width) * 0.18 +
              panelBand +
              hotspotA * 0.66 +
              hotspotB * 0.5,
          ),
        );
        const index = (y * width + x) * 4;
        imageData.data[index] = Math.round(255 * Math.min(1, heat * 1.65));
        imageData.data[index + 1] = Math.round(
          255 * Math.max(0, Math.min(1, heat * 1.55 - 0.32)),
        );
        imageData.data[index + 2] = Math.round(
          255 * Math.max(0, 0.62 - heat * 0.72),
        );
        imageData.data[index + 3] = 255;
      }
    }
    context.putImageData(imageData, 0, 0);
    context.strokeStyle = 'rgba(255,255,255,.19)';
    context.lineWidth = 2;
    for (let x = 60; x < width; x += 92) {
      context.beginPath();
      context.moveTo(x, 18);
      context.lineTo(x, height - 18);
      context.stroke();
    }
    for (let y = 56; y < height; y += 74) {
      context.beginPath();
      context.moveTo(18, y);
      context.lineTo(width - 18, y);
      context.stroke();
    }
    void analyzeImage(
      canvas.toDataURL('image/png'),
      'sample-thermal-array.png',
    );
  }

  function handleFile(file?: File) {
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setError(
        '데모는 JPG와 PNG만 지원합니다. 방사온도 원본은 운영 파서 연결 후 지원합니다.',
      );
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setError('데모 업로드는 12MB 이하만 지원합니다.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string')
        void analyzeImage(reader.result, file.name);
    };
    reader.readAsDataURL(file);
  }

  const reviewed = Object.values(decisions).length;
  return (
    <>
      <PageHeading
        eyebrow="A-2 이상 태깅·검수"
        title="열화상 이상 후보 관리자 확정"
        description="규칙 기반 샘플을 PDF의 AI 후보 형식으로 표시하고, 관리자가 유형을 수정한 뒤 채택·기각합니다."
        action={
          <Badge
            variant="outline"
            className="h-8 border-amber-200 bg-amber-50 px-3 text-amber-700"
          >
            <CircleAlert className="mr-1 size-3.5" />
            실제 온도값 아님
          </Badge>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_380px]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-[#101d33] text-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
            <div>
              <p className="text-xs font-bold">
                {fileName || '분석할 이미지를 선택하세요'}
              </p>
              <p className="mt-1 text-[10px] text-white/45">
                브라우저 픽셀 변환 → 서버 규칙 분석 → 전문가 확인
              </p>
            </div>
            <div className="flex gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                onChange={(event) => handleFile(event.target.files?.[0])}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => fileRef.current?.click()}
                className="border-white/15 bg-white/5 text-xs text-white hover:bg-white/10 hover:text-white"
              >
                <UploadCloud className="size-3.5" />
                이미지 업로드
              </Button>
              <Button
                size="sm"
                onClick={loadSample}
                className="bg-[#0b8f87] text-xs hover:bg-[#087c76]"
              >
                <Sparkles className="size-3.5" />
                샘플 분석
              </Button>
            </div>
          </div>
          <div className="relative grid min-h-[430px] place-items-center bg-[radial-gradient(circle_at_50%_40%,rgba(27,62,92,.8),rgba(8,16,30,.95))] p-5">
            {loading ? (
              <div className="text-center">
                <RefreshCw className="mx-auto mb-3 size-7 animate-spin text-[#7dd8d1]" />
                <p className="text-xs font-semibold">
                  서버에서 상대 분포를 계산하고 있습니다
                </p>
              </div>
            ) : preview ? (
              <div className="relative max-h-[500px] max-w-full overflow-hidden rounded-xl border border-white/15 shadow-2xl">
                <NextImage
                  src={preview}
                  alt="분석 중인 열화상"
                  width={720}
                  height={420}
                  unoptimized
                  className="max-h-[500px] w-auto max-w-full object-contain"
                />
                {result?.regions.map((region) => (
                  <button
                    key={region.id}
                    title={`${region.kind === 'hot' ? '고온' : '저온'} 후보 ${region.score}`}
                    className={`absolute border-2 ${decisions[region.id] === 'rejected' ? 'opacity-25' : ''} ${region.kind === 'hot' ? 'border-[#ffcb64] bg-[#ff7a3d]/10' : 'border-[#65d8ff] bg-[#4ab8ff]/10'}`}
                    style={{
                      left: `${region.x * 100}%`,
                      top: `${region.y * 100}%`,
                      width: `${region.width * 100}%`,
                      height: `${region.height * 100}%`,
                    }}
                  >
                    <span
                      className={`absolute -top-5 left-0 rounded px-1.5 py-0.5 text-[9px] font-bold ${region.kind === 'hot' ? 'bg-[#ffcb64] text-[#462000]' : 'bg-[#65d8ff] text-[#08233b]'}`}
                    >
                      {region.kind === 'hot' ? 'HOT' : 'COLD'} {region.score}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <button
                onClick={loadSample}
                className="group grid w-full max-w-xl place-items-center rounded-2xl border border-dashed border-white/20 bg-white/[.03] px-6 py-16 text-center transition hover:border-[#5bbdb6]/60 hover:bg-white/[.05]"
              >
                <span className="grid size-14 place-items-center rounded-2xl bg-white/[.06] text-[#7dd8d1]">
                  <ThermometerSun className="size-7" />
                </span>
                <span className="mt-4 text-sm font-bold">
                  샘플 열화상으로 바로 확인
                </span>
                <span className="mt-2 max-w-sm text-xs leading-5 text-white/45">
                  JPG·PNG 업로드도 가능합니다. 파일은 데모 서버에 보관하지
                  않습니다.
                </span>
              </button>
            )}
          </div>
          <div className="grid gap-4 border-t border-white/10 px-5 py-4 sm:grid-cols-[1fr_auto]">
            <label
              htmlFor="thermal-sensitivity"
              className="grid gap-2 text-[10px] font-semibold text-white/55"
            >
              <span className="flex justify-between">
                <span>후보 민감도</span>
                <span className="text-[#7dd8d1]">{sensitivity}</span>
              </span>
              <input
                id="thermal-sensitivity"
                aria-label="후보 민감도"
                type="range"
                min="20"
                max="95"
                value={sensitivity}
                onChange={(event) => setSensitivity(Number(event.target.value))}
                className="accent-[#40b6ad]"
              />
            </label>
            <Button
              size="sm"
              variant="outline"
              disabled={!preview || loading}
              onClick={() => preview && void analyzeImage(preview, fileName)}
              className="border-white/15 bg-white/5 text-xs text-white hover:bg-white/10 hover:text-white"
            >
              민감도로 다시 분석
            </Button>
          </div>
        </section>
        <aside className="space-y-4">
          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700">
              {error}
            </div>
          ) : null}
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-bold">규칙 분석 요약</h2>
              <Badge
                variant="outline"
                className="border-blue-200 bg-blue-50 text-blue-700"
              >
                비AI
              </Badge>
            </div>
            {result ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ['상대 열지수', result.summary.heatIndex],
                    ['명암 대비', result.summary.contrast],
                    ['고온 후보', result.summary.hotCandidates],
                    ['저온 후보', result.summary.coldCandidates],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl bg-slate-50 p-3">
                      <p className="text-[10px] text-slate-400">{label}</p>
                      <p className="mt-1 text-lg font-bold">
                        {value}
                        <span className="ml-0.5 text-[10px] text-slate-400">
                          {String(label).includes('후보') ? '건' : '/100'}
                        </span>
                      </p>
                    </div>
                  ))}
                </div>
                <p className="mt-4 rounded-xl bg-amber-50 p-3 text-[10px] leading-5 text-amber-800">
                  {result.disclaimer}
                </p>
              </>
            ) : (
              <div className="rounded-xl bg-slate-50 py-10 text-center text-xs text-slate-400">
                분석 후 요약이 표시됩니다.
              </div>
            )}
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-bold">이상 후보</h2>
              <span className="text-xs text-slate-400">
                검토 {reviewed}/{result?.regions.length ?? 0}
              </span>
            </div>
            <div className="max-h-[430px] divide-y divide-slate-100 overflow-auto">
              {result?.regions.length ? (
                result.regions.map((region) => {
                  const suggested = suggestedAnomaly(region);
                  return (
                    <div key={region.id} className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`size-2 rounded-full ${region.kind === 'hot' ? 'bg-orange-500' : 'bg-sky-500'}`}
                            />
                            <p className="text-sm font-bold">
                              {classifications[region.id] ?? suggested.type}
                            </p>
                          </div>
                          <p className="mt-1 pl-4 text-xs text-slate-400">
                            Delta T 참고 {suggested.delta}K · 신뢰도{' '}
                            {region.score}% · {suggested.action}
                          </p>
                        </div>
                        {decisions[region.id] ? (
                          <Badge
                            variant="outline"
                            className={
                              decisions[region.id] === 'accepted'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : 'border-slate-200 bg-slate-50 text-slate-500'
                            }
                          >
                            {decisions[region.id] === 'accepted'
                              ? '관리자 확정'
                              : '기각'}
                          </Badge>
                        ) : null}
                      </div>
                      <select
                        aria-label={`${region.id} 이상유형`}
                        value={classifications[region.id] ?? suggested.type}
                        onChange={(event) =>
                          setClassifications((current) => ({
                            ...current,
                            [region.id]: event.target.value,
                          }))
                        }
                        className="mt-3 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                      >
                        {anomalyTypes.map((type) => (
                          <option key={type}>{type}</option>
                        ))}
                      </select>
                      <div className="mt-3 flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setDecisions((current) => ({
                              ...current,
                              [region.id]: 'accepted',
                            }))
                          }
                          className="h-8 flex-1 rounded-lg text-xs"
                        >
                          <Check className="size-3" />
                          확정
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setDecisions((current) => ({
                              ...current,
                              [region.id]: 'rejected',
                            }))
                          }
                          className="h-8 flex-1 rounded-lg text-xs text-slate-500"
                        >
                          <X className="size-3" />
                          기각
                        </Button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="px-4 py-10 text-center text-sm text-slate-400">
                  아직 후보가 없습니다.
                </div>
              )}
            </div>
          </section>
        </aside>
      </div>
      <section className="mt-5 grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 md:grid-cols-3">
        <div>
          <p className="text-[10px] font-bold text-[#0b8f87]">1. 현재 데모</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            일반 열화상 JPG·PNG의 색상 분포로 상대 고온·저온 후보를 찾습니다.
          </p>
        </div>
        <div>
          <p className="text-[10px] font-bold text-[#0b8f87]">
            2. 방사온도 원본 연결
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            카메라 모델별 원본 파서가 확보되면 같은 분석 계층에 실제 °C 배열을
            넣습니다.
          </p>
        </div>
        <div>
          <p className="text-[10px] font-bold text-[#0b8f87]">3. 최종 판정</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            시스템 후보는 참고자료이며 최종 진단과 보고서 승인은 전문가가
            담당합니다.
          </p>
        </div>
      </section>
    </>
  );
}

function ReportsView() {
  const [approved, setApproved] = useState<Record<string, boolean>>({});
  const [previewReport, setPreviewReport] = useState<
    (typeof reports)[number] | null
  >(null);
  return (
    <>
      <PageHeading
        eyebrow="보고서 관리"
        title="검토·승인·발행"
        description="초안과 발행본을 구분하고, 승인된 판본만 고객에게 공개합니다."
        action={
          <Button variant="outline" className="h-11 rounded-xl bg-white">
            <FileText className="size-4" />
            보고서 템플릿
          </Button>
        }
      />
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <MetricCard
          label="초안·검토"
          value="5"
          unit="건"
          note="보완 필요 1건"
          icon={FileText}
          tone="cyan"
        />
        <MetricCard
          label="승인 대기"
          value="2"
          unit="건"
          note="오늘 요청 1건"
          icon={UserCheck}
          tone="violet"
        />
        <MetricCard
          label="이번 달 발행"
          value="14"
          unit="건"
          note="개정본 2건 포함"
          icon={FileCheck2}
          tone="emerald"
        />
      </div>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="divide-y divide-slate-100">
          {reports.map((report) => {
            const isApproved =
              approved[report.id] || report.status === '발행 완료';
            return (
              <article
                key={report.id}
                className="grid gap-4 p-5 lg:grid-cols-[1.4fr_.55fr_.55fr_auto] lg:items-center"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-bold">{report.title}</h2>
                    <Badge
                      variant="outline"
                      className={`h-5 text-[9px] ${statusClass(isApproved ? 'green' : report.tone)}`}
                    >
                      {isApproved ? '승인 완료' : report.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {report.id} · {report.plant} · {report.version}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">진단 항목</p>
                  <p className="mt-1 text-xs font-semibold">
                    {report.findings}건
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">마지막 변경</p>
                  <p className="mt-1 text-xs font-semibold text-slate-600">
                    {report.updated}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPreviewReport(report)}
                    className="rounded-lg text-xs"
                  >
                    <Eye className="size-3.5" />
                    미리보기
                  </Button>
                  {!isApproved ? (
                    <Button
                      size="sm"
                      onClick={() =>
                        setApproved((current) => ({
                          ...current,
                          [report.id]: true,
                        }))
                      }
                      className="rounded-lg bg-[#0b8f87] text-xs hover:bg-[#087c76]"
                    >
                      승인
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        window.open(
                          '/report-demo',
                          '_blank',
                          'noopener,noreferrer',
                        )
                      }
                      className="rounded-lg text-xs text-[#0b8f87]"
                    >
                      <Download className="size-3.5" />
                      PDF
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>
      <Dialog
        open={Boolean(previewReport)}
        onOpenChange={(open) => !open && setPreviewReport(null)}
      >
        <DialogContent className="max-h-[90vh] overflow-auto rounded-2xl sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle>보고서 미리보기</DialogTitle>
            <DialogDescription>
              A4 발행 전 내용 구조를 확인하는 데모입니다.
            </DialogDescription>
          </DialogHeader>
          {previewReport ? (
            <div className="rounded-sm border border-slate-200 bg-white p-8 shadow-inner">
              <div className="border-b-2 border-[#172b4b] pb-5">
                <p className="text-xs font-bold text-[#0b8f87]">
                  태양광 설비 열화상 진단보고서
                </p>
                <h2 className="mt-2 text-xl font-bold">
                  {previewReport.plant}
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  문서번호 {previewReport.id} · {previewReport.version}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3 border-b border-slate-200 py-5">
                <div>
                  <p className="text-[10px] text-slate-400">검사일</p>
                  <p className="mt-1 text-xs font-semibold">2026. 09. 01.</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">진단자</p>
                  <p className="mt-1 text-xs font-semibold">이도윤</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">판정</p>
                  <p className="mt-1 text-xs font-semibold text-amber-700">
                    관찰 필요
                  </p>
                </div>
              </div>
              <div className="py-6">
                <h3 className="text-sm font-bold">종합 의견</h3>
                <p className="mt-3 text-xs leading-6 text-slate-600">
                  상대 고온 후보 3곳을 검토했으며, 이 중 접속부 인접 영역 1곳은
                  현장 확인을 권고합니다. 자동 후보는 촬영 조건과 가시광 자료를
                  함께 비교해 전문가가 최종 판정했습니다.
                </p>
                <div className="mt-5 h-36 rounded-xl bg-[linear-gradient(135deg,#121d3e,#512c68_45%,#f0643b_75%,#ffd268)]" />
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function MaintenanceView() {
  const stages = ['요청', '배정', '작업 중', '완료'];
  const [stageMap, setStageMap] = useState<Record<string, string>>({});
  const items = maintenance.map((item) => ({
    ...item,
    status: stageMap[item.id] ?? item.status,
  }));
  function advance(id: string, current: string) {
    const index = stages.indexOf(current);
    if (index < stages.length - 1)
      setStageMap((map) => ({ ...map, [id]: stages[index + 1] }));
  }
  return (
    <>
      <PageHeading
        eyebrow="후속 조치"
        title="유지보수 요청과 완료 확인"
        description="진단 권고가 실제 조치로 이어지는지 담당·일정·전후 증빙과 함께 추적합니다."
        action={
          <Button className="h-11 rounded-xl bg-[#0b8f87] hover:bg-[#087c76]">
            <Plus className="size-4" />
            요청 만들기
          </Button>
        }
      />
      <div className="grid gap-4 lg:grid-cols-4">
        {stages.map((stage) => (
          <section key={stage} className="rounded-2xl bg-[#e9edf2]/70 p-3">
            <div className="mb-3 flex items-center justify-between px-1">
              <h2 className="text-xs font-bold text-slate-600">{stage}</h2>
              <span className="grid size-5 place-items-center rounded-full bg-white text-[10px] font-bold text-slate-400">
                {items.filter((item) => item.status === stage).length}
              </span>
            </div>
            <div className="space-y-3">
              {items
                .filter((item) => item.status === stage)
                .map((item) => (
                  <article
                    key={item.id}
                    className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <Badge
                        variant="outline"
                        className={`text-[9px] ${item.priority === '긴급' ? 'border-red-200 bg-red-50 text-red-700' : item.priority === '높음' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}
                      >
                        {item.priority}
                      </Badge>
                      <span className="text-[9px] text-slate-400">
                        {item.id}
                      </span>
                    </div>
                    <h3 className="mt-3 text-xs font-bold leading-5">
                      {item.title}
                    </h3>
                    <p className="mt-1 text-[10px] text-slate-400">
                      {item.plant}
                    </p>
                    <div className="mt-4 space-y-2 border-t border-slate-100 pt-3 text-[10px] text-slate-500">
                      <p className="flex items-center gap-1">
                        <CalendarDays className="size-3" />
                        {item.due}
                      </p>
                      <p className="flex items-center gap-1">
                        <UserCheck className="size-3" />
                        {item.owner}
                      </p>
                    </div>
                    {stage !== '완료' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => advance(item.id, stage)}
                        className="mt-3 h-7 w-full rounded-lg text-[10px]"
                      >
                        다음 단계 <ArrowRight className="size-3" />
                      </Button>
                    ) : (
                      <p className="mt-3 flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
                        <CheckCircle2 className="size-3" />
                        완료 증빙 확인
                      </p>
                    )}
                  </article>
                ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

function CustomerView({ onNavigate }: { onNavigate: (view: View) => void }) {
  const faqs = [
    {
      question: 'PR이 무엇인가요?',
      answer:
        'PR은 기대 발전량과 실제 발전량을 비교한 성능비입니다. 날씨와 설비 조건을 함께 봐야 하므로 이 수치 하나만으로 고장을 확정하지 않습니다.',
    },
    {
      question: '핫스팟은 바로 수리해야 하나요?',
      answer:
        '열화상 후보는 전문가가 가시광 사진과 촬영 조건을 함께 검토한 뒤 조치 우선순위를 확정합니다. 긴급 전기안전 판단은 현장 자격자에게 요청하세요.',
    },
    {
      question: '견적은 어떻게 비교하나요?',
      answer:
        '보고서의 권고 조치를 기준으로 추천 업체 3곳의 금액, 작업 가능일, 전문분야와 평점을 비교하고 원하는 업체를 선택합니다.',
    },
  ];
  const [faqIndex, setFaqIndex] = useState(0);
  return (
    <>
      <PageHeading
        eyebrow="고객 전용 화면"
        title="에너지이음 협동조합"
        description="허용된 발전소의 최신 보고서와 권고 조치만 확인할 수 있습니다."
      />
      <section className="mb-5 overflow-hidden rounded-3xl bg-[#172b4b] p-6 text-white sm:p-8">
        <div className="grid gap-7 lg:grid-cols-[1fr_420px] lg:items-center">
          <div>
            <Badge className="bg-[#7dd8d1]/15 text-[#7dd8d1]">
              최근 진단 완료
            </Badge>
            <h2 className="mt-4 text-2xl font-bold">해오름 제2발전소</h2>
            <p className="mt-2 text-sm text-white/55">
              2026년 9월 정기 열화상 점검
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                onClick={() => onNavigate('reports')}
                className="bg-white text-[#172b4b] hover:bg-white/90"
              >
                <FileCheck2 className="size-4" />
                보고서 보기
              </Button>
              <Button
                variant="outline"
                onClick={() => onNavigate('maintenance')}
                className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
              >
                <Wrench className="size-4" />
                조치 현황
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 rounded-2xl bg-white/[.06] p-4">
            <div>
              <p className="text-[10px] text-white/45">건강지수</p>
              <p className="mt-2 text-xl font-bold text-[#7dd8d1]">91</p>
            </div>
            <div>
              <p className="text-[10px] text-white/45">확인 항목</p>
              <p className="mt-2 text-xl font-bold">3</p>
            </div>
            <div>
              <p className="text-[10px] text-white/45">조치 중</p>
              <p className="mt-2 text-xl font-bold text-[#ffca70]">1</p>
            </div>
          </div>
        </div>
      </section>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['성능비', '78.4%'],
          ['연간 기대수익', '154,555,000원'],
          ['현재 손실금액', '27,842,000원'],
          ['예상 회수기간', '1.4년'],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-2xl border border-slate-200 bg-white p-4"
          >
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-2 text-lg font-bold">{value}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-[#0b8f87]">
                최신 발행본
              </p>
              <h2 className="mt-1 text-sm font-bold">
                해오름 제2발전소 정기 진단보고서
              </h2>
            </div>
            <span className="grid size-10 place-items-center rounded-xl bg-[#eaf6f5] text-[#0b8f87]">
              <FileText className="size-5" />
            </span>
          </div>
          <p className="mt-4 text-xs leading-6 text-slate-500">
            전문가 검토와 승인이 완료된 결과입니다. 접속부 과열 1건과 단일 셀
            핫스팟 1건에 대한 조치를 권고했습니다.
          </p>
          <Button
            variant="outline"
            onClick={() =>
              window.open('/report-demo', '_blank', 'noopener,noreferrer')
            }
            className="mt-5 w-full rounded-xl"
          >
            <Download className="size-4" />
            리포트·PDF 저장
          </Button>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-amber-700">후속 조치</p>
              <h2 className="mt-1 text-sm font-bold">모듈 접속부 현장 확인</h2>
            </div>
            <Badge
              variant="outline"
              className="border-blue-200 bg-blue-50 text-blue-700"
            >
              견적 3건 도착
            </Badge>
          </div>
          <div className="mt-5 space-y-4">
            <div className="flex gap-3">
              <CheckCircle2 className="size-4 text-emerald-500" />
              <div>
                <p className="text-xs font-semibold">점검 요청 접수</p>
                <p className="text-[10px] text-slate-400">9월 2일 10:20</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Activity className="size-4 text-blue-500" />
              <div>
                <p className="text-xs font-semibold">업체 3곳 견적 회신</p>
                <p className="text-[10px] text-slate-400">
                  금액·기간·평점 비교 가능
                </p>
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            onClick={() => onNavigate('quotes')}
            className="mt-4 px-0 text-[#0b8f87]"
          >
            견적 비교하기 <ArrowRight className="size-4" />
          </Button>
        </section>
      </div>
      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
          <div>
            <p className="text-xs font-bold text-[#0b8f87]">일반 안내 FAQ</p>
            <h2 className="mt-1 text-lg font-bold">
              진단 결과를 쉽게 이해하기
            </h2>
            <p className="mt-2 text-xs leading-6 text-slate-500">
              운영 버전에서는 승인된 FAQ 범위만 답변하며 전기안전·법률·수리 확정
              판단은 전문가에게 연결합니다.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-[220px_1fr]">
            <div className="space-y-2">
              {faqs.map((faq, index) => (
                <button
                  key={faq.question}
                  onClick={() => setFaqIndex(index)}
                  className={`w-full rounded-xl px-3 py-3 text-left text-xs font-semibold transition ${faqIndex === index ? 'bg-[#eaf6f5] text-[#087c76]' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
                >
                  {faq.question}
                </button>
              ))}
            </div>
            <div className="rounded-2xl bg-[#172b4b] p-5 text-white">
              <div className="flex items-center gap-2 text-xs font-bold text-[#7dd8d1]">
                <Sparkles className="size-4" />
                안내 답변 데모
              </div>
              <p className="mt-4 text-sm font-bold">
                {faqs[faqIndex].question}
              </p>
              <p className="mt-3 text-sm leading-7 text-white/70">
                {faqs[faqIndex].answer}
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

export function DemoApp() {
  const [role, setRole] = useState<AppRole>('operator');
  const [activeView, setActiveView] = useState<View>('dashboard');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [inspectionRows, setInspectionRows] = useState(seedInspections);
  const [solarSettings, setSolarSettings] = useState(defaultSolarSettings);
  const [notice, setNotice] = useState('');

  const currentNav = useMemo(
    () =>
      role === 'client'
        ? [
            {
              id: 'facility-register' as View,
              label: '설비 등록',
              icon: Building2,
            },
            {
              id: 'quick-diagnosis' as View,
              label: '무료 AI 진단',
              icon: Sparkles,
            },
            { id: 'customer' as View, label: '진단 리포트', icon: FileCheck2 },
            { id: 'quotes' as View, label: '견적 비교', icon: Handshake },
            {
              id: 'mypage' as View,
              label: '마이페이지',
              icon: LayoutDashboard,
            },
          ]
        : navigation,
    [role],
  );

  function changeRole(nextRole: AppRole) {
    setRole(nextRole);
    setActiveView(
      nextRole === 'client'
        ? 'customer'
        : nextRole === 'expert'
          ? 'thermal'
          : 'dashboard',
    );
    setNotice(`${roleLabels[nextRole]} 화면으로 전환했습니다.`);
    window.setTimeout(() => setNotice(''), 2400);
  }

  function navigate(view: View) {
    setActiveView(view);
    setMobileMenu(false);
  }
  function createInspection(item: (typeof seedInspections)[number]) {
    setInspectionRows((rows) => [item, ...rows]);
    setNotice('새 검사를 데모 목록에 추가했습니다.');
    window.setTimeout(() => setNotice(''), 2400);
  }
  function notify(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 2800);
  }

  let content: ReactNode;
  if (activeView === 'inspections')
    content = (
      <InspectionsView
        rows={inspectionRows}
        onCreate={createInspection}
        onNavigate={navigate}
      />
    );
  else if (activeView === 'inspection-upload')
    content = <InspectionUploadView settings={solarSettings} notify={notify} />;
  else if (activeView === 'assets') content = <AssetsView />;
  else if (activeView === 'thermal') content = <ThermalReviewView />;
  else if (activeView === 'performance')
    content = <PerformanceCalculatorView settings={solarSettings} />;
  else if (activeView === 'reports') content = <ReportsView />;
  else if (activeView === 'quotes')
    content = (
      <PartnerQuotesView
        notify={notify}
        customerMode={role === 'client'}
        commissionRatePercent={solarSettings.commissionRatePercent}
      />
    );
  else if (activeView === 'maintenance') content = <MaintenanceView />;
  else if (activeView === 'settings')
    content = (
      <SettingsManagementView
        settings={solarSettings}
        setSettings={setSolarSettings}
        notify={notify}
      />
    );
  else if (activeView === 'facility-register')
    content = <FacilityRegistrationView notify={notify} />;
  else if (activeView === 'quick-diagnosis')
    content = <QuickDiagnosisView settings={solarSettings} notify={notify} />;
  else if (activeView === 'customer')
    content = <CustomerView onNavigate={navigate} />;
  else if (activeView === 'mypage')
    content = <CustomerMyPageView notify={notify} />;
  else
    content = (
      <DashboardView onNavigate={navigate} onCreate={createInspection} />
    );

  return (
    <main className="min-h-screen bg-[#f3f5f8] text-[#172033]">
      <header className="sticky top-0 z-40 flex h-16 items-center border-b border-slate-200/80 bg-white/95 px-4 backdrop-blur lg:px-7">
        <button
          onClick={() => setMobileMenu((open) => !open)}
          aria-label="메뉴 열기"
          className="mr-2 grid size-9 place-items-center rounded-xl text-slate-500 hover:bg-slate-50 lg:hidden"
        >
          <Menu className="size-5" />
        </button>
        <button
          onClick={() => navigate(role === 'client' ? 'customer' : 'dashboard')}
          className="flex w-[248px] shrink-0 items-center gap-3 text-left"
        >
          <span className="grid size-9 place-items-center rounded-xl bg-[#162b4d] text-white shadow-[0_8px_24px_rgba(22,43,77,.2)]">
            <SunMedium className="size-5" />
          </span>
          <span className="leading-tight">
            <span className="block font-semibold tracking-[-0.02em]">
              SolarScope
            </span>
            <span className="block text-[11px] font-medium text-slate-400">
              자산진단 운영센터
            </span>
          </span>
        </button>
        <div className="mx-auto hidden w-full max-w-xl md:block">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              aria-label="통합 검색"
              placeholder="발전소, 검사번호, 고객사를 검색하세요"
              className="h-10 rounded-xl border-slate-200 bg-slate-50 pl-10 shadow-none"
            />
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-400">
              ⌘ K
            </kbd>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2 lg:gap-3">
          <div className="hidden items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 sm:flex">
            <Database
              className={`ml-1 size-3.5 ${backendConfig.projectConfigured ? 'text-emerald-600' : 'text-slate-400'}`}
            />
            <span className="px-1 text-[10px] font-semibold text-slate-500">
              {backendConfig.projectConfigured
                ? 'Supabase 연결 준비됨'
                : '샘플 모드'}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="relative rounded-xl text-slate-500"
            aria-label="알림"
          >
            <Bell className="size-4" />
            <span className="absolute right-2 top-2 size-2 rounded-full border-2 border-white bg-[#f36b3b]" />
          </Button>
          <select
            aria-label="역할 전환"
            value={role}
            onChange={(event) => changeRole(event.target.value as AppRole)}
            className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-xs font-semibold outline-none focus:border-[#0b8f87]"
          >
            <option value="operator">운영자</option>
            <option value="expert">전문가</option>
            <option value="client">고객</option>
          </select>
          <div className="hidden h-7 w-px bg-slate-200 lg:block" />
          <button className="hidden items-center gap-2 rounded-xl p-1.5 text-left hover:bg-slate-50 lg:flex">
            <span className="grid size-8 place-items-center rounded-lg bg-[#e8edf5] text-xs font-bold text-[#31486c]">
              김
            </span>
            <span className="leading-tight">
              <span className="block text-xs font-semibold">김하늘</span>
              <span className="block text-[10px] text-slate-400">
                {roleLabels[role]}
              </span>
            </span>
            <ChevronDown className="size-3.5 text-slate-400" />
          </button>
        </div>
      </header>
      {mobileMenu ? (
        <div className="fixed inset-x-0 top-16 z-30 border-b border-slate-200 bg-white p-3 shadow-xl lg:hidden">
          <div className="grid grid-cols-2 gap-2">
            {currentNav.map((item) => (
              <button
                key={item.id}
                onClick={() => navigate(item.id)}
                className={`flex items-center gap-2 rounded-xl px-3 py-3 text-xs font-semibold ${activeView === item.id ? 'bg-[#eaf6f5] text-[#087c76]' : 'bg-slate-50 text-slate-600'}`}
              >
                <item.icon className="size-4" />
                {item.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="mx-auto flex max-w-[1680px]">
        <aside className="sticky top-16 hidden h-[calc(100vh-64px)] w-[248px] shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white px-3 py-5 lg:flex">
          <nav className="space-y-1" aria-label="주요 메뉴">
            {currentNav.map((item) => (
              <button
                key={item.id}
                onClick={() => navigate(item.id)}
                className={`group flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium transition ${activeView === item.id ? 'bg-[#eaf6f5] text-[#087c76]' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}
              >
                <item.icon
                  className="size-[18px]"
                  strokeWidth={activeView === item.id ? 2.2 : 1.8}
                />
                <span>{item.label}</span>
                {'count' in item && item.count ? (
                  <span
                    className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold ${activeView === item.id ? 'bg-white text-[#087c76]' : 'bg-slate-100 text-slate-500'}`}
                  >
                    {item.count}
                  </span>
                ) : null}
              </button>
            ))}
          </nav>
          {role !== 'client' ? (
            <>
              <div className="my-4 h-px bg-slate-100" />
              <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                계정
              </p>
              <nav className="space-y-1">
                <button
                  onClick={() =>
                    notify('사용자·역할 권한표 데모를 확인했습니다.')
                  }
                  className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-slate-500 hover:bg-slate-50"
                >
                  <Users className="size-[17px]" />
                  사용자·권한
                </button>
                <button
                  onClick={() => navigate('settings')}
                  className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-slate-500 hover:bg-slate-50"
                >
                  <Settings className="size-[17px]" />
                  운영 설정
                </button>
              </nav>
            </>
          ) : null}
          <div className="mt-5 space-y-3">
            <div className="rounded-2xl border border-[#d9e5ef] bg-[#f6f9fc] p-3.5">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-[#31486c]">
                <ShieldCheck className="size-4 text-[#0b8f87]" />
                데모 안전 모드
              </div>
              <p className="text-[11px] leading-5 text-slate-500">
                화면은 샘플 데이터로 동작합니다. 업로드 이미지는 분석 후
                저장하지 않습니다.
              </p>
            </div>
            <div className="flex items-center gap-2 px-2 text-[10px] text-slate-400">
              <Database className="size-3.5 text-emerald-500" />
              <span>UTC 저장 · Asia/Seoul 표시</span>
            </div>
          </div>
        </aside>
        <section className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto max-w-[1320px]">{content}</div>
        </section>
      </div>
      {notice ? (
        <output className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl bg-[#172b4b] px-4 py-3 text-xs font-semibold text-white shadow-2xl">
          <CheckCircle2 className="size-4 text-[#7dd8d1]" />
          {notice}
        </output>
      ) : null}
    </main>
  );
}
