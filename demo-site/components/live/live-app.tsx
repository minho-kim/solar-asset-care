'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type SyntheticEvent,
} from 'react';
import Link from 'next/link';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Database as DatabaseIcon,
  Download,
  FileCheck2,
  FileText,
  Gauge,
  ImageIcon,
  LayoutDashboard,
  Loader2,
  LockKeyhole,
  LogOut,
  Plus,
  RefreshCw,
  ShieldCheck,
  SunMedium,
  ThermometerSun,
  UploadCloud,
  Users,
  Wrench,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { backendConfig, getSupabaseBrowserClient } from '@/lib/supabase/client';
import type { Database, Json, Tables } from '@/lib/supabase/database.types';

type Plant = Tables<'plants'>;
type Inspection = Tables<'inspections'>;
type InspectionFile = Tables<'inspection_files'>;
type AnalysisRun = Tables<'analysis_runs'>;
type Finding = Tables<'findings'>;
type Report = Tables<'reports'>;
type Maintenance = Tables<'maintenance_requests'>;
type Membership = Tables<'organization_members'>;
type Organization = Tables<'organizations'>;
type Profile = Tables<'profiles'>;

type Workspace = {
  organization: Organization;
  membership: Membership;
};

type View =
  | 'dashboard'
  | 'plants'
  | 'inspections'
  | 'files'
  | 'findings'
  | 'reports'
  | 'maintenance'
  | 'members';

type Notice = { tone: 'success' | 'error' | 'info'; text: string } | null;

type AnalysisResult = {
  disclaimer: string;
  summary: {
    heatIndex: number;
    contrast: number;
    hotCandidates: number;
    coldCandidates: number;
  };
  regions: Array<{
    id: string;
    kind: 'hot' | 'cold';
    x: number;
    y: number;
    width: number;
    height: number;
    areaPercent: number;
    score: number;
  }>;
  analyzedAt: string;
};

const inspectionStatuses = [
  ['requested', '접수'],
  ['scheduled', '일정 확정'],
  ['uploading', '자료 업로드'],
  ['quality_review', '품질 검토'],
  ['analysis', '규칙 분석'],
  ['expert_review', '전문가 판정'],
  ['approval', '승인 대기'],
  ['published', '발행'],
  ['closed', '종료'],
  ['cancelled', '취소'],
] as const;

const reportStatuses = [
  ['draft', '작성 중'],
  ['review', '검토 중'],
  ['approved', '승인'],
  ['published', '발행'],
  ['withdrawn', '회수'],
] as const;

const maintenanceStatuses = [
  ['requested', '요청'],
  ['assigned', '담당 배정'],
  ['quoted', '견적'],
  ['scheduled', '일정 확정'],
  ['in_progress', '작업 중'],
  ['completed', '완료'],
  ['cancelled', '취소'],
] as const;

const roleLabels: Record<string, string> = {
  owner: '관리자',
  expert: '전문가',
  client: '의뢰인',
};

const navItems: Array<{
  id: View;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: 'dashboard', label: '운영 현황', icon: LayoutDashboard },
  { id: 'plants', label: '발전소', icon: Building2 },
  { id: 'inspections', label: '점검', icon: ClipboardCheck },
  { id: 'files', label: '열화상 업로드', icon: UploadCloud },
  { id: 'findings', label: '후보 판정', icon: ThermometerSun },
  { id: 'reports', label: '보고서', icon: FileText },
  { id: 'maintenance', label: '유지보수', icon: Wrench },
  { id: 'members', label: '관리자·사용자', icon: Users },
];

const roleViews: Record<string, View[]> = {
  owner: navItems.map((item) => item.id),
  expert: [
    'dashboard',
    'plants',
    'inspections',
    'files',
    'findings',
    'reports',
    'maintenance',
  ],
  client: ['dashboard', 'plants', 'inspections', 'reports', 'maintenance'],
};

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error && 'message' in error) {
    return String(error.message);
  }
  return '처리 중 알 수 없는 오류가 발생했습니다.';
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: backendConfig.displayTimezone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function statusLabel(
  value: string,
  items: ReadonlyArray<readonly [string, string]>,
) {
  return items.find(([key]) => key === value)?.[1] ?? value;
}

function NoticeBar({ notice }: { notice: Notice }) {
  if (!notice) return null;
  const style =
    notice.tone === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : notice.tone === 'error'
        ? 'border-rose-200 bg-rose-50 text-rose-800'
        : 'border-sky-200 bg-sky-50 text-sky-800';
  const Icon = notice.tone === 'error' ? AlertTriangle : CheckCircle2;
  return (
    <div
      className={`mb-5 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${style}`}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <span>{notice.text}</span>
    </div>
  );
}

export function LiveApp() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  if (loading)
    return <FullScreenLoading label="안전한 작업공간을 여는 중입니다." />;
  if (!supabase) return <ConfigurationMissing />;
  if (!session) return <AuthPanel supabase={supabase} />;
  return <WorkspaceGate supabase={supabase} session={session} />;
}

function FullScreenLoading({ label }: { label: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#eef3f5] px-6">
      <div className="flex items-center gap-3 rounded-2xl border bg-white px-5 py-4 text-sm text-slate-600 shadow-sm">
        <Loader2 className="size-5 animate-spin text-teal-600" />
        {label}
      </div>
    </main>
  );
}

function Brand() {
  return (
    <Link
      href="/"
      className="flex items-center gap-3"
      aria-label="SolarScope 홈"
    >
      <span className="grid size-10 place-items-center rounded-xl bg-teal-600 text-white shadow-sm">
        <SunMedium className="size-5" />
      </span>
      <span>
        <strong className="block text-lg tracking-tight text-slate-900">
          SolarScope
        </strong>
        <span className="block text-[11px] font-medium tracking-[0.12em] text-teal-700">
          SOLAR ASSET CARE
        </span>
      </span>
    </Link>
  );
}

function ConfigurationMissing() {
  return (
    <main className="min-h-screen bg-[#eef3f5] px-6 py-16">
      <div className="mx-auto max-w-xl rounded-3xl border bg-white p-8 shadow-sm">
        <Brand />
        <DatabaseIcon className="mt-12 size-10 text-amber-500" />
        <h1 className="mt-5 text-2xl font-bold">
          Supabase 연결 설정이 필요합니다
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          배포 환경에 프로젝트 URL과 publishable key를 등록하면 로그인과 실제
          데이터 저장이 시작됩니다. 비밀키는 브라우저에 넣지 않습니다.
        </p>
        <Link
          className="mt-7 inline-flex text-sm font-semibold text-teal-700 underline"
          href="/demo"
        >
          데이터 없이 데모 화면 보기
        </Link>
      </div>
    </main>
  );
}

