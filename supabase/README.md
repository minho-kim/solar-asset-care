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
7. `20260904123429_add_three_role_access_model.sql`
8. `20260904123655_index_plant_requester_creator.sql`
9. `20260904124028_harden_tenant_links_and_expert_writes.sql`
10. `20260904132006_scaffold_partner_quote_workflow.sql`
11. `20260904132507_split_quote_finding_policies.sql`

현재 원격 프로젝트에는 위 열한 개 변경이 적용돼 있다. SQL은 새 Supabase 프로젝트에
순서대로 적용할 수 있도록 저장했으며, 배포 대상이 결정되기 전까지 추가 공급자
기능에 종속되는 코드는 만들지 않는다.

## 파일 경로 규칙

세 Storage 버킷은 모두 비공개다. 객체 경로의 첫 구간은 반드시 조직 UUID여야 한다.

```text
<organization-uuid>/<inspection-uuid>/<file-name>
```

RLS 정책은 이 첫 구간과 로그인 사용자의 활성 조직 멤버십을 함께 확인한다.

## 최초 관리자와 사용자 연결

1. 최초 관리자는 사이트에서 이메일 가입·인증 후 30일 유효 1회용 개설 코드로 운영 조직을 만든다.
2. 의뢰인은 사이트에서 직접 가입·인증하고 본인 발전소를 등록한다.
3. 전문가와 추가 관리자는 기존 관리자가 초대 메일을 보낸다.
4. 초대 링크를 완료하면 초대 대기 멤버십이 자동으로 활성화된다.

역할 값은 관리자 `owner`, 전문가 `expert`, 의뢰인 `client` 세 개만 허용한다. 브라우저는 publishable key만 사용하며, 초대 함수는 배포 환경의 `SUPABASE_SECRET_KEYS`를 사용한다. 함수 의존성은 `@supabase/supabase-js@2.113.0`으로 고정하고 `deno.lock`을 함께 보관한다.

## 업체·견적 확장 구조

업체는 조직 내부 역할로 넣지 않고 별도 `partners` 데이터로 관리한다. MVP에서는
관리자가 업체와 견적을 입력하고 의뢰인이 본인 발전소의 제출 견적만 비교·선택한다.
업체 연락처·사업자·면허 정보는 공개 비교 정보와 분리해 관리자에게만 보인다.

`partner_users`는 향후 업체 포털용 계정 연결 자리다. `private.partner_quote_access_tokens`는
업체가 계정 없이 견적을 제출하는 일회용 링크를 위한 해시 저장 자리다. 두 기능 모두
현재는 외부 접근을 열지 않았으며, 2차 개발에서 별도 인증·만료·재사용 방지 시험 후 활성화한다.

개설 코드 원문은 Git이나 데이터베이스에 저장하지 않는다. 데이터베이스에는 SHA-256 해시와 사용·만료 시각만 남는다.

## 실제 고객 자료 투입 전 필수 확인

- 최초 Auth 사용자와 조직 멤버십 개설을 완료한다.
- 관리자·전문가·의뢰인 실제 계정으로 발전소 소유권과 전문가 배정 범위의 허용·거부를 시험한다.
- 보고서 발행, 원본 보존, 삭제와 감사 기록 정책을 확정한다.
- 배포 도메인이 정해지면 Auth 콜백 URL, CORS와 보안 헤더를 검증한다.
