import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  ArrowRight,
  Building2,
  ClipboardCheck,
  FileCheck2,
  ShieldCheck,
  SunMedium,
} from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import {
  guestRoles,
  guestPlants,
  guestInspections,
  guestFindings,
  resolveGuestView,
  type GuestRole,
  type GuestSection,
} from '@/lib/guest-preview';

export const metadata: Metadata = {
  title: '게스트 둘러보기 | SolarScope',
  description: '샘플 자료로 둘러보는 태양광 자산진단 플랫폼',
  robots: { index: false, follow: false },
};
type Query = Record<string, string | string[] | undefined>;
const href = (role: GuestRole, section: GuestSection) =>
  `/guest?role=${role}&section=${section}`;
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <h2 className="mb-5 text-lg font-bold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}
function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex rounded-md bg-teal-50 px-2.5 py-1 text-sm font-medium text-teal-800">
      {children}
    </span>
  );
}
function Facts({ items }: { items: [string, string][] }) {
  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt className="text-sm text-slate-500">{label}</dt>
          <dd className="mt-1 break-words text-base font-medium text-slate-900">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
function InspectionList({ role }: { role: GuestRole }) {
  return (
    <div className="space-y-4">
      {guestInspections.map((item) => (
        <article
          key={item.id}
          className="rounded-xl border border-slate-200 p-4"
        >
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm text-slate-500">{item.id}</p>
              <h3 className="mt-1 font-semibold">{item.plant}</h3>
            </div>
            <Tag>{item.status}</Tag>
          </div>
          <Facts
            items={[
              ['촬영 일정 · 한국시간', item.date],
              ['담당 전문가', item.expert],
              ['등록 원본', item.files],
            ]}
          />
          {item.id === 'SAMPLE-001' && (
            <Link
              prefetch={false}
              className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-teal-800 underline-offset-4 hover:underline"
              href={href(role, 'reports')}
            >
              발행 보고서 보기
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          )}
        </article>
      ))}
    </div>
  );
}
function Findings() {
  return (
    <div className="space-y-4">
      {guestFindings.map((item) => (
        <article
          key={item.location}
          className="rounded-xl border border-slate-200 p-4"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">{item.type}</h3>
            <Tag>{item.severity}</Tag>
          </div>
          <p className="text-sm text-slate-500">{item.location}</p>
          <p className="mt-3 text-base leading-7">{item.action}</p>
        </article>
      ))}
    </div>
  );
}
function Content({
  role,
  section,
}: {
  role: GuestRole;
  section: GuestSection;
}) {
  switch (section) {
    case 'overview':
      return (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              [Building2, '발전소', '3곳'],
              [ClipboardCheck, '진행 중 점검', '2건'],
              [FileCheck2, '발행 보고서', '1건'],
            ].map(([Icon, label, value]) => {
              const StatIcon = Icon as typeof Building2;
              return (
                <div
                  key={String(label)}
                  className="rounded-2xl border border-slate-200 bg-white p-5"
                >
                  <StatIcon
                    className="mb-4 size-5 text-teal-700"
                    aria-hidden="true"
                  />
                  <p className="text-sm text-slate-500">{String(label)}</p>
                  <p className="mt-2 text-3xl font-bold">{String(value)}</p>
                </div>
              );
            })}
          </div>
          <Panel title="점검 현황">
            <InspectionList role={role} />
          </Panel>
        </>
      );
    case 'plants':
      return (
        <div className="grid gap-5 lg:grid-cols-3">
          {guestPlants.map((plant) => (
            <Panel key={plant.name} title={plant.name}>
              <Facts
                items={[
                  ['지역', plant.location],
                  ['설치 용량', plant.capacity],
                  ['현재 상태', plant.status],
                ]}
              />
              <Link
                prefetch={false}
                className="mt-5 inline-flex min-h-11 items-center gap-2 font-semibold text-teal-800"
                href={href(role, 'inspections')}
              >
                점검 이력
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Panel>
          ))}
        </div>
      );
    case 'inspections':
      return (
        <Panel title="점검 일정·진행 상태">
          <InspectionList role={role} />
        </Panel>
      );
    case 'files':
      return (
        <Panel title="샘플 지붕 2호 · 점검 원본">
          <Facts
            items={[
              ['촬영 시각 · 한국시간', '2026-09-03 11:00'],
              ['등록 자료', '열화상 18장 · 가시광 18장'],
              ['원본 보존', '원본과 보고서용 사진을 분리'],
              ['파일 확인', '형식·크기·내용 확인값 검사'],
            ]}
          />
          <p className="mt-5 text-base leading-7 text-slate-600">
            원본 파일은 게스트에게 제공하지 않습니다.
          </p>
          <Link
            prefetch={false}
            className="mt-4 inline-flex min-h-11 items-center font-semibold text-teal-800"
            href={href(role, 'findings')}
          >
            전문가 소견 예시 보기 →
          </Link>
        </Panel>
      );
    case 'findings':
      return (
        <Panel title="샘플 햇빛 1호 · 전문가 소견">
          <Findings />
          <p className="mt-5 text-sm leading-6 text-slate-500">
            색상만으로 실제 온도를 확정하지 않습니다. 측정 온도는 현장 계측 등
            근거가 있을 때 기록합니다.
          </p>
        </Panel>
      );
    case 'assessments':
      return (
        <Panel title="샘플 햇빛 1호 · 발전량 평가">
          <Facts
            items={[
              ['분석기간', '2026-08-01 ~ 2026-08-31'],
              ['실발전량', '10,000 kWh'],
              ['기대발전량', '11,000 kWh'],
              ['차이', '1,000 kWh'],
              ['촬영 조건 검토', '확인 완료'],
              ['평가 출처', '둘러보기용 가상 수치'],
            ]}
          />
          <p className="mt-5 text-sm leading-6 text-slate-500">
            실제 화면에서는 입력 자료와 관리자가 설정한 기준을 바탕으로
            계산합니다.
          </p>
        </Panel>
      );
    case 'reports':
      return (
        <>
          <Panel title="샘플 햇빛 1호 · 정기 진단보고서">
            <div className="mb-5 flex flex-wrap gap-2">
              <Tag>발행 완료</Tag>
              <Tag>1차 보고서</Tag>
            </div>
            <Facts
              items={[
                ['점검 번호', 'SAMPLE-001'],
                ['발행일', '2026-09-04'],
                ['설치 용량', '99.8 kW'],
                ['확인 소견', '2건'],
              ]}
            />
            <p className="mt-5 text-base leading-7">
              오염과 고온 의심 지점을 확인했습니다. 청소 및 현장 점검 후 발전량
              변화를 추적하는 예시입니다.
            </p>
          </Panel>
          <Panel title="상세 소견">
            <Findings />
          </Panel>
          <Panel title="후속 조치">
            <p className="text-base leading-7">
              청소와 전기 점검을 함께 요청하고 업체의 금액·일정·보증 조건을
              비교합니다.
            </p>
            <Link
              prefetch={false}
              className="mt-3 inline-flex min-h-11 items-center gap-2 font-semibold text-teal-800"
              href={href(role, role === 'expert' ? 'inspections' : 'partners')}
            >
              {role === 'expert' ? '점검 목록 보기' : '업체·견적 보기'}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Panel>
        </>
      );
    case 'partners':
      return (
        <Panel title="샘플 햇빛 1호 · 청소·전기 점검 견적">
          <div className="grid gap-4 lg:grid-cols-3">
            {[
              ['샘플 업체 A', '550,000원', '접수 후 7일', '청소·전기 점검'],
              [
                '샘플 업체 B',
                '620,000원',
                '접수 후 5일',
                '청소·전기 점검·재방문',
              ],
              ['샘플 업체 C', '580,000원', '접수 후 10일', '청소·전기 점검'],
            ].map(([name, price, date, scope]) => (
              <article
                key={name}
                className="rounded-xl border border-slate-200 p-4"
              >
                <h3 className="mb-4 font-bold">{name}</h3>
                <Facts
                  items={[
                    ['견적 금액 · 예시', price],
                    ['작업 가능 일정', date],
                    ['작업 범위', scope],
                  ]}
                />
              </article>
            ))}
          </div>
          <p className="mt-5 text-sm leading-6 text-slate-500">
            비교용 가상 견적입니다. 게스트는 업체 선택이나 작업 요청을 하지
            않습니다.
          </p>
        </Panel>
      );
    case 'maintenance':
      return (
        <Panel title="샘플 햇빛 1호 · 조치 이력">
          <ol className="space-y-5">
            {[
              ['2026-09-01', '정기 점검', '오염·고온 의심 지점 확인'],
              ['2026-09-04', '보고서 발행', '의뢰인에게 점검 결과 전달'],
              ['2026-09-05', '유지보수 요청', '청소·전기 점검 견적 비교 중'],
            ].map(([date, title, description]) => (
              <li key={title} className="border-l-2 border-teal-200 pl-4">
                <p className="text-sm text-slate-500">{date}</p>
                <h3 className="mt-1 font-semibold">{title}</h3>
                <p className="mt-2 text-base text-slate-600">{description}</p>
              </li>
            ))}
          </ol>
        </Panel>
      );
    case 'recycling':
      return (
        <Panel title="재활용 인증서 조회 예시">
          <Tag>확인 후 공개</Tag>
          <div className="mt-5">
            <Facts
              items={[
                ['발전소', '샘플 햇빛 1호'],
                ['문서명', '교체 패널 재활용 확인서 · 예시'],
                ['발급기관', '가상 재활용 기관'],
                ['발급일', '2026-08-20'],
                ['처리 수량', '6장'],
                ['확인 상태', '관리자 확인 완료'],
              ]}
            />
          </div>
          <p className="mt-5 text-sm leading-6 text-slate-500">
            실제 발급 문서가 아닙니다. 운영 화면에서는 관리자가 확인·공개한
            원본을 해당 의뢰인이 내려받습니다.
          </p>
        </Panel>
      );
    case 'members':
      return (
        <Panel title="역할·계정 관리 예시">
          <div className="space-y-4">
            {[
              ['의뢰인', '회원가입 후 연결된 발전소·보고서·요청을 확인'],
              ['전문가', '관리자 초대로 가입하고 배정된 점검의 자료·소견 작성'],
              [
                '관리자',
                '계정·배정·계산 기준 관리 및 보고서·인증서 확인과 공개',
              ],
            ].map(([name, description]) => (
              <article
                key={name}
                className="rounded-xl border border-slate-200 p-4"
              >
                <h3 className="font-semibold">{name}</h3>
                <p className="mt-2 text-base leading-7 text-slate-600">
                  {description}
                </p>
              </article>
            ))}
          </div>
          <p className="mt-5 text-sm text-slate-500">
            게스트는 운영 계정 목록이나 이메일을 조회하지 않습니다.
          </p>
        </Panel>
      );
  }
}
export default async function GuestPage({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  const query = await searchParams;
  const { role, section, sections } = resolveGuestView(
    query.role,
    query.section,
  );
  const title = sections.find(([id]) => id === section)![1];
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Link
        prefetch={false}
        href="#guest-content"
        className="sr-only focus:not-sr-only focus:block focus:bg-white focus:p-4"
      >
        본문으로 이동
      </Link>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link
            prefetch={false}
            href="/guest"
            aria-label="SolarScope 게스트 홈"
            className="flex min-h-11 items-center gap-2 text-xl font-bold"
          >
            <SunMedium className="size-7 text-teal-700" aria-hidden="true" />
            SolarScope
          </Link>
          <Link
            prefetch={false}
            href="/"
            className={buttonVariants({
              variant: 'outline',
              className: 'min-h-11 px-4',
            })}
          >
            로그인으로 돌아가기
          </Link>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
        <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3">
          <span className="flex items-center gap-2 text-sm font-semibold text-teal-900">
            <ShieldCheck className="size-4" aria-hidden="true" />
            게스트 · 읽기 전용
          </span>
          <p className="text-sm text-teal-900">모든 내용은 샘플 자료입니다.</p>
        </div>
        <nav
          aria-label="역할별 화면 둘러보기"
          className="mb-5 flex flex-wrap gap-2"
        >
          {(Object.entries(guestRoles) as [GuestRole, string][]).map(
            ([id, label]) => (
              <Link
                prefetch={false}
                key={id}
                href={href(id, 'overview')}
                aria-current={role === id ? 'true' : undefined}
                className={buttonVariants({
                  variant: id === role ? 'default' : 'outline',
                  className: 'min-h-11 px-4',
                })}
              >
                {label} 화면
              </Link>
            ),
          )}
        </nav>
        <div className="flex min-w-0 flex-col gap-6 lg:flex-row">
          <nav
            aria-label="게스트 메뉴"
            className="flex flex-wrap gap-2 lg:w-48 lg:shrink-0 lg:flex-col"
          >
            {sections.map(([id, label]) => (
              <Link
                prefetch={false}
                key={id}
                href={href(role, id)}
                aria-current={section === id ? 'page' : undefined}
                className={`flex min-h-11 items-center rounded-lg px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${section === id ? 'bg-teal-800 text-white' : 'text-slate-600 hover:bg-slate-200'}`}
              >
                {label}
              </Link>
            ))}
          </nav>
          <main id="guest-content" className="min-w-0 flex-1">
            <div className="mb-6">
              <p className="text-sm font-medium text-teal-700">
                {guestRoles[role]} 화면 예시
              </p>
              <h1 className="mt-2 text-2xl font-bold tracking-tight">
                {title}
              </h1>
            </div>
            <div className="space-y-5">
              <Content role={role} section={section} />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
