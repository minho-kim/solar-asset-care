'use client';

import {
  ArrowLeft,
  Download,
  MapPin,
  ShieldCheck,
  ThermometerSun,
} from 'lucide-react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';

export default function ReportDemoPage() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-900 print:bg-white print:p-0">
      <div className="report-actions mx-auto mb-4 flex max-w-[210mm] items-center justify-between">
        <Button
          variant="outline"
          onClick={() => router.back()}
          className="rounded-xl bg-white"
        >
          <ArrowLeft className="size-4" />
          돌아가기
        </Button>
        <Button
          onClick={() => window.print()}
          className="rounded-xl bg-[#0b8f87] hover:bg-[#087c76]"
        >
          <Download className="size-4" />
          PDF로 인쇄·저장
        </Button>
      </div>
      <article className="report-sheet mx-auto min-h-[297mm] max-w-[210mm] bg-white p-[16mm] text-[11pt] leading-[1.65] shadow-xl print:min-h-0 print:max-w-none print:p-0 print:shadow-none">
        <header className="border-b-[3px] border-[#172b4b] pb-6">
          <p className="font-bold text-[#0b8f87]">
            솔라이음 태양광 설비 진단 리포트
          </p>
          <div className="mt-3 flex items-end justify-between gap-4">
            <div>
              <h1 className="text-[22pt] font-bold tracking-[-0.04em]">
                해오름 제2발전소
              </h1>
              <p className="mt-1 text-slate-500">
                문서번호 RPT-260903-01 · v1.0 · 승인 발행본
              </p>
            </div>
            <ShieldCheck className="size-9 text-[#0b8f87]" />
          </div>
        </header>

        <section className="report-meta grid grid-cols-2 gap-x-8 gap-y-3 border-b border-slate-200 py-5 sm:grid-cols-4">
          <div>
            <p className="text-slate-500">검사일</p>
            <p className="font-bold">2026. 09. 03.</p>
          </div>
          <div>
            <p className="text-slate-500">진단자</p>
            <p className="font-bold">이도윤</p>
          </div>
          <div>
            <p className="text-slate-500">설비용량</p>
            <p className="font-bold">498.6 kWp</p>
          </div>
          <div>
            <p className="text-slate-500">종합판정</p>
            <p className="font-bold text-amber-700">주의</p>
          </div>
        </section>

        <section className="report-section py-6">
          <h2 className="text-[15pt] font-bold">진단 요약</h2>
          <p className="mt-3 text-slate-700">
            열화상·가시광 자료와 촬영 조건을 함께 검토했습니다. 자동 후보 3건 중
            접속함 인접 과열 1건과 단일 셀 핫스팟 1건을 관리자가 확정했습니다.
            자동 후보는 참고자료이며 최종 판단은 전문가 검수 결과입니다.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['성능비', '78.4%'],
              ['예상 발전량', '618,221 kWh'],
              ['손실금액', '27,842,000원'],
              ['회수기간', '1.4년'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-slate-50 p-4">
                <p className="text-slate-500">{label}</p>
                <p className="mt-1 text-[13pt] font-bold">{value}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="report-section grid gap-5 border-t border-slate-200 py-6 sm:grid-cols-[1.15fr_.85fr]">
          <div>
            <h2 className="text-[15pt] font-bold">열화상 이상 위치</h2>
            <div className="report-thermal-image relative mt-4 aspect-[16/9] overflow-hidden rounded-xl bg-[linear-gradient(135deg,#121d3e,#512c68_42%,#f0643b_75%,#ffd268)]">
              <span className="absolute left-[62%] top-[28%] grid size-11 place-items-center rounded-full border-2 border-white bg-red-500/70 font-bold text-white">
                1
              </span>
              <span className="absolute left-[33%] top-[58%] grid size-11 place-items-center rounded-full border-2 border-white bg-amber-500/70 font-bold text-white">
                2
              </span>
            </div>
            <p className="mt-2 flex items-center gap-2 text-slate-500">
              <MapPin className="size-4" />
              A구역 3행 8열, 접속함 2번 인접
            </p>
          </div>
          <div>
            <h2 className="text-[15pt] font-bold">확정 이상</h2>
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                <p className="font-bold text-red-800">1. 접속함 과열</p>
                <p className="mt-1 text-red-700">
                  Delta T 12.4K · 긴급 점검 권고
                </p>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="font-bold text-amber-800">2. 단일 셀 핫스팟</p>
                <p className="mt-1 text-amber-700">
                  Delta T 10.8K · 정밀진단 권고
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="report-section border-t border-slate-200 py-6">
          <h2 className="text-[15pt] font-bold">개선 제안</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-2">
                <ThermometerSun className="size-5 text-red-600" />
                <p className="font-bold">접속부 정밀점검</p>
              </div>
              <p className="mt-2 text-slate-600">
                전기공사업 가능 유지보수 업체의 현장 점검과 단자 재체결을
                권고합니다.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="font-bold">예상 경제성</p>
              <p className="mt-2 text-slate-600">
                예상 수리비 2,200,000원 · 연간 회수가능액 1,571,000원 · 예상
                회수기간 1.4년
              </p>
            </div>
          </div>
        </section>

        <footer className="report-footer mt-6 border-t border-slate-300 pt-4 text-slate-500">
          <p>
            본 보고서의 발전량·수익·손실·회수기간은 입력 자료와 관리자 설정을
            이용한 추정치이며 실제 결과와 다를 수 있습니다.
          </p>
          <p className="mt-2">
            적용 설정 SET-2026.09-v1 · 분석 규칙 THERMAL-DEMO-v2 · 관리자 승인
            2026.09.04.
          </p>
        </footer>
      </article>
    </main>
  );
}
