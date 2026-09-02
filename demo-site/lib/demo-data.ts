export type AppRole = 'operator' | 'expert' | 'client';

export type Inspection = {
  id: string;
  plant: string;
  client: string;
  location: string;
  status: string;
  statusTone: 'amber' | 'blue' | 'green' | 'violet' | 'slate';
  progress: number;
  task: string;
  due: string;
  files: number;
  expert: string;
};

export const inspections: Inspection[] = [
  {
    id: 'INSP-260902-04',
    plant: '해오름 제2발전소',
    client: '에너지이음 협동조합',
    location: '경기 부천시',
    status: '전문가 검토',
    statusTone: 'amber',
    progress: 68,
    task: '고온 후보 3건 판정 필요',
    due: '오늘 16:00',
    files: 48,
    expert: '이도윤',
  },
  {
    id: 'INSP-260901-11',
    plant: '푸른솔 물류센터',
    client: '푸른솔에너지',
    location: '인천 서구',
    status: '파일 확인',
    statusTone: 'blue',
    progress: 36,
    task: '열화상·가시광 짝 2건 확인',
    due: '내일',
    files: 74,
    expert: '미배정',
  },
  {
    id: 'INSP-260829-03',
    plant: '시민햇빛 7호',
    client: '부천시민햇빛',
    location: '경기 부천시',
    status: '승인 대기',
    statusTone: 'green',
    progress: 91,
    task: '보고서 1차 승인',
    due: '9월 4일',
    files: 36,
    expert: '박서연',
  },
  {
    id: 'INSP-260828-08',
    plant: '온누리 식품공장',
    client: '온누리식품',
    location: '경기 김포시',
    status: '촬영 예정',
    statusTone: 'slate',
    progress: 12,
    task: '촬영 조건 확인',
    due: '9월 6일',
    files: 0,
    expert: '이도윤',
  },
];

export const plants = [
  { name: '해오름 제2발전소', client: '에너지이음 협동조합', location: '경기 부천시', capacity: '498.6 kW', health: 91, inspections: 7, issue: '점검 필요 2건', yield: [72, 76, 81, 79, 86, 88, 84] },
  { name: '푸른솔 물류센터', client: '푸른솔에너지', location: '인천 서구', capacity: '312.4 kW', health: 96, inspections: 4, issue: '정상', yield: [68, 71, 75, 73, 80, 82, 81] },
  { name: '시민햇빛 7호', client: '부천시민햇빛', location: '경기 부천시', capacity: '99.8 kW', health: 88, inspections: 9, issue: '우선조치 1건', yield: [62, 66, 70, 67, 74, 72, 69] },
];

export const reports = [
  { id: 'RPT-260902-02', title: '해오름 제2발전소 정기 진단보고서', plant: '해오름 제2발전소', version: 'v1.0', status: '검토 중', tone: 'amber', updated: '오늘 14:30', findings: 3 },
  { id: 'RPT-260829-01', title: '시민햇빛 7호 열화상 진단보고서', plant: '시민햇빛 7호', version: 'v1.0', status: '승인 대기', tone: 'violet', updated: '어제 17:10', findings: 2 },
  { id: 'RPT-260821-03', title: '푸른솔 물류센터 진단 결과', plant: '푸른솔 물류센터', version: 'v1.1', status: '발행 완료', tone: 'green', updated: '8월 22일', findings: 1 },
];

export const maintenance = [
  { id: 'MNT-1024', title: '3번 스트링 접속부 점검', plant: '시민햇빛 7호', priority: '긴급', status: '요청', due: '9월 4일', owner: '미배정' },
  { id: 'MNT-1021', title: '모듈 표면 오염 세척', plant: '해오름 제2발전소', priority: '보통', status: '배정', due: '9월 7일', owner: '한빛O&M' },
  { id: 'MNT-1018', title: '커넥터 열화 재점검', plant: '온누리 식품공장', priority: '높음', status: '작업 중', due: '오늘', owner: '정우진' },
  { id: 'MNT-1009', title: '인버터 2번 팬 교체', plant: '푸른솔 물류센터', priority: '높음', status: '완료', due: '8월 28일', owner: '새빛전기' },
];
