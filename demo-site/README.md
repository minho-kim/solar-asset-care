# SolarScope 데모 사이트

태양광 검사 접수부터 열화상 검토, 전문가 판정, 보고서 승인과 유지보수까지 연결한 로컬 전체 데모다.

「솔라이음 AI진단 플랫폼 개발」 PDF의 관리자 A-1~A-6, 고객 C-1~C-5 화면 흐름을 모두 시연할 수 있다. 실제 서비스 연결 상태는 [`../docs/RFP_DEMO_GAP_CHECK.md`](../docs/RFP_DEMO_GAP_CHECK.md)에서 별도로 구분한다.

## 실행

```bash
npm install
cp .env.example .env.local
npm run dev
```

기본 주소는 `http://localhost:3000`이다.

## 명령

```bash
npm run lint
npm run build
```

## 데이터 모드

- 현재 화면은 `NEXT_PUBLIC_DATA_MODE=demo`에서 샘플 데이터로 동작한다.
- Supabase 브라우저 연결에는 `NEXT_PUBLIC_SUPABASE_URL`과 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`만 사용한다.
- secret key와 legacy `service_role` 키는 브라우저나 저장소에 두지 않는다.
- 실제 데이터 모드는 Auth 사용자와 조직 구성원 등록, 수용 시나리오 검증 뒤 활성화한다.

## 열화상 분석 데모

브라우저가 JPG·PNG를 작은 표준 픽셀 배열로 변환하고 `/api/thermal/analyze`가 색상 분포 기반 상대 후보를 계산한다. 외부 AI API를 사용하지 않는다. 실제 섭씨 온도는 방사온도 정보가 포함된 카메라 원본과 전용 파서를 연결해야 한다.

## PDF 요구사항 데모 범위

- 촬영 자료 업로드와 유효 조건·개인정보 마스킹 확인
- 이상 후보 유형 수정과 관리자 확정·기각
- 기대발전량, PR, 손실, 수익과 회수기간 계산
- 보고서 승인과 최소 11pt A4 인쇄·PDF 저장
- 업체 3곳 견적 비교와 설정 수수료 반영
- 설비·고객·업체 기준정보와 설정 판본 관리
- 고객 설비 등록, 고지서 샘플 진단, 보고서, 견적, 마이페이지, FAQ

현재 사용자 입력은 새로고침하면 초기화된다. Supabase 저장, 실제 OCR·Claude 호출, 방사온도 원본 파서와 외부 업체 발송은 운영 연동 범위다.
