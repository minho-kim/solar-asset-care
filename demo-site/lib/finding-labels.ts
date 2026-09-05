export const defectLabels: Record<string, string> = {
  cell_hotspot: '단일 셀 핫스팟',
  submodule: '서브모듈 과열',
  module: '모듈 전체 과열',
  string: '스트링 이상',
  junction_inverter: '접속함·인버터 과열',
  soiling_shade: '표면 오염·음영',
  pid_degradation: 'PID·열화',
  other: '기타',
};
export const kindLabels: Record<string, string> = {
  hotspot: '고온 후보',
  coldspot: '저온 후보',
  mismatch: '불일치',
  damage: '손상',
  quality_issue: '촬영 품질',
  other: '기타',
};
export const severityLabels: Record<string, string> = {
  info: '참고',
  review: '추가 검토',
  minor: '경미',
  major: '중대',
  critical: '긴급',
};
export const dispositionLabels: Record<string, string> = {
  pending: '판정 대기',
  accepted: '채택',
  modified: '수정 채택',
  rejected: '제외',
};
