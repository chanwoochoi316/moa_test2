# 모아플랜 — AI 자산 설계도 (v0.1 MVP)

> SSRD·SSAD·UI/UX 기획안 (2026-11-06) 기반 / **실제 결제가 아닌 사용자 테스트용 프로토타입**

모바일 우선 반응형 웹앱. 익명 무료 진단, 이메일·선택적 카카오 로그인, 재무정보·자산 종류별 입력, 5문항 성향 진단, 목표(선택), 유료 설계도 미리보기와 **1,000원 모의 결제**, 규칙 엔진 기반 자산 설계도, 학습 카드, 미래 자산 그래프, 월간 체크인, 포인트 기반 AI 질문·조정, 설문·피드백·회원 탈퇴를 포함합니다.

**필독:** [docs/DEPLOY_KO.md](docs/DEPLOY_KO.md)에 GitHub → Supabase → Vercel 배포 방법과 테스트 체크리스트가 있습니다.

## 기술 스택

- Next.js 15 App Router / TypeScript / React 19 / Lucide icons
- Supabase Auth, PostgreSQL, Row Level Security (RLS), 서버에서만 쓰는 Secret key
- Vercel Hosting, 기본 `*.vercel.app` HTTPS 주소
- 선택적 Anthropic API. `AI_ENABLED=false`(기본값)일 때는 AI를 가장하지 않는 무료 규칙형 설명을 제공합니다.

## 로컬 실행

1. Node.js 20.9 이상 설치, 이 폴더에서 `npm install` 실행.
2. `.env.example`을 `.env.local`로 복사하고 실제 Supabase URL/키를 입력.
3. 새 Supabase 프로젝트 **SQL Editor**에서 `supabase/schema.sql`을 한 번 실행.
4. Supabase Authentication → URL Configuration에서 `http://localhost:3000`과 `http://localhost:3000/**` 허용.
5. `npm run dev` 후 `http://localhost:3000` 접속.
6. `npm test`로 규칙 엔진 테스트, `npm run typecheck`, `npm run build`로 빌드 확인.

## 환경 변수

```ini
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
AI_ENABLED=false
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=
```

- `NEXT_PUBLIC_*`은 브라우저에 포함되는 공개 설정입니다. **`SUPABASE_SECRET_KEY`는 서버 전용으로만** 둡니다.
- 이전 MOA 버전의 `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`와 **변수 이름이 달라졌습니다**.
- AI는 선택입니다. Anthropic API 키와 모델 ID를 입력해도 외부 API 요금이 발생할 수 있으므로 시연 초기에는 `AI_ENABLED=false`를 권장합니다.
- RLS는 본인 데이터 열람만 허용하며, 서버 요청에서 `auth.getUser()`를 거쳐 요청한 계정의 데이터만 다룹니다.

## 폴더 구조

```
app/              랜딩 페이지, 인증 콜백, HTTP API
components/       모아플랜 반응형 웹 UI
lib/engine.ts     규칙 엔진 (순수 함수, AI 호출 없음)
lib/rules.json    성향 비중·가정 수익률·포인트·경고 기준
lib/ai.ts         선택적 Anthropic 호출 / 안전 검증 / 기본 설명
lib/supabase/     브라우저·서버 인증 클라이언트
content/cards.json 학습 카드 콘텐츠와 출처
supabase/schema.sql DB 13개 테이블, 정책, 원자적 모의 결제·포인트 RPC
tests/            계산·성향·조정 단위 테스트
docs/             한국어 배포·기능 범위·운영 안전 체크리스트
```

## 제약 및 운영 전 확인

- **실제 결제 미지원**: 가격 1,000원 표시, 모의 구매 클릭 기록. 카드·계좌 정보는 받지 않습니다.
- 투자 권유·개별 종목 추천 없음. 자산 **종류 수준**의 교육 정보와 가정 기반 예측만 제공합니다.
- 은행/카드 자동 연동, 실제 PG 결제, 관리자 분석 대시보드, 자동 이메일/푸시 알림, 배포 자동 브라우저 E2E 검증은 제외되었습니다.
- 5회 로그인 실패 후 10분 서버 잠금 및 30분 미사용 자동 로그아웃은 완전 구현하지 않았습니다. Supabase 자체 인증 보호 기능을 확인하고 별도 개발이 필요합니다.
- 실제 테스트 전 이용약관·개인정보 처리방침·문의처를 운영자 정보에 맞춰 완성하세요. 계정 삭제에 대한 테스트는 테스트 계정으로 수행하세요.
- 온라인 실사용 배포의 안전성은 코드만으로 보장되지 않습니다. Supabase RLS, API 권한, 비용 제한, 데이터 삭제, 이메일 인증, 쿠키 정책은 운영 환경에서 반드시 검증하세요.

## 사용자 흐름

무료 진단 → 가입·로그인 → 재무정보 + 자산 → 성향 5문항 → 목표(선택) → 미리보기 → 1,000원 **모의** 결제 → 설계도 + 투자 공부 카드 → 대시보드·체크인·미래 자산 → AI 질문·조정(포인트)

다음 데이터는 수집하지 않도록 설계했습니다: 주민등록번호, 계좌번호, 카드번호, **보유 종목명**.

## 코드 검증 이력

규칙 엔진의 문서 검증값(예: 월 여유 115, 목표 75, 장기 40, 미래 자산 비관/기본/낙관 5274/5838/6281)을 자동 테스트로 검증할 수 있습니다. 테스트 실행 및 전체 빌드 결과는 실제 개발 환경에서 `npm test`와 `npm run build`로 재확인하세요.

Build fix deployment - November 6
