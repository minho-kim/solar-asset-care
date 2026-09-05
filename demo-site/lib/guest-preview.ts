// Public, synthetic examples only. Never populate these from production queries.
export const guestRoles = {
  client: '의뢰인',
  expert: '전문가',
  owner: '관리자',
} as const;
export type GuestRole = keyof typeof guestRoles;
export const guestSections = [
  ['overview', '현황'],
  ['plants', '발전소'],
  ['inspections', '점검'],
  ['files', '원본 파일'],
  ['findings', '전문가 소견'],
  ['assessments', '발전량 평가'],
  ['reports', '보고서'],
  ['partners', '업체·견적'],
  ['maintenance', '유지보수'],
  ['recycling', '재활용 인증서'],
  ['members', '계정 관리'],
] as const;
export type GuestSection = (typeof guestSections)[number][0];
const sectionsByRole: Record<GuestRole, readonly GuestSection[]> = {
  client: [
    'overview',
    'plants',
    'inspections',
    'reports',
    'partners',
    'maintenance',
    'recycling',
  ],
  expert: [
    'overview',
    'plants',
    'inspections',
    'files',
    'findings',
    'assessments',
    'reports',
    'recycling',
  ],
  owner: guestSections.map(([id]) => id),
};
export function resolveGuestView(
  role?: string | string[],
  section?: string | string[],
) {
  const resolvedRole: GuestRole =
    typeof role === 'string' && Object.hasOwn(guestRoles, role)
      ? (role as GuestRole)
      : 'client';
  const allowed = sectionsByRole[resolvedRole];
  const resolvedSection =
    typeof section === 'string' && allowed.includes(section as GuestSection)
      ? (section as GuestSection)
      : 'overview';
  return {
    role: resolvedRole,
    section: resolvedSection,
    sections: guestSections.filter(([id]) => allowed.includes(id)),
  };
}
export const guestPlants = [
  {
    name: '샘플 햇빛 1호',
    location: '경기 부천시',
    capacity: '99.8 kW',
    status: '점검 완료',
  },
  {
    name: '샘플 지붕 2호',
    location: '경기 김포시',
    capacity: '150 kW',
    status: '전문가 검토',
  },
  {
    name: '샘플 창고 3호',
    location: '인천 서구',
    capacity: '300 kW',
    status: '촬영 예정',
  },
] as const;
export const guestInspections = [
  {
    id: 'SAMPLE-001',
    plant: guestPlants[0].name,
    date: '2026-09-01 10:00',
    status: '보고서 발행',
    files: '24개',
    expert: '샘플 전문가 A',
  },
  {
    id: 'SAMPLE-002',
    plant: guestPlants[1].name,
    date: '2026-09-03 11:00',
    status: '전문가 검토',
    files: '36개',
    expert: '샘플 전문가 B',
  },
  {
    id: 'SAMPLE-003',
    plant: guestPlants[2].name,
    date: '2026-09-08 10:00',
    status: '촬영 예정',
    files: '0개',
    expert: '샘플 전문가 A',
  },
] as const;
export const guestFindings = [
  {
    location: 'A동 · 2열 3번',
    type: '표면 오염·음영',
    severity: '주의',
    action: '표면 청소 후 발전량을 다시 확인합니다.',
  },
  {
    location: 'A동 · 4열 1번',
    type: '단일 셀 핫스팟',
    severity: '점검 필요',
    action: '현장 계측과 전기 점검으로 원인을 확인합니다.',
  },
] as const;