function AuthPanel({ supabase }: { supabase: SupabaseClient<Database> }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { name: name.trim(), account_type: 'requester' },
          },
        });
        if (error) throw error;
        if (!data.session) {
          setNotice({
            tone: 'success',
            text: '가입 메일을 보냈습니다. 메일의 인증 링크를 누른 뒤 이 화면으로 돌아와 로그인해 주세요.',
          });
          setMode('signin');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      }
    } catch (error) {
      setNotice({ tone: 'error', text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#dff5f1_0,transparent_35%),linear-gradient(135deg,#f7fafb,#e8eff2)] px-5 py-8 md:py-14">
      <div className="mx-auto grid max-w-6xl overflow-hidden rounded-[2rem] border border-white/80 bg-white shadow-[0_30px_90px_rgba(15,49,55,0.15)] lg:grid-cols-[1.12fr_0.88fr]">
        <section className="bg-[#0f3c40] p-8 text-white md:p-12 lg:p-14">
          <BrandOnDark />
          <div className="mt-16 max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-teal-100">
              <ShieldCheck className="size-3.5" /> 실제 운영 데이터는 로그인
              후에만 표시
            </div>
            <h1 className="mt-6 text-4xl font-bold leading-[1.16] tracking-tight md:text-5xl">
              점검 접수부터 보고서와 유지보수까지 한곳에서
            </h1>
            <p className="mt-5 max-w-lg text-sm leading-7 text-slate-200 md:text-base">
              발전소 등록, 점검 일정, 열화상 원본, 상대 분석 후보, 전문가 판정과
              조치 이력을 조직별 권한으로 관리합니다.
            </p>
          </div>
          <div className="mt-14 grid gap-3 sm:grid-cols-3">
            {[
              ['01', '원본 보존', '비공개 파일 저장'],
              ['02', '업무 연결', '접수→판정→조치'],
              ['03', '이관 대비', '표준 DB·객체 경로'],
            ].map(([number, title, copy]) => (
              <div
                key={number}
                className="rounded-2xl border border-white/10 bg-white/[0.06] p-4"
              >
                <span className="text-xs font-bold text-teal-300">
                  {number}
                </span>
                <strong className="mt-3 block text-sm">{title}</strong>
                <span className="mt-1 block text-xs text-slate-300">
                  {copy}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="p-7 md:p-12 lg:p-14">
          <div className="mx-auto max-w-sm">
            <p className="text-sm font-semibold text-teal-700">서비스 접속</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
              {mode === 'signin' ? '로그인' : '계정 만들기'}
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              {mode === 'signin'
                ? '의뢰인·전문가·관리자 계정으로 작업공간에 접속합니다.'
                : '의뢰인 전용 가입입니다. 전문가와 관리자는 관리자가 초대합니다.'}
            </p>
            <div className="mt-7">
              <NoticeBar notice={notice} />
            </div>
            <form onSubmit={submit} className="space-y-4">
              {mode === 'signup' && (
                <Field label="이름">
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </Field>
              )}
              <Field label="이메일">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </Field>
              <Field label="비밀번호" hint="8자 이상을 권장합니다.">
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={
                    mode === 'signin' ? 'current-password' : 'new-password'
                  }
                  minLength={8}
                  required
                />
              </Field>
              <Button className="h-11 w-full" disabled={busy}>
                {busy && <Loader2 className="animate-spin" />}
                {mode === 'signin' ? '로그인' : '가입 메일 받기'}
                {!busy && <ArrowRight />}
              </Button>
            </form>
            <button
              className="mt-5 w-full text-sm text-slate-600 hover:text-teal-700"
              type="button"
              onClick={() => {
                setMode(mode === 'signin' ? 'signup' : 'signin');
                setNotice(null);
              }}
            >
              {mode === 'signin'
                ? '의뢰인이신가요? 회원가입'
                : '이미 계정이 있나요? 로그인'}
            </button>
            <div className="mt-9 border-t pt-5 text-center">
              <Link
                className="text-xs font-semibold text-slate-500 hover:text-teal-700"
                href="/demo"
              >
                기능 전체 데모 먼저 보기 →
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function BrandOnDark() {
  return (
    <Link href="/" className="flex items-center gap-3 text-white">
      <span className="grid size-10 place-items-center rounded-xl bg-teal-400 text-[#0f3c40]">
        <SunMedium className="size-5" />
      </span>
      <span>
        <strong className="block text-lg tracking-tight">SolarScope</strong>
        <span className="block text-[11px] font-medium tracking-[0.12em] text-teal-200">
          SOLAR ASSET CARE
        </span>
      </span>
    </Link>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between text-sm font-semibold text-slate-700">
        {label}
        {hint && <small className="font-normal text-slate-400">{hint}</small>}
      </span>
      {children}
    </label>
  );
}

function WorkspaceGate({
  supabase,
  session,
}: {
  supabase: SupabaseClient<Database>;
  session: Session;
}) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice>(null);

  const loadWorkspace = useCallback(async () => {
    try {
      const { data: membership, error: memberError } = await supabase
        .from('organization_members')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('status', 'active')
        .order('created_at')
        .limit(1)
        .maybeSingle();
      if (memberError) throw memberError;
      if (!membership) {
        setWorkspace(null);
        return;
      }
      const { data: organization, error: organizationError } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', membership.organization_id)
        .single();
      if (organizationError) throw organizationError;
      setWorkspace({ membership, organization });
    } catch (error) {
      setNotice({ tone: 'error', text: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, [session.user.id, supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadWorkspace(), 0);
    return () => window.clearTimeout(timer);
  }, [loadWorkspace]);

  if (loading)
    return <FullScreenLoading label="조직 권한을 확인하는 중입니다." />;
  if (!workspace) {
    return (
      <OrganizationOnboarding
        supabase={supabase}
        session={session}
        notice={notice}
        onReady={loadWorkspace}
      />
    );
  }
  return (
    <AdminConsole
      supabase={supabase}
      session={session}
      initialWorkspace={workspace}
    />
  );
}

function OrganizationOnboarding({
  supabase,
  session,
  notice: initialNotice,
  onReady,
}: {
  supabase: SupabaseClient<Database>;
  session: Session;
  notice: Notice;
  onReady: () => Promise<void>;
}) {
  const [name, setName] = useState('솔라이음');
  const [slug, setSlug] = useState('solar-ieum');
  const [setupCode, setSetupCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [requesterBusy, setRequesterBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(initialNotice);

  async function registerRequester() {
    setRequesterBusy(true);
    setNotice(null);
    try {
      const { error } = await supabase.rpc('register_requester');
      if (error) throw error;
      setNotice({
        tone: 'success',
        text: '의뢰인 계정을 만들었습니다. 이제 본인 발전소를 등록할 수 있습니다.',
      });
      await onReady();
    } catch (error) {
      setNotice({ tone: 'error', text: errorMessage(error) });
    } finally {
      setRequesterBusy(false);
    }
  }

  async function bootstrap(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const { error } = await supabase.rpc('bootstrap_organization', {
        p_name: name,
        p_slug: slug,
        p_setup_code: setupCode,
      });
      if (error) throw error;
      setNotice({
        tone: 'success',
        text: '조직과 최초 관리자 권한을 만들었습니다.',
      });
      await onReady();
    } catch (error) {
      setNotice({ tone: 'error', text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#eef3f5] px-5 py-10">
      <div className="mx-auto max-w-2xl rounded-3xl border bg-white p-7 shadow-sm md:p-10">
        <div className="flex items-center justify-between gap-4">
          <Brand />
          <Button variant="outline" onClick={() => supabase.auth.signOut()}>
            <LogOut /> 로그아웃
          </Button>
        </div>
        <div className="mt-12 grid gap-8 md:grid-cols-[0.85fr_1.15fr]">
          <div>
            <LockKeyhole className="size-9 text-teal-600" />
            <h1 className="mt-4 text-2xl font-bold tracking-tight">
              작업공간 연결
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              로그인 계정 <strong>{session.user.email}</strong>은 아직 조직에
              연결되지 않았습니다.
            </p>
            <p className="mt-4 rounded-xl bg-slate-50 p-4 text-xs leading-5 text-slate-600">
              직접 가입한 사용자는 의뢰인으로 시작합니다. 전문가와 추가 관리자는
              기존 관리자가 보낸 초대 메일로만 계정을 만듭니다.
            </p>
          </div>
          <div className="space-y-4 rounded-2xl border p-5">
            <NoticeBar notice={notice} />
            <div className="rounded-2xl bg-teal-50 p-5">
              <h2 className="font-bold text-teal-950">의뢰인으로 시작</h2>
              <p className="mt-2 text-xs leading-5 text-teal-800">
                본인 발전소만 보이는 의뢰인 계정을 연결합니다. 발전소 등록과
                점검 요청은 다음 화면에서 진행합니다.
              </p>
              <Button
                className="mt-4 h-10 w-full"
                type="button"
                disabled={requesterBusy}
                onClick={() => void registerRequester()}
              >
                {requesterBusy ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <ArrowRight />
                )}
                의뢰인 계정 연결
              </Button>
            </div>
            <details className="rounded-2xl border bg-slate-50 p-4">
              <summary className="cursor-pointer text-sm font-bold text-slate-700">
                최초 관리자 작업공간 개설
              </summary>
              <form onSubmit={bootstrap} className="mt-4 space-y-4">
                <Field label="조직명">
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </Field>
                <Field label="조직 식별자" hint="영문 소문자·숫자·하이픈">
                  <Input
                    value={slug}
                    onChange={(e) => setSlug(e.target.value.toLowerCase())}
                    pattern="[a-z0-9][a-z0-9-]{1,62}"
                    required
                  />
                </Field>
                <Field label="1회용 개설 코드">
                  <Input
                    value={setupCode}
                    onChange={(e) => setSetupCode(e.target.value.toUpperCase())}
                    autoComplete="off"
                    required
                  />
                </Field>
                <Button className="h-10 w-full" disabled={busy}>
                  {busy ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <ShieldCheck />
                  )}
                  최초 관리자 만들기
                </Button>
              </form>
            </details>
          </div>
        </div>
      </div>
    </main>
  );
}

function AdminConsole({
  supabase,
  session,
  initialWorkspace,
}: {
  supabase: SupabaseClient<Database>;
  session: Session;
  initialWorkspace: Workspace;
}) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [view, setView] = useState<View>('dashboard');
  const [plants, setPlants] = useState<Plant[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [files, setFiles] = useState<InspectionFile[]>([]);
  const [analysisRuns, setAnalysisRuns] = useState<AnalysisRun[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [maintenance, setMaintenance] = useState<Maintenance[]>([]);
  const [members, setMembers] = useState<Membership[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice>(null);

  const organizationId = workspace.organization.id;
  const role = workspace.membership.role;
  const isOwner = role === 'owner';
  const isExpert = role === 'expert';
  const isRequester = role === 'client';
  const canOperate = isOwner;
  const canCreateInspection = isOwner || isRequester;
  const canUpdateInspection = isOwner || isExpert;
  const canUpload = isOwner || isExpert;
  const canReview = isOwner || isExpert;
  const canCreateReport = isOwner || isExpert;
  const canApprove = isOwner;
  const canMaintain = isOwner;
  const visibleNavItems = navItems.filter((item) =>
    (roleViews[role] ?? ['dashboard']).includes(item.id),
  );

  const refresh = useCallback(async () => {
    try {
      const scoped = <T,>(
        request: PromiseLike<{ data: T | null; error: unknown }>,
      ) => request;
      const [
        plantResult,
        inspectionResult,
        fileResult,
        runResult,
        findingResult,
        reportResult,
        maintenanceResult,
        memberResult,
      ] = await Promise.all([
        scoped(
          supabase
            .from('plants')
            .select('*')
            .eq('organization_id', organizationId)
            .order('name'),
        ),
        scoped(
          supabase
            .from('inspections')
            .select('*')
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false }),
        ),
        scoped(
          supabase
            .from('inspection_files')
            .select('*')
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false }),
        ),
        scoped(
          supabase
            .from('analysis_runs')
            .select('*')
            .eq('organization_id', organizationId)
            .order('requested_at', { ascending: false }),
        ),
        scoped(
          supabase
            .from('findings')
            .select('*')
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false }),
        ),
        scoped(
          supabase
            .from('reports')
            .select('*')
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false }),
        ),
        scoped(
          supabase
            .from('maintenance_requests')
            .select('*')
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false }),
        ),
        scoped(
          supabase
            .from('organization_members')
            .select('*')
            .eq('organization_id', organizationId)
            .order('created_at'),
        ),
      ]);
      const results = [
        plantResult,
        inspectionResult,
        fileResult,
        runResult,
        findingResult,
        reportResult,
        maintenanceResult,
        memberResult,
      ];
      const failed = results.find((result) => result.error);
      if (failed?.error) throw failed.error;
      setPlants((plantResult.data ?? []) as Plant[]);
      setInspections((inspectionResult.data ?? []) as Inspection[]);
      setFiles((fileResult.data ?? []) as InspectionFile[]);
      setAnalysisRuns((runResult.data ?? []) as AnalysisRun[]);
      setFindings((findingResult.data ?? []) as Finding[]);
      setReports((reportResult.data ?? []) as Report[]);
      setMaintenance((maintenanceResult.data ?? []) as Maintenance[]);
      const nextMembers = (memberResult.data ?? []) as Membership[];
      setMembers(nextMembers);
      if (nextMembers.length) {
        const { data: profileRows, error } = await supabase
          .from('profiles')
          .select('*')
          .in(
            'user_id',
            nextMembers.map((member) => member.user_id),
          );
        if (error) throw error;
        setProfiles(
          Object.fromEntries(
            (profileRows ?? []).map((profile) => [profile.user_id, profile]),
          ),
        );
      }
    } catch (error) {
      setNotice({ tone: 'error', text: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, [organizationId, supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const shared = {
    supabase,
    session,
    organizationId,
    plants,
    inspections,
    files,
    analysisRuns,
    findings,
    reports,
    maintenance,
    members,
    profiles,
    refresh,
    setNotice,
  };

  return (
    <div className="min-h-screen bg-[#f2f5f6] text-slate-900">
      <header className="sticky top-0 z-30 border-b bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between gap-4 px-4 md:px-6">
          <Brand />
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <strong className="block text-sm">
                {workspace.organization.name}
              </strong>
              <span className="block text-xs text-slate-500">
                {roleLabels[role]} · {session.user.email}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refresh()}
              disabled={loading}
            >
              <RefreshCw className={loading ? 'animate-spin' : ''} />
              <span className="hidden md:inline">새로고침</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => supabase.auth.signOut()}
            >
              <LogOut /> <span className="hidden md:inline">로그아웃</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] md:grid-cols-[220px_1fr]">
        <aside className="border-b bg-white p-3 md:min-h-[calc(100vh-4rem)] md:border-r md:border-b-0 md:p-4">
          <nav className="flex gap-1 overflow-x-auto md:flex-col">
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setView(item.id);
                    setNotice(null);
                  }}
                  className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition md:w-full ${
                    view === item.id
                      ? 'bg-teal-50 text-teal-800'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <Icon className="size-4" /> {item.label}
                </button>
              );
            })}
          </nav>
          <div className="mt-6 hidden rounded-2xl bg-slate-50 p-4 md:block">
            <ShieldCheck className="size-5 text-teal-600" />
            <strong className="mt-3 block text-xs">
              조직별 접근 제어 적용
            </strong>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">
              다른 조직의 데이터와 원본 파일은 조회할 수 없습니다.
            </p>
          </div>
        </aside>

        <main className="min-w-0 p-4 md:p-6 lg:p-8">
          <NoticeBar notice={notice} />
          {loading && plants.length === 0 ? (
            <div className="grid min-h-[55vh] place-items-center">
              <Loader2 className="size-7 animate-spin text-teal-600" />
            </div>
          ) : (
            <>
              {view === 'dashboard' && (
                <DashboardView {...shared} setView={setView} />
              )}
              {view === 'plants' && (
                <PlantsView
                  {...shared}
                  canWrite={canOperate || isRequester}
                  requesterMode={isRequester}
                />
              )}
              {view === 'inspections' && (
                <InspectionsView
                  {...shared}
                  canCreate={canCreateInspection}
                  canUpdate={canUpdateInspection}
                  requesterMode={isRequester}
                  expertMode={isExpert}
                />
              )}
              {view === 'files' && (
                <FilesView {...shared} canWrite={canUpload} />
              )}
              {view === 'findings' && (
                <FindingsView {...shared} canWrite={canReview} />
              )}
              {view === 'reports' && (
                <ReportsView
                  {...shared}
                  canCreate={canCreateReport}
                  canApprove={canApprove}
                  requesterMode={isRequester}
                />
              )}
              {view === 'maintenance' && (
                <MaintenanceView {...shared} canWrite={canMaintain} />
              )}
              {view === 'members' && (
                <MembersView
                  {...shared}
                  workspace={workspace}
                  setWorkspace={setWorkspace}
                  canWrite={isOwner}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

type SharedProps = {
  supabase: SupabaseClient<Database>;
  session: Session;
  organizationId: string;
  plants: Plant[];
  inspections: Inspection[];
  files: InspectionFile[];
  analysisRuns: AnalysisRun[];
  findings: Finding[];
  reports: Report[];
  maintenance: Maintenance[];
  members: Membership[];
  profiles: Record<string, Profile>;
  refresh: () => Promise<void>;
  setNotice: (notice: Notice) => void;
};

function PageHeading({
  eyebrow,
  title,
  copy,
  action,
}: {
  eyebrow: string;
  title: string;
  copy: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
      <div>
        <p className="text-xs font-bold tracking-[0.14em] text-teal-700">
          {eyebrow}
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight md:text-3xl">
          {title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
          {copy}
        </p>
      </div>
      {action}
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: typeof Gauge;
  label: string;
  value: string | number;
  note: string;
}) {
  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-600">{label}</span>
        <span className="grid size-9 place-items-center rounded-xl bg-teal-50 text-teal-700">
          <Icon className="size-4" />
        </span>
      </div>
      <strong className="mt-5 block text-3xl tracking-tight">{value}</strong>
      <span className="mt-1 block text-xs text-slate-400">{note}</span>
    </div>
  );
}

function DashboardView(props: SharedProps & { setView: (view: View) => void }) {
  const activeInspections = props.inspections.filter(
    (item) => !['closed', 'cancelled'].includes(item.status),
  );
  const pendingFindings = props.findings.filter(
    (item) => item.disposition === 'pending',
  );
  const openMaintenance = props.maintenance.filter(
    (item) => !['completed', 'cancelled'].includes(item.status),
  );
  const plantName = (id: string) =>
    props.plants.find((plant) => plant.id === id)?.name ?? '발전소';

  return (
    <>
      <PageHeading
        eyebrow="LIVE WORKSPACE"
        title="실제 운영 현황"
        copy="아래 숫자와 목록은 데모용 고정값이 아니라 현재 Supabase 프로젝트에 저장된 조직 데이터입니다."
        action={
          <Link
            href="/demo"
            className="text-sm font-semibold text-teal-700 hover:underline"
          >
            전체 기능 데모 보기 →
          </Link>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Building2}
          label="등록 발전소"
          value={props.plants.length}
          note="조직 자산"
        />
        <MetricCard
          icon={ClipboardCheck}
          label="진행 점검"
          value={activeInspections.length}
          note="취소·종료 제외"
        />
        <MetricCard
          icon={ThermometerSun}
          label="검토 후보"
          value={pendingFindings.length}
          note="전문가 판단 대기"
        />
        <MetricCard
          icon={Wrench}
          label="진행 조치"
          value={openMaintenance.length}
          note="완료·취소 제외"
        />
      </div>

      {props.plants.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="첫 발전소부터 등록하세요"
          copy="발전소가 있어야 점검을 접수하고 열화상 원본을 연결할 수 있습니다."
          action="발전소 등록"
          onAction={() => props.setView('plants')}
        />
      ) : (
        <div className="mt-6 grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">최근 점검</h2>
              <button
                className="text-xs font-semibold text-teal-700"
                onClick={() => props.setView('inspections')}
              >
                전체 보기
              </button>
            </div>
            <div className="mt-4 divide-y">
              {props.inspections.slice(0, 6).map((inspection) => (
                <div
                  key={inspection.id}
                  className="flex items-center justify-between gap-4 py-4"
                >
                  <div className="min-w-0">
                    <strong className="block truncate text-sm">
                      {plantName(inspection.plant_id)}
                    </strong>
                    <span className="mt-1 block text-xs text-slate-500">
                      {inspection.inspection_code} ·{' '}
                      {inspection.purpose || '목적 미입력'}
                    </span>
                  </div>
                  <StatusPill>
                    {statusLabel(inspection.status, inspectionStatuses)}
                  </StatusPill>
                </div>
              ))}
              {props.inspections.length === 0 && (
                <p className="py-8 text-center text-sm text-slate-400">
                  아직 접수된 점검이 없습니다.
                </p>
              )}
            </div>
          </section>
          <section className="rounded-2xl bg-[#123e42] p-6 text-white shadow-sm">
            <FileCheck2 className="size-7 text-teal-300" />
            <h2 className="mt-5 text-xl font-bold">운영 시작 순서</h2>
            <ol className="mt-5 space-y-4 text-sm text-slate-200">
              {[
                '발전소 정보 등록',
                '점검 접수와 일정 지정',
                '열화상 원본 업로드·상대 분석',
                '전문가 판정 후 보고서·조치 연결',
              ].map((item, index) => (
                <li key={item} className="flex gap-3">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-bold text-teal-200">
                    {index + 1}
                  </span>
                  <span className="pt-0.5">{item}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}
    </>
  );
}

function EmptyState({
  icon: Icon,
  title,
  copy,
  action,
  onAction,
}: {
  icon: typeof Building2;
  title: string;
  copy: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="mt-6 rounded-2xl border border-dashed bg-white px-6 py-14 text-center">
      <Icon className="mx-auto size-9 text-slate-300" />
      <h2 className="mt-4 font-bold">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
        {copy}
      </p>
      {action && onAction && (
        <Button className="mt-5" onClick={onAction}>
          <Plus /> {action}
        </Button>
      )}
    </div>
  );
}

function StatusPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="shrink-0 rounded-full border border-teal-100 bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-800">
      {children}
    </span>
  );
}

function PlantsView(
  props: SharedProps & { canWrite: boolean; requesterMode: boolean },
) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [address, setAddress] = useState('');
  const [capacity, setCapacity] = useState('');
  const [commissionedOn, setCommissionedOn] = useState('');
  const [requesterId, setRequesterId] = useState('');
  const [busy, setBusy] = useState(false);

  function reset() {
    setEditingId(null);
    setName('');
    setCode('');
    setAddress('');
    setCapacity('');
    setCommissionedOn('');
    setRequesterId('');
  }

  function edit(plant: Plant) {
    setEditingId(plant.id);
    setName(plant.name);
    setCode(plant.code ?? '');
    setAddress(plant.address ?? '');
    setCapacity(plant.capacity_kw == null ? '' : String(plant.capacity_kw));
    setCommissionedOn(plant.commissioned_on ?? '');
  }

  async function save(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    props.setNotice(null);
    try {
      const result = props.requesterMode
        ? await props.supabase.rpc('create_requester_plant', {
            p_name: name.trim(),
            p_address: address.trim(),
            p_capacity_kw: Number(capacity),
            p_commissioned_on: commissionedOn,
          })
        : editingId
          ? await props.supabase
              .from('plants')
              .update({
                organization_id: props.organizationId,
                name: name.trim(),
                code: code.trim() || null,
                address: address.trim() || null,
                capacity_kw: capacity ? Number(capacity) : null,
                commissioned_on: commissionedOn || null,
                timezone: backendConfig.displayTimezone,
              })
              .eq('id', editingId)
          : await props.supabase
              .from('plants')
              .insert({
                organization_id: props.organizationId,
                name: name.trim(),
                code: code.trim() || null,
                address: address.trim() || null,
                capacity_kw: capacity ? Number(capacity) : null,
                commissioned_on: commissionedOn || null,
                timezone: backendConfig.displayTimezone,
              })
              .select('id')
              .single();
      if (result.error) throw result.error;
      if (
        !props.requesterMode &&
        !editingId &&
        requesterId &&
        result.data &&
        'id' in result.data
      ) {
        const { error } = await props.supabase.rpc(
          'assign_requester_to_plant',
          {
            p_plant_id: result.data.id,
            p_requester_user_id: requesterId,
          },
        );
        if (error) throw error;
      }
      props.setNotice({
        tone: 'success',
        text: editingId
          ? '발전소 정보를 수정했습니다.'
          : props.requesterMode
            ? '내 발전소를 등록했습니다.'
            : '발전소를 등록했습니다.',
      });
      reset();
      await props.refresh();
    } catch (error) {
      props.setNotice({ tone: 'error', text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="ASSET REGISTRY"
        title={props.requesterMode ? '내 발전소' : '발전소 관리'}
        copy={
          props.requesterMode
            ? '본인이 소유하거나 관리하는 발전소만 표시됩니다. 발전소를 등록하면 점검을 요청할 수 있습니다.'
            : '점검과 보고서가 연결될 기준 자산을 등록합니다. 용량은 kW, 시간은 발전소의 현지 시간대를 기준으로 표시합니다.'
        }
      />
      <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
        <form
          onSubmit={save}
          className="h-fit space-y-4 rounded-2xl border bg-white p-5 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-bold">
              {editingId
                ? '발전소 수정'
                : props.requesterMode
                  ? '내 발전소 등록'
                  : '새 발전소'}
            </h2>
            {editingId && (
              <button
                type="button"
                onClick={reset}
                className="text-xs text-slate-500 underline"
              >
                취소
              </button>
            )}
          </div>
          {!props.canWrite && <ReadOnlyNote />}
          <Field label="발전소명">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!props.canWrite}
              required
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            {!props.requesterMode && (
              <Field label="관리 코드">
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  disabled={!props.canWrite}
                  placeholder="PLANT-001"
                />
              </Field>
            )}
            <Field label="설비용량(kW)">
              <Input
                type="number"
                min="0"
                step="0.001"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                disabled={!props.canWrite}
                required={props.requesterMode}
              />
            </Field>
          </div>
          <Field label="주소">
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              disabled={!props.canWrite}
            />
          </Field>
          {!props.requesterMode && !editingId && (
            <Field label="의뢰인 연결" hint="선택 사항">
              <select
                className="h-9 w-full rounded-lg border bg-white px-3 text-sm"
                value={requesterId}
                onChange={(e) => setRequesterId(e.target.value)}
                disabled={!props.canWrite}
              >
                <option value="">나중에 연결</option>
                {props.members
                  .filter(
                    (member) =>
                      member.role === 'client' && member.status === 'active',
                  )
                  .map((member) => (
                    <option key={member.user_id} value={member.user_id}>
                      {props.profiles[member.user_id]?.display_name ||
                        props.profiles[member.user_id]?.email ||
                        member.user_id}
                    </option>
                  ))}
              </select>
            </Field>
          )}
          <Field label="상업운전 시작일">
            <Input
              type="date"
              value={commissionedOn}
              onChange={(e) => setCommissionedOn(e.target.value)}
              disabled={!props.canWrite}
              required={props.requesterMode}
            />
          </Field>
          <Button className="w-full" disabled={!props.canWrite || busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Plus />}
            {editingId ? '변경 저장' : '발전소 등록'}
          </Button>
        </form>
        <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="border-b px-5 py-4">
            <h2 className="font-bold">등록 자산 {props.plants.length}곳</h2>
          </div>
          <div className="divide-y">
            {props.plants.map((plant) => (
              <div
                key={plant.id}
                className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <strong>{plant.name}</strong>
                    {plant.code && <StatusPill>{plant.code}</StatusPill>}
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    {plant.address || '주소 미입력'}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {plant.capacity_kw == null
                      ? '용량 미입력'
                      : `${Number(plant.capacity_kw).toLocaleString()} kW`}{' '}
                    · {plant.timezone}
                  </p>
                </div>
                {props.canWrite && !props.requesterMode && (
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    onClick={() => edit(plant)}
                  >
                    수정
                  </Button>
                )}
              </div>
            ))}
            {props.plants.length === 0 && (
              <p className="px-5 py-16 text-center text-sm text-slate-400">
                등록된 발전소가 없습니다.
              </p>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

function ReadOnlyNote() {
  return (
    <p className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">
      현재 역할은 이 항목을 조회할 수 있지만 변경할 수 없습니다.
    </p>
  );
}

function InspectionsView(
  props: SharedProps & {
    canCreate: boolean;
    canUpdate: boolean;
    requesterMode: boolean;
    expertMode: boolean;
  },
) {
  const [plantId, setPlantId] = useState('');
  const [code, setCode] = useState(
    `INS-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}`,
  );
  const [purpose, setPurpose] = useState('정기 열화상 점검');
  const [scheduledAt, setScheduledAt] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [notes, setNotes] = useState('');
  const [expertId, setExpertId] = useState('');
  const [busy, setBusy] = useState(false);

  const effectivePlantId = plantId || props.plants[0]?.id || '';

  async function create(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    props.setNotice(null);
    try {
      const { error } = props.requesterMode
        ? await props.supabase.rpc('request_inspection', {
            p_plant_id: effectivePlantId,
            p_purpose: purpose.trim(),
            p_notes: notes.trim(),
          })
        : await props.supabase.from('inspections').insert({
            organization_id: props.organizationId,
            plant_id: effectivePlantId,
            inspection_code: code.trim(),
            purpose: purpose.trim() || null,
            status: scheduledAt ? 'scheduled' : 'requested',
            scheduled_at: scheduledAt
              ? new Date(scheduledAt).toISOString()
              : null,
            due_at: dueAt ? new Date(dueAt).toISOString() : null,
            capture_timezone: backendConfig.displayTimezone,
            assigned_expert_user_id: expertId || null,
            created_by: props.session.user.id,
            notes: notes.trim() || null,
          });
      if (error) throw error;
      props.setNotice({ tone: 'success', text: '점검을 접수했습니다.' });
      setCode(`INS-${Date.now().toString().slice(-8)}`);
      setNotes('');
      await props.refresh();
    } catch (error) {
      props.setNotice({ tone: 'error', text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(id: string, status: string) {
    props.setNotice(null);
    const { error } = await props.supabase
      .from('inspections')
      .update({ status })
      .eq('id', id);
    if (error) props.setNotice({ tone: 'error', text: errorMessage(error) });
    else {
      props.setNotice({ tone: 'success', text: '점검 상태를 변경했습니다.' });
      await props.refresh();
    }
  }

  async function assignExpert(id: string, assignedExpertUserId: string) {
    props.setNotice(null);
    const { error } = await props.supabase
      .from('inspections')
      .update({ assigned_expert_user_id: assignedExpertUserId || null })
      .eq('id', id);
    if (error) props.setNotice({ tone: 'error', text: errorMessage(error) });
    else {
      props.setNotice({ tone: 'success', text: '담당 전문가를 변경했습니다.' });
      await props.refresh();
    }
  }

  const plantName = (id: string) =>
    props.plants.find((plant) => plant.id === id)?.name ?? '삭제된 발전소';
  const activeExperts = props.members.filter(
    (member) => member.role === 'expert' && member.status === 'active',
  );
  const availableStatuses = props.expertMode
    ? inspectionStatuses.filter(([key]) =>
        ['expert_review', 'approval'].includes(key),
      )
    : inspectionStatuses;

  return (
    <>
      <PageHeading
        eyebrow="INSPECTION WORKFLOW"
        title={props.requesterMode ? '내 점검 요청' : '점검 접수·진행 관리'}
        copy={
          props.requesterMode
            ? '내 발전소의 열화상 점검을 요청하고 진행 상태와 발행 결과를 확인합니다.'
            : '현장 일정과 마감 시각은 UTC로 안전하게 저장하고 화면에서는 Asia/Seoul 기준으로 표시합니다.'
        }
      />
      <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
        <form
          onSubmit={create}
          className="h-fit space-y-4 rounded-2xl border bg-white p-5 shadow-sm"
        >
          <h2 className="font-bold">
            {props.requesterMode ? '새 점검 요청' : '새 점검 접수'}
          </h2>
          {!props.canCreate && <ReadOnlyNote />}
          {props.plants.length === 0 && (
            <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
              먼저 발전소를 등록해야 합니다.
            </p>
          )}
          <Field label="대상 발전소">
            <select
              className="h-9 w-full rounded-lg border bg-white px-3 text-sm"
              value={effectivePlantId}
              onChange={(e) => setPlantId(e.target.value)}
              disabled={!props.canCreate}
            >
              {props.plants.map((plant) => (
                <option key={plant.id} value={plant.id}>
                  {plant.name}
                </option>
              ))}
            </select>
          </Field>
          {!props.requesterMode && (
            <Field label="점검 번호">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={!props.canCreate}
                required
              />
            </Field>
          )}
          <Field label="점검 목적">
            <Input
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              disabled={!props.canCreate}
            />
          </Field>
          {!props.requesterMode && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="예정 일시">
                  <Input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    disabled={!props.canCreate}
                  />
                </Field>
                <Field label="완료 목표">
                  <Input
                    type="datetime-local"
                    value={dueAt}
                    onChange={(e) => setDueAt(e.target.value)}
                    disabled={!props.canCreate}
                  />
                </Field>
              </div>
              <Field label="담당 전문가">
                <select
                  className="h-9 w-full rounded-lg border bg-white px-3 text-sm"
                  value={expertId}
                  onChange={(e) => setExpertId(e.target.value)}
                  disabled={!props.canCreate}
                >
                  <option value="">미배정</option>
                  {activeExperts.map((member) => (
                    <option key={member.user_id} value={member.user_id}>
                      {props.profiles[member.user_id]?.display_name ||
                        props.profiles[member.user_id]?.email ||
                        member.user_id}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          )}
          <Field label="현장 메모">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={!props.canCreate}
              rows={3}
            />
          </Field>
          <Button
            className="w-full"
            disabled={!props.canCreate || !effectivePlantId || busy}
          >
            {busy ? <Loader2 className="animate-spin" /> : <Plus />}
            {props.requesterMode ? '점검 요청' : '점검 접수'}
          </Button>
        </form>
        <section className="space-y-3">
          {props.inspections.map((inspection) => (
            <article
              key={inspection.id}
              className="rounded-2xl border bg-white p-5 shadow-sm"
            >
              <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <strong>{plantName(inspection.plant_id)}</strong>
                    <StatusPill>{inspection.inspection_code}</StatusPill>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    {inspection.purpose || '목적 미입력'}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    예정 {formatDateTime(inspection.scheduled_at)} · 마감{' '}
                    {formatDateTime(inspection.due_at)}
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:items-end">
                  {!props.requesterMode && !props.expertMode && (
                    <select
                      className="h-9 max-w-56 rounded-lg border bg-white px-3 text-xs"
                      value={inspection.assigned_expert_user_id ?? ''}
                      onChange={(e) =>
                        void assignExpert(inspection.id, e.target.value)
                      }
                      disabled={!props.canUpdate}
                      aria-label="담당 전문가"
                    >
                      <option value="">전문가 미배정</option>
                      {activeExperts.map((member) => (
                        <option key={member.user_id} value={member.user_id}>
                          {props.profiles[member.user_id]?.display_name ||
                            props.profiles[member.user_id]?.email ||
                            member.user_id}
                        </option>
                      ))}
                    </select>
                  )}
                  {props.canUpdate ? (
                    <select
                      className="h-9 rounded-lg border bg-white px-3 text-sm font-semibold text-slate-700"
                      value={inspection.status}
                      onChange={(e) =>
                        void updateStatus(inspection.id, e.target.value)
                      }
                    >
                      {!availableStatuses.some(
                        ([key]) => key === inspection.status,
                      ) && (
                        <option value={inspection.status}>
                          {statusLabel(inspection.status, inspectionStatuses)}
                        </option>
                      )}
                      {availableStatuses.map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <StatusPill>
                      {statusLabel(inspection.status, inspectionStatuses)}
                    </StatusPill>
                  )}
                </div>
              </div>
              {inspection.notes && (
                <p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                  {inspection.notes}
                </p>
              )}
            </article>
          ))}
          {props.inspections.length === 0 && (
            <EmptyState
              icon={ClipboardCheck}
              title="접수된 점검이 없습니다"
              copy="왼쪽 양식에서 첫 점검을 만들어 보세요."
            />
          )}
        </section>
      </div>
    </>
  );
}

async function fileSha256(file: File) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    await file.arrayBuffer(),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

async function imageValues(file: File) {
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, 320 / bitmap.width, 300 / bitmap.height);
  const width = Math.max(1, Math.round(bitmap.width * ratio));
  const height = Math.max(1, Math.round(bitmap.height * ratio));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('이미지 분석용 캔버스를 만들 수 없습니다.');
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const pixels = context.getImageData(0, 0, width, height).data;
  const values: number[] = [];
  for (let index = 0; index < pixels.length; index += 4) {
    values.push(
      (pixels[index] * 0.2126 +
        pixels[index + 1] * 0.7152 +
        pixels[index + 2] * 0.0722) /
        255,
    );
  }
  return { width, height, values };
}

function FilesView(props: SharedProps & { canWrite: boolean }) {
  const [inspectionId, setInspectionId] = useState('');
  const [kind, setKind] = useState<'thermal_original' | 'visible_original'>(
    'thermal_original',
  );
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [runAnalysis, setRunAnalysis] = useState(true);
  const [busy, setBusy] = useState(false);

  const effectiveInspectionId = inspectionId || props.inspections[0]?.id || '';

  async function upload(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFile || !effectiveInspectionId) return;
    setBusy(true);
    props.setNotice({
      tone: 'info',
      text: '원본 파일을 저장하고 무결성 값을 계산하는 중입니다.',
    });
    let storagePath = '';
    try {
      const extension =
        selectedFile.name
          .split('.')
          .pop()
          ?.replace(/[^a-zA-Z0-9]/g, '')
          .toLowerCase() || 'bin';
      storagePath = `${props.organizationId}/${effectiveInspectionId}/${crypto.randomUUID()}.${extension}`;
      const sha256 = await fileSha256(selectedFile);
      const { error: uploadError } = await props.supabase.storage
        .from('inspection-originals')
        .upload(storagePath, selectedFile, {
          contentType: selectedFile.type || 'application/octet-stream',
          upsert: false,
        });
      if (uploadError) throw uploadError;
      const { data: fileRow, error: rowError } = await props.supabase
        .from('inspection_files')
        .insert({
          organization_id: props.organizationId,
          inspection_id: effectiveInspectionId,
          kind,
          storage_bucket: 'inspection-originals',
          storage_path: storagePath,
          original_name: selectedFile.name,
          mime_type: selectedFile.type || null,
          bytes: selectedFile.size,
          sha256,
          captured_at: selectedFile.lastModified
            ? new Date(selectedFile.lastModified).toISOString()
            : null,
          capture_timezone: backendConfig.displayTimezone,
          quality_status: 'pending',
          created_by: props.session.user.id,
        })
        .select('*')
        .single();
      if (rowError) {
        await props.supabase.storage
          .from('inspection-originals')
          .remove([storagePath]);
        throw rowError;
      }

      let analysisText = '';
      if (
        runAnalysis &&
        kind === 'thermal_original' &&
        ['image/jpeg', 'image/png'].includes(selectedFile.type)
      ) {
        props.setNotice({
          tone: 'info',
          text: '원본 저장 완료. 색상 분포 기반 상대 분석을 실행하는 중입니다.',
        });
        const pixels = await imageValues(selectedFile);
        const response = await fetch('/api/thermal/analyze', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...pixels, sensitivity: 72 }),
        });
        const analysis = (await response.json()) as AnalysisResult & {
          error?: string;
        };
        if (!response.ok)
          throw new Error(analysis.error || '상대 분석에 실패했습니다.');
        const { data: run, error: runError } = await props.supabase
          .from('analysis_runs')
          .insert({
            organization_id: props.organizationId,
            inspection_id: effectiveInspectionId,
            algorithm_key: 'rgb-luminance-relative',
            algorithm_version: '1.0.0',
            status: 'succeeded',
            input_manifest: {
              inspection_file_id: fileRow.id,
              normalized_pixels: pixels.width * pixels.height,
            },
            result_summary: {
              ...analysis.summary,
              disclaimer: analysis.disclaimer,
              analyzed_at: analysis.analyzedAt,
            },
            requested_by: props.session.user.id,
            started_at: analysis.analyzedAt,
            finished_at: analysis.analyzedAt,
          })
          .select('id')
          .single();
        if (runError) throw runError;
        if (analysis.regions.length) {
          const { error: findingError } = await props.supabase
            .from('findings')
            .insert(
              analysis.regions.map((region) => ({
                organization_id: props.organizationId,
                inspection_id: effectiveInspectionId,
                analysis_run_id: run.id,
                source: 'rule_candidate',
                kind: region.kind === 'hot' ? 'hotspot' : 'coldspot',
                severity:
                  region.score >= 90
                    ? 'major'
                    : region.score >= 75
                      ? 'review'
                      : 'info',
                relative_heat_score: region.score,
                region: {
                  x: region.x,
                  y: region.y,
                  width: region.width,
                  height: region.height,
                  area_percent: region.areaPercent,
                } as Json,
                disposition: 'pending',
              })),
            );
          if (findingError) throw findingError;
        }
        const { error: inspectionError } = await props.supabase
          .from('inspections')
          .update({ status: 'expert_review' })
          .eq('id', effectiveInspectionId);
        if (inspectionError) throw inspectionError;
        analysisText = ` 상대 분석 후보 ${analysis.regions.length}건을 만들었습니다.`;
      }
      props.setNotice({
        tone: 'success',
        text: `원본 파일과 SHA-256 무결성 값을 저장했습니다.${analysisText}`,
      });
      setSelectedFile(null);
      await props.refresh();
    } catch (error) {
      props.setNotice({ tone: 'error', text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  async function download(file: InspectionFile) {
    const { data, error } = await props.supabase.storage
      .from(file.storage_bucket)
      .createSignedUrl(file.storage_path, 60);
    if (error) props.setNotice({ tone: 'error', text: errorMessage(error) });
    else window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  const inspectionLabel = (id: string) => {
    const inspection = props.inspections.find((item) => item.id === id);
    const plant = props.plants.find((item) => item.id === inspection?.plant_id);
    return inspection
      ? `${plant?.name ?? '발전소'} · ${inspection.inspection_code}`
      : '삭제된 점검';
  };

  return (
    <>
      <PageHeading
        eyebrow="PRIVATE ORIGINALS"
        title="열화상·가시광 원본 업로드"
        copy="파일은 공개 URL이 아닌 비공개 버킷에 저장됩니다. SHA-256 무결성 값으로 원본 변경 여부를 확인할 수 있습니다."
      />
      <div className="grid gap-5 xl:grid-cols-[390px_1fr]">
        <form
          onSubmit={upload}
          className="h-fit space-y-4 rounded-2xl border bg-white p-5 shadow-sm"
        >
          <h2 className="font-bold">점검 파일 저장</h2>
          {!props.canWrite && <ReadOnlyNote />}
          <Field label="연결할 점검">
            <select
              className="h-9 w-full rounded-lg border bg-white px-3 text-sm"
              value={effectiveInspectionId}
              onChange={(e) => setInspectionId(e.target.value)}
              disabled={!props.canWrite}
            >
              {props.inspections.map((inspection) => (
                <option key={inspection.id} value={inspection.id}>
                  {inspectionLabel(inspection.id)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="파일 종류">
            <select
              className="h-9 w-full rounded-lg border bg-white px-3 text-sm"
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
              disabled={!props.canWrite}
            >
              <option value="thermal_original">열화상 원본</option>
              <option value="visible_original">가시광 원본</option>
            </select>
          </Field>
          <label className="grid min-h-36 cursor-pointer place-items-center rounded-2xl border-2 border-dashed bg-slate-50 px-5 text-center hover:border-teal-300">
            <span>
              <ImageIcon className="mx-auto size-8 text-slate-300" />
              <strong className="mt-3 block text-sm">
                {selectedFile?.name || '이미지를 선택하세요'}
              </strong>
              <span className="mt-1 block text-xs text-slate-400">
                JPG·PNG·TIFF, 최대 50MB
              </span>
            </span>
            <input
              className="sr-only"
              type="file"
              accept="image/jpeg,image/png,image/tiff,.tif,.tiff"
              disabled={!props.canWrite}
              onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {kind === 'thermal_original' && (
            <label className="flex items-start gap-3 rounded-xl bg-teal-50 p-3 text-xs leading-5 text-teal-900">
              <input
                type="checkbox"
                className="mt-1"
                checked={runAnalysis}
                onChange={(e) => setRunAnalysis(e.target.checked)}
              />
              JPG·PNG이면 저장 직후 색상 분포 기반 상대 분석 후보도 만듭니다.
              실제 섭씨 온도나 고장 확정값은 아닙니다.
            </label>
          )}
          <Button
            className="w-full"
            disabled={
              !props.canWrite || !effectiveInspectionId || !selectedFile || busy
            }
          >
            {busy ? <Loader2 className="animate-spin" /> : <UploadCloud />}원본
            저장
            {runAnalysis && kind === 'thermal_original' ? ' + 상대 분석' : ''}
          </Button>
        </form>
        <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="border-b px-5 py-4">
            <h2 className="font-bold">저장 파일 {props.files.length}개</h2>
          </div>
          <div className="divide-y">
            {props.files.map((file) => (
              <div
                key={file.id}
                className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="size-4 shrink-0 text-teal-600" />
                    <strong className="truncate text-sm">
                      {file.original_name}
                    </strong>
                  </div>
                  <p className="mt-2 truncate text-xs text-slate-500">
                    {inspectionLabel(file.inspection_id)}
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-slate-400">
                    SHA-256 {file.sha256?.slice(0, 18)}… ·{' '}
                    {file.bytes
                      ? `${Math.round(file.bytes / 1024).toLocaleString()} KB`
                      : '크기 미상'}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void download(file)}
                >
                  <Download />
                  60초 다운로드
                </Button>
              </div>
            ))}
            {props.files.length === 0 && (
              <p className="px-5 py-16 text-center text-sm text-slate-400">
                저장된 원본 파일이 없습니다.
              </p>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

function FindingsView(props: SharedProps & { canWrite: boolean }) {
  async function decide(id: string, disposition: 'accepted' | 'rejected') {
    const note =
      disposition === 'accepted'
        ? '전문가가 후보를 이상 소견으로 채택함'
        : '전문가가 오탐 후보로 제외함';
    const { error } = await props.supabase
      .from('findings')
      .update({
        disposition,
        expert_note: note,
        reviewed_by: props.session.user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) props.setNotice({ tone: 'error', text: errorMessage(error) });
    else {
      props.setNotice({
        tone: 'success',
        text:
          disposition === 'accepted'
            ? '이상 소견으로 채택했습니다.'
            : '후보를 제외했습니다.',
      });
      await props.refresh();
    }
  }
  const inspectionLabel = (id: string) =>
    props.inspections.find((item) => item.id === id)?.inspection_code ?? '점검';
  return (
    <>
      <PageHeading
        eyebrow="HUMAN IN THE LOOP"
        title="분석 후보·전문가 판정"
        copy="시스템은 색상 분포에서 검토 후보만 만들며, 고장 확정과 보고서 반영 여부는 전문가가 결정합니다."
      />
      <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
        <strong>중요:</strong> 방사율·촬영거리·반사온도·기상 조건과 온도
        메타데이터가 없는 일반 이미지는 실제 온도 측정값으로 사용할 수 없습니다.
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {props.findings.map((finding) => (
          <article
            key={finding.id}
            className="rounded-2xl border bg-white p-5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <span
                className={`grid size-10 place-items-center rounded-xl ${finding.kind === 'hotspot' ? 'bg-orange-50 text-orange-600' : 'bg-sky-50 text-sky-600'}`}
              >
                <ThermometerSun className="size-5" />
              </span>
              <StatusPill>
                {finding.disposition === 'pending'
                  ? '판정 대기'
                  : finding.disposition === 'accepted'
                    ? '채택'
                    : '제외'}
              </StatusPill>
            </div>
            <h2 className="mt-5 font-bold">
              {finding.kind === 'hotspot' ? '고온 상대 후보' : '저온 상대 후보'}
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              {inspectionLabel(finding.inspection_id)} · 상대 점수{' '}
              {finding.relative_heat_score ?? '—'}
            </p>
            {finding.expert_note && (
              <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                {finding.expert_note}
              </p>
            )}
            {finding.disposition === 'pending' && (
              <div className="mt-5 grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  disabled={!props.canWrite}
                  onClick={() => void decide(finding.id, 'accepted')}
                >
                  이상 채택
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!props.canWrite}
                  onClick={() => void decide(finding.id, 'rejected')}
                >
                  오탐 제외
                </Button>
              </div>
            )}
          </article>
        ))}
      </div>
      {props.findings.length === 0 && (
        <EmptyState
          icon={ThermometerSun}
          title="분석 후보가 없습니다"
          copy="열화상 JPG 또는 PNG를 업로드하면서 상대 분석을 실행하면 후보가 생성됩니다."
        />
      )}
    </>
  );
}

function ReportsView(
  props: SharedProps & {
    canCreate: boolean;
    canApprove: boolean;
    requesterMode: boolean;
  },
) {
  const [inspectionId, setInspectionId] = useState('');
  const [title, setTitle] = useState('태양광 발전설비 열화상 점검 보고서');
  const [busy, setBusy] = useState(false);
  const effectiveInspectionId = inspectionId || props.inspections[0]?.id || '';
  const availableReportStatuses = props.canApprove
    ? reportStatuses
    : reportStatuses.filter(([key]) => ['draft', 'review'].includes(key));

  async function create(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const version =
        Math.max(
          0,
          ...props.reports
            .filter((report) => report.inspection_id === effectiveInspectionId)
            .map((report) => report.version),
        ) + 1;
      const { error } = await props.supabase.from('reports').insert({
        organization_id: props.organizationId,
        inspection_id: effectiveInspectionId,
        title: title.trim(),
        version,
        status: 'draft',
        created_by: props.session.user.id,
      });
      if (error) throw error;
      props.setNotice({
        tone: 'success',
        text: `보고서 ${version}차 초안을 만들었습니다.`,
      });
      await props.refresh();
    } catch (error) {
      props.setNotice({ tone: 'error', text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(report: Report, status: string) {
    const now = new Date().toISOString();
    const updates: Database['public']['Tables']['reports']['Update'] = {
      status,
    };
    if (status === 'approved') {
      updates.approved_at = now;
      updates.approved_by = props.session.user.id;
    }
    if (status === 'published') updates.published_at = now;
    if (status === 'withdrawn') updates.withdrawn_at = now;
    const { error } = await props.supabase
      .from('reports')
      .update(updates)
      .eq('id', report.id);
    if (error) props.setNotice({ tone: 'error', text: errorMessage(error) });
    else {
      if (status === 'published')
        await props.supabase
          .from('inspections')
          .update({ status: 'published' })
          .eq('id', report.inspection_id);
      props.setNotice({ tone: 'success', text: '보고서 상태를 변경했습니다.' });
      await props.refresh();
    }
  }
  const inspectionLabel = (id: string) =>
    props.inspections.find((item) => item.id === id)?.inspection_code ?? '점검';
  return (
    <>
      <PageHeading
        eyebrow="REPORT CONTROL"
        title={props.requesterMode ? '발행 보고서' : '보고서 버전·승인·발행'}
        copy={
          props.requesterMode
            ? '관리자가 최종 발행한 내 발전소 보고서만 표시됩니다.'
            : '점검별로 버전을 나눠 보존하고 승인자와 발행 시각을 남깁니다. 전문가는 검토 요청까지, 최종 승인과 발행은 관리자만 처리합니다.'
        }
      />
      <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
        {props.canCreate ? (
          <form
            onSubmit={create}
            className="h-fit space-y-4 rounded-2xl border bg-white p-5 shadow-sm"
          >
            <h2 className="font-bold">보고서 초안 만들기</h2>
            <Field label="점검">
              <select
                className="h-9 w-full rounded-lg border bg-white px-3 text-sm"
                value={effectiveInspectionId}
                onChange={(e) => setInspectionId(e.target.value)}
              >
                {props.inspections.map((item) => (
                  <option key={item.id} value={item.id}>
                    {inspectionLabel(item.id)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="보고서 제목">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </Field>
            <Button
              className="w-full"
              disabled={!effectiveInspectionId || busy}
            >
              {busy ? <Loader2 className="animate-spin" /> : <Plus />}초안 생성
            </Button>
          </form>
        ) : (
          <div className="h-fit rounded-2xl border bg-white p-5 shadow-sm">
            <FileCheck2 className="size-7 text-teal-600" />
            <h2 className="mt-4 font-bold">최종 결과만 제공됩니다</h2>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              작성 중이거나 내부 검토 중인 문서는 보이지 않으며, 관리자가 발행한
              버전만 열람할 수 있습니다.
            </p>
          </div>
        )}
        <section className="space-y-3">
          {props.reports.map((report) => (
            <article
              key={report.id}
              className="rounded-2xl border bg-white p-5 shadow-sm"
            >
              <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <strong>{report.title}</strong>
                    <StatusPill>{report.version}차</StatusPill>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    {inspectionLabel(report.inspection_id)} · 생성{' '}
                    {formatDateTime(report.created_at)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/reports/${report.id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Button variant="outline" size="sm">
                      <FileText />
                      인쇄 보기
                    </Button>
                  </Link>
                  {props.canCreate ? (
                    <select
                      className="h-8 rounded-lg border bg-white px-2 text-xs font-semibold"
                      value={report.status}
                      onChange={(e) =>
                        void updateStatus(report, e.target.value)
                      }
                    >
                      {!availableReportStatuses.some(
                        ([key]) => key === report.status,
                      ) && (
                        <option value={report.status}>
                          {statusLabel(report.status, reportStatuses)}
                        </option>
                      )}
                      {availableReportStatuses.map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <StatusPill>
                      {statusLabel(report.status, reportStatuses)}
                    </StatusPill>
                  )}
                </div>
              </div>
            </article>
          ))}
          {props.reports.length === 0 && (
            <EmptyState
              icon={FileText}
              title="작성된 보고서가 없습니다"
              copy="완료할 점검을 선택하고 첫 초안을 만들어 보세요."
            />
          )}
        </section>
      </div>
    </>
  );
}

function MaintenanceView(props: SharedProps & { canWrite: boolean }) {
  const [inspectionId, setInspectionId] = useState('');
  const [title, setTitle] = useState('열화상 이상 후보 현장 점검');
  const [priority, setPriority] = useState('normal');
  const [vendor, setVendor] = useState('');
  const [busy, setBusy] = useState(false);
  const effectiveInspectionId = inspectionId || props.inspections[0]?.id || '';
  async function create(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const { error } = await props.supabase
        .from('maintenance_requests')
        .insert({
          organization_id: props.organizationId,
          inspection_id: effectiveInspectionId,
          title: title.trim(),
          priority,
          status: 'requested',
          vendor_name: vendor.trim() || null,
          created_by: props.session.user.id,
        });
      if (error) throw error;
      props.setNotice({
        tone: 'success',
        text: '유지보수 요청을 등록했습니다.',
      });
      await props.refresh();
    } catch (error) {
      props.setNotice({ tone: 'error', text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }
  async function updateStatus(item: Maintenance, status: string) {
    const updates: Database['public']['Tables']['maintenance_requests']['Update'] =
      { status };
    if (status === 'completed') updates.completed_at = new Date().toISOString();
    const { error } = await props.supabase
      .from('maintenance_requests')
      .update(updates)
      .eq('id', item.id);
    if (error) props.setNotice({ tone: 'error', text: errorMessage(error) });
    else {
      props.setNotice({ tone: 'success', text: '조치 상태를 변경했습니다.' });
      await props.refresh();
    }
  }
  const inspectionLabel = (id: string) =>
    props.inspections.find((item) => item.id === id)?.inspection_code ?? '점검';
  return (
    <>
      <PageHeading
        eyebrow="MAINTENANCE LOOP"
        title="유지보수 요청·조치 이력"
        copy="판정 결과에서 후속 조치를 만들고, 배정·견적·일정·완료 상태를 한 흐름으로 남깁니다."
      />
      <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
        <form
          onSubmit={create}
          className="h-fit space-y-4 rounded-2xl border bg-white p-5 shadow-sm"
        >
          <h2 className="font-bold">새 조치 요청</h2>
          {!props.canWrite && <ReadOnlyNote />}
          <Field label="관련 점검">
            <select
              className="h-9 w-full rounded-lg border bg-white px-3 text-sm"
              value={effectiveInspectionId}
              onChange={(e) => setInspectionId(e.target.value)}
              disabled={!props.canWrite}
            >
              {props.inspections.map((item) => (
                <option key={item.id} value={item.id}>
                  {inspectionLabel(item.id)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="작업명">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={!props.canWrite}
              required
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="우선순위">
              <select
                className="h-9 w-full rounded-lg border bg-white px-3 text-sm"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                disabled={!props.canWrite}
              >
                <option value="low">낮음</option>
                <option value="normal">보통</option>
                <option value="high">높음</option>
                <option value="urgent">긴급</option>
              </select>
            </Field>
            <Field label="업체">
              <Input
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                disabled={!props.canWrite}
              />
            </Field>
          </div>
          <Button
            className="w-full"
            disabled={!props.canWrite || !effectiveInspectionId || busy}
          >
            {busy ? <Loader2 className="animate-spin" /> : <Plus />}조치 요청
            등록
          </Button>
        </form>
        <section className="space-y-3">
          {props.maintenance.map((item) => (
            <article
              key={item.id}
              className="rounded-2xl border bg-white p-5 shadow-sm"
            >
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                  <div className="flex items-center gap-2">
                    <strong>{item.title}</strong>
                    <StatusPill>
                      {item.priority === 'urgent'
                        ? '긴급'
                        : item.priority === 'high'
                          ? '높음'
                          : item.priority === 'low'
                            ? '낮음'
                            : '보통'}
                    </StatusPill>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    {inspectionLabel(item.inspection_id)} ·{' '}
                    {item.vendor_name || '업체 미정'} · 등록{' '}
                    {formatDateTime(item.created_at)}
                  </p>
                </div>
                <select
                  className="h-9 rounded-lg border bg-white px-3 text-sm font-semibold"
                  value={item.status}
                  onChange={(e) => void updateStatus(item, e.target.value)}
                  disabled={!props.canWrite}
                >
                  {maintenanceStatuses.map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </article>
          ))}
          {props.maintenance.length === 0 && (
            <EmptyState
              icon={Wrench}
              title="등록된 조치가 없습니다"
              copy="판정이 끝난 점검에서 필요한 현장 조치를 등록하세요."
            />
          )}
        </section>
      </div>
    </>
  );
}

function MembersView(
  props: SharedProps & {
    workspace: Workspace;
    setWorkspace: (workspace: Workspace) => void;
    canWrite: boolean;
  },
) {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<'expert' | 'owner'>('expert');
  const [organizationName, setOrganizationName] = useState(
    props.workspace.organization.name,
  );
  const [busy, setBusy] = useState(false);
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);
  async function addMember(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const { data, error } = await props.supabase.functions.invoke(
        'invite-platform-user',
        {
          body: {
            organizationId: props.organizationId,
            email,
            role,
            displayName,
          },
        },
      );
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      props.setNotice({
        tone: 'success',
        text: data?.invitationSent
          ? `${email.trim()} 주소로 ${roleLabels[role]} 초대 메일을 보냈습니다.`
          : '이미 가입된 계정에 권한을 바로 연결했습니다.',
      });
      setEmail('');
      setDisplayName('');
      await props.refresh();
    } catch (error) {
      props.setNotice({ tone: 'error', text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }
  async function updateMember(
    member: Membership,
    updates: { role?: string; status?: string },
  ) {
    setBusyMemberId(member.user_id);
    props.setNotice(null);
    try {
      const { error } = await props.supabase.rpc('admin_update_member', {
        p_organization_id: props.organizationId,
        p_user_id: member.user_id,
        p_role: updates.role ?? member.role,
        p_status: updates.status ?? member.status,
      });
      if (error) throw error;
      props.setNotice({
        tone: 'success',
        text: '사용자 역할과 계정 상태를 변경했습니다.',
      });
      await props.refresh();
    } catch (error) {
      props.setNotice({ tone: 'error', text: errorMessage(error) });
    } finally {
      setBusyMemberId(null);
    }
  }
  async function saveOrganization(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const { data, error } = await props.supabase
      .from('organizations')
      .update({ name: organizationName.trim() })
      .eq('id', props.organizationId)
      .select('*')
      .single();
    if (error) props.setNotice({ tone: 'error', text: errorMessage(error) });
    else {
      props.setWorkspace({ ...props.workspace, organization: data });
      props.setNotice({ tone: 'success', text: '조직명을 변경했습니다.' });
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="ACCESS CONTROL"
        title="계정·역할 관리"
        copy="의뢰인은 직접 가입하고, 전문가와 관리자는 초대 메일로 계정을 만듭니다. 관리자는 세 역할과 계정 상태를 모두 관리합니다."
      />
      <div className="grid gap-5 xl:grid-cols-[390px_1fr]">
        <div className="space-y-5">
          <form
            onSubmit={addMember}
            className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm"
          >
            <h2 className="font-bold">전문가·관리자 초대</h2>
            {!props.canWrite && <ReadOnlyNote />}
            <p className="rounded-xl bg-sky-50 p-3 text-xs leading-5 text-sky-800">
              초대받은 사용자가 메일의 링크를 열면 계정이 활성화됩니다. 의뢰인은
              로그인 화면에서 직접 가입합니다.
            </p>
            <Field label="이름">
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={!props.canWrite}
                maxLength={100}
              />
            </Field>
            <Field label="초대 이메일">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={!props.canWrite}
                required
              />
            </Field>
            <Field label="역할">
              <select
                className="h-9 w-full rounded-lg border bg-white px-3 text-sm"
                value={role}
                onChange={(e) => setRole(e.target.value as 'expert' | 'owner')}
                disabled={!props.canWrite}
              >
                <option value="expert">전문가</option>
                <option value="owner">관리자</option>
              </select>
            </Field>
            <Button className="w-full" disabled={!props.canWrite || busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Users />}초대 메일
              보내기
            </Button>
          </form>
          <form
            onSubmit={saveOrganization}
            className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm"
          >
            <h2 className="font-bold">조직 설정</h2>
            <Field label="조직명">
              <Input
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                disabled={!props.canWrite}
                required
              />
            </Field>
            <Field label="조직 식별자">
              <Input value={props.workspace.organization.slug} disabled />
            </Field>
            <Button
              variant="outline"
              className="w-full"
              disabled={!props.canWrite}
            >
              조직명 저장
            </Button>
          </form>
        </div>
        <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="border-b px-5 py-4">
            <h2 className="font-bold">연결 사용자 {props.members.length}명</h2>
          </div>
          <div className="divide-y">
            {props.members.map((member) => {
              const profile = props.profiles[member.user_id];
              return (
                <div
                  key={member.user_id}
                  className="flex items-center justify-between gap-4 p-5"
                >
                  <div>
                    <strong className="text-sm">
                      {profile?.display_name || '이름 미등록'}
                    </strong>
                    <p className="mt-1 text-xs text-slate-500">
                      {profile?.email || member.user_id}
                    </p>
                  </div>
                  <div className="flex min-w-48 flex-col gap-2 sm:flex-row">
                    <select
                      className="h-9 rounded-lg border bg-white px-2 text-xs font-semibold"
                      value={member.role}
                      disabled={
                        !props.canWrite || busyMemberId === member.user_id
                      }
                      onChange={(e) =>
                        void updateMember(member, { role: e.target.value })
                      }
                      aria-label="사용자 역할"
                    >
                      <option value="client">의뢰인</option>
                      <option value="expert">전문가</option>
                      <option value="owner">관리자</option>
                    </select>
                    <select
                      className="h-9 rounded-lg border bg-white px-2 text-xs font-semibold"
                      value={member.status}
                      disabled={
                        !props.canWrite || busyMemberId === member.user_id
                      }
                      onChange={(e) =>
                        void updateMember(member, { status: e.target.value })
                      }
                      aria-label="계정 상태"
                    >
                      <option value="invited">초대 대기</option>
                      <option value="active">사용 중</option>
                      <option value="suspended">사용 중지</option>
                    </select>
                    {busyMemberId === member.user_id && (
                      <Loader2 className="m-auto size-4 animate-spin text-teal-600" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </>
  );
}
