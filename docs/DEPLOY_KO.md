# 모아플랜 v0.1 — GitHub → Supabase → Vercel 무료 배포 안내

**새 버전:** 2026-11-06 문서 기준 ‘모아플랜 자산 설계도’. 이전의 ‘MOA 목표 달성 계산기’와 데이터 구조 및 환경 변수 이름이 다릅니다. **이전 서비스의 Supabase DB에 `schema.sql`을 덮어쓰지 마세요.** 새 Supabase 프로젝트를 만들거나 데이터 백업 후 마이그레이션을 개발해야 합니다.

## 0. 필요한 계정

- [GitHub](https://github.com/) 계정
- [Supabase](https://supabase.com/dashboard) 계정 (프로젝트 Free 요금제)
- [Vercel](https://vercel.com/dashboard) 계정 (비상업적·개인 프로젝트 기준 Hobby 무료 플랜)
- (선택) Anthropic 계정 / 유료 API 키 — AI 없이도 기본 앱 작동

## 1. ZIP을 다운로드해 압축 풀기

`moaplan-v01-deploy.zip`을 압축 해제합니다. 가장 바깥 `moaplan-v01` 폴더 **안**에 `package.json`, `app/`, `supabase/` 등이 들어 있습니다.

## 2. GitHub에 코드 업로드

기존 저장소 `https://github.com/chanwoochoi316/moa_test`에 올리려면 기존 코드를 교체해야 합니다. **먼저 기존 저장소를 별도 브랜치 또는 ZIP으로 백업**하세요. 새 저장소 `moaplan-test`를 만들면 기존 서비스와 혼동이 적습니다.

### 브라우저 방식

GitHub에서 새 저장소 → `Add file` → `Upload files` → 압축을 해제한 폴더 **안의 파일/폴더**(`package.json`, `app/` 등) 모두 선택 → `Commit changes`.

**주의:** `moaplan-v01` 폴더가 한 단계 더 들어가면 Vercel `Root Directory`를 `moaplan-v01`로 변경해야 합니다. `.env.local` 같은 실제 비밀 키 파일은 절대 업로드하지 마세요.

### Git 명령 방식

압축을 풀어 생성한 `moaplan-v01` 폴더에서 터미널 실행:

```bash
git init
git branch -M main
git add .
git commit -m "Initial Moaplan v0.1"
git remote add origin https://github.com/<아이디>/<새저장소>.git
git push -u origin main
```

기존 저장소에 이미 커밋이 있다면 `git push --force`는 **사용하지 마세요**. 기존 저장소를 clone한 뒤 새 코드 파일을 복사하고 일반 commit/push하거나 새 저장소를 만드세요.

## 3. Supabase 새 무료 프로젝트 + SQL

1. Supabase 대시보드 → **New project** → Free 프로젝트 생성 (가능하면 서울 지역). DB 비밀번호는 별도 보관.
2. 좌측 **SQL Editor** → `New query` → `supabase/schema.sql` 파일 내용 **전체** 복사·붙여넣기 → **Run**.
3. **Table Editor**에서 13개 테이블(`profiles`, `assets`, `risk_profiles`, `goals`, `blueprints`, `purchases`, `points_ledger`, `checkins`, `proposals`, `ai_messages`, `events`, `survey_responses`, `feedback`) 확인.
4. Authentication → **Providers → Email** 활성화. 처음에는 이메일/비밀번호 로그인만 테스트하세요.
5. 카카오 로그인은 Supabase의 Kakao Provider에서 발급받은 카카오 앱 ID/Secret 및 Redirect URL을 별도로 등록해야 합니다. 설정하지 않아도 이메일 로그인은 동작합니다.

### Supabase 키 확인

프로젝트 상단 **Connect** 또는 Project Settings → API Keys에서 다음 3개를 확인합니다.

| Vercel 환경 변수 이름 | Supabase에서 복사할 값 | 공개 여부 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL `https://...supabase.co` | 공개 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_...` | 공개 |
| `SUPABASE_SECRET_KEY` | `sb_secret_...` | **비공개 / 서버 전용** |

**중요:** 이전 MOA 프로젝트의 `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`라는 키 **이름을 사용하지 않습니다**. 새 버전은 위 3개 정확한 이름을 사용합니다. 과거 `anon`/`service_role` 레거시 키를 쓰는 Supabase 프로젝트라면 API Key 화면에서 사용 가능한 새 형식의 키를 생성하거나 코드에 맞는 키 설정을 별도로 준비하세요.

비밀 키를 GitHub, 문서, 메신저, 브라우저 코드에 붙여넣지 마세요.

## 4. Vercel에서 GitHub Import + 환경 변수

1. Vercel 대시보드 → **Add New → Project** → GitHub 저장소 `Import`.
2. Framework Preset **Next.js**. `package.json`이 루트에 있다면 Root Directory **`./`**.
3. **Environment Variables**에 위 표의 키 3개를 **값까지** 등록. `Production` 선택 필수.
4. AI 없이 테스트하려면 `AI_ENABLED=false`도 추가 (기본값이 false이므로 필수는 아닙니다).
5. **Deploy** 클릭. `Ready` / `Production` 표시가 나오면 첫 배포 완료.
6. 이미 프로젝트를 만들어 환경 변수만 수정했다면 Deployments → 최신 Production 배포 → **Redeploy**를 실행합니다. `No production deployments found`가 뜨면 먼저 새 Production 배포를 생성해야 합니다.

## 5. Supabase 인증 주소 설정

Vercel에서 발급받은 **실제** 주소 예: `https://moaplan-test.vercel.app` 사용:

- Supabase → Authentication → **URL Configuration** → Site URL: `https://moaplan-test.vercel.app`
- Redirect URLs에 `https://moaplan-test.vercel.app/**` 추가.
- 로컬 테스트도 한다면 `http://localhost:3000/**` 추가.
- 설정 후 이메일 인증 → 로그인 → 로그아웃 → 비밀번호 재설정 메일 흐름까지 테스트합니다.

## 6. 외부 공개 전 최종 확인

- [ ] 무료 진단: 월 280, 지출 165, 자산 800 → 여유 115, 10년 후 약 1억 7,150만원(연 3% 가정)
- [ ] 새 이메일 가입, 인증 메일 수신, 로그인, 로그아웃
- [ ] 재무정보(월 280, 고정 95, 생활 70, 예적금 800) 저장
- [ ] 성향 5문항으로 위험중립형 진단 (점수 50)
- [ ] 결혼 목표 3,000만원·36개월 선택 → 미리보기는 월 배분 상세를 숨김
- [ ] 1,000원 **모의** 결제 → 실제 카드정보나 돈 요청 없음 / 20P 적립
- [ ] 설계도 월 목표 75, 장기 40, 안전 24, 해외 10, 국내 6 확인
- [ ] 10년 미래 자산(장기 월 40 기준) 비관 5,274 / 기본 5,838 / 낙관 6,281
- [ ] 월간 체크인 1회 +2P, 같은 달 수정해도 추가 지급 없음
- [ ] AI 키 없을 때 기본 설명 표시 및 포인트 미차감
- [ ] 변경안 검증: 위험자산 80% 요청은 위험중립형에서 거절, 해외 80% 조정은 허용
- [ ] 적용 버튼 클릭 시 −3P 후 새 설계도 버전 생성
- [ ] 가입한 두 계정이 서로의 데이터에 접근할 수 없는지 확인
- [ ] 설정 → 계정 및 데이터 삭제 → 다시 로그인 불가·관련 레코드 삭제 확인
- [ ] 개인정보 안내, 이용약관, 환불/모의결제 고지, 문의처 문구를 운영자 정보에 맞게 수정

## AI 연결(선택)

`ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `AI_ENABLED=true`를 **Vercel 서버 환경 변수**에 등록한 뒤 재배포합니다. Claude API의 지원 모델 ID는 Anthropic 계정에서 확인하세요. API는 사용량에 따라 과금되며, 이 앱은 별도의 결제 한도나 강제적인 예산 차단 장치를 제공하지 않습니다. **초기 사용자 테스트에는 `AI_ENABLED=false`를 권장**합니다. AI 미연결 때도 규칙 기반 설계도·관리·설명은 사용할 수 있습니다.

## 운영 메모 / 기능 범위

- 결제는 모의로만 처리, 실제 1,000원 청구 **없음**.
- RLS로 다른 계정의 열람을 제한하지만, Secret key를 가진 서버 API는 RLS를 우회하므로 회원 확인 및 입력 검사가 매우 중요합니다.
- 사용자 이름/이메일·종목명·계좌번호는 AI에 보내지 않도록 최소화했습니다. 사용자 질문에 식별정보를 직접 입력하지 않도록 안내합니다.
- 정확한 수익 예측이나 법률·금융 자문이 아닙니다. 가정 수익률, 세금·수수료 미반영을 고지합니다.
- 카카오 OAuth는 개발자 콘솔 설정 필요. 5회 로그인 실패 잠금, 30분 미사용 강제 로그아웃, 관리용 통계 대시보드, 정기 알림은 추후 작업.
- 고객 테스트 종료 뒤 데이터 보존 및 삭제 정책은 운영자가 직접 이행해야 합니다. 사용자 탈퇴 시 해당 사용자 콘텐츠는 삭제되며 이벤트는 익명화됩니다.

### 문제 발생 시

- `NEXT_PUBLIC_SUPABASE...` 오류: Vercel에서 **새 변수 이름** 정확히 확인 → 다시 Deploy.
- `relation does not exist`: `schema.sql`을 새 Supabase 프로젝트에 실행했는지 확인.
- `permission denied`/RLS: SQL Editor에서 정책·함수 생성 로그, Auth 세션, `SUPABASE_SECRET_KEY`를 확인.
- 로그인은 되나 이메일 인증에서 다른 사이트로 감: Supabase URL Configuration의 **실제** Vercel 주소 확인.
- 카카오 로그인 실패: 카카오 앱 Redirect URL과 Supabase Auth Providers 설정을 확인. 이메일로 먼저 테스트.
- `Build Failed`: Vercel → Deployments → 실패한 배포 → Build Logs 마지막 부분 확인.

**주의:** 빌드 및 실제 DB 연동 검증은 사용자 환경에서 수행해야 합니다. 제공 소스코드는 자동 계산 테스트 및 TSX 구문 검사와 별개로 배포 환경에 따른 검증이 필요합니다.
