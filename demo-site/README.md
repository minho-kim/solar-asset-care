# SolarScope 데모 사이트

태양광 검사 접수부터 열화상 검토, 전문가 판정, 보고서 승인과 유지보수까지 연결한 로컬 전체 데모다.

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
