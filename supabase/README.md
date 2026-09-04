# Supabase 구성

## 현재 프로젝트

- 프로젝트 이름: `solar-asset-care`
- 프로젝트 ref: `vzgmryqglptxowbdewkf`
- 리전: 서울 `ap-northeast-2`
- 기준 시간대: 데이터베이스는 UTC, 화면·촬영 기준은 기본 `Asia/Seoul`

API 키는 이 디렉터리나 Git 저장소에 보관하지 않는다. 브라우저에는 `.env.local`의
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`만 주입하고, secret key는 향후 서버 작업이
필요한 경우 배포 환경의 비밀 저장소에서 별도로 관리한다.

## 원격에 적용된 마이그레이션

1. `20260902072953_initial_platform_schema.sql`
2. `20260902073053_add_foreign_key_indexes.sql`
3. `20260902075010_revoke_anon_data_api.sql`
4. `20260902075129_split_write_policies.sql`
5. `20260904082215_add_secure_organization_onboarding.sql`
6. `20260904083605_harden_onboarding_rpc.sql`

현재 원격 프로젝트에는 위 여섯 변경이 적용돼 있다. SQL은 새 Supabase 프로젝트에
순서대로 적용할 수 있도록 저장했으며, 배포 대상이 결정되기 전까지 추가 공급자
기능에 종속되는 코드는 만들지 않는다.

## 파일 경로 규칙

세 Storage 버킷은 모두 비공개다. 객체 경로의 첫 구간은 반드시 조직 UUID여야 한다.

```text
<organization-uuid>/<inspection-uuid>/<file-name>
```

RLS 정책은 이 첫 구간과 로그인 사용자의 활성 조직 멤버십을 함께 확인한다.

## 최초 관리자와 사용자 연결

1. 사이트에서 이메일 가입과 인증을 완료한다.
2. 최초 관리자만 30일 유효 1회용 개설 코드로 조직을 만든다.
3. 이후 사용자는 먼저 가입·인증하고, 조직 소유자가 관리자 화면에서 이메일과 역할을 연결한다.

개설 코드 원문은 Git이나 데이터베이스에 저장하지 않는다. 데이터베이스에는 SHA-256 해시와 사용·만료 시각만 남는다.

## 실제 고객 자료 투입 전 필수 확인

- 최초 Auth 사용자와 조직 멤버십 개설을 완료한다.
- 역할별 조회·업로드·수정·승인·다운로드 시나리오를 두 조직 이상으로 시험한다.
- 보고서 발행, 원본 보존, 삭제와 감사 기록 정책을 확정한다.
- 배포 도메인이 정해지면 Auth 콜백 URL, CORS와 보안 헤더를 검증한다.
