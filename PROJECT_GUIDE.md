# 🛡️ AI Red Team Challenge (AI 프롬프트 인젝션 대항전)

> **프로젝트 개요**: LLM의 프롬프트 인젝션(Prompt Injection) 및 탈옥(Jailbreak) 취약점을 공격하고 방어하며 실시간으로 학습하는 대화형 멀티플레이어 보안 교육 플랫폼입니다.

---

## 📌 목차
1. [핵심 기능](#-핵심-기능)
2. [기술 스택](#-기술-스택)
3. [디렉토리 구조](#-디렉토리-구조)
4. [환경 변수 설정 (.env.local)](#-환경-변수-설정-envlocal)
5. [로컬 실행 가이드](#-로컬-실행-가이드)
6. [핵심 시스템 아키텍처](#-핵심-시스템-아키텍처)
7. [데이터베이스 및 Supabase 설정](#-데이터베이스-및-supabase-설정)
8. [협업 및 배포 워크플로우](#-협업-및-배포-워크플로우)

---

## ✨ 핵심 기능

### 1. 🎮 스테이지별 레드팀 챌린지 (`/stage/[stageId]`)
- **Stage 1: 기본 방어벽 (기초 인젝션)**  
  - LLM 시스템 프롬프트에 숨겨진 비밀 암호(`FLAG{...}`)를 탈취하는 미션
- **Stage 2: 다중 페르소나 및 역할극 방어벽 (고급 인젝션)**  
  - 번역가, 디버거, 가상 시나리오 페르소나를 뚫고 동적 비밀 코드를 획득하는 미션
- **Stage 3: 논리 및 수학적 역추론 방어벽**  
  - 직접적인 질문 차단 시 우회 수식을 유도하여 해독하는 미션

### 2. 👥 실시간 멀티플레이어 팀 룸 (Realtime Team Room)
- **팀 단위 동시 협업**: 같은 팀명을 입력하면 자동으로 같은 채널에 입장
- **실시간 동접자 프로필 (Presence)**: 현재 같은 방에 들어와 있는 팀원의 접속 상태, 닉네임, 에이전트 아바타 및 실시간 인원수 표시
- **채팅 기록 실시간 동기화**: 팀원이 입력한 프롬프트 공격 및 AI 응답이 모든 팀원 화면에 실시간 브로드캐스팅

### 3. ⚙️ 관리자 실시간 제어 센터 (`/admin`, `/admin/dashboard`)
- 기본 관리자 비밀번호: `admin1234`
- **시크릿 코드 실시간 변경**: 관리자가 주사위 버튼을 눌러 난수를 생성하거나 직접 입력하면, DB에 즉시 반영되어 AI가 지키는 암호가 실시간으로 변경됨
- **최대 시도 횟수(Max Attempts) 실시간 조절**: 슬라이더로 제한을 조정하면 팀 화면에 즉각 적용
- **실시간 공격 로그 모니터링**: 참가자들의 인젝션 시도 로그 실시간 감시

### 4. 🛡️ 시스템 프롬프트 디펜스 빌더 (`/defense`)
- 참가자가 직접 AI의 방어 시스템 프롬프트를 작성하여 제출
- 10가지 공격 패턴(DAN, Base64 난독화, 가상 시나리오 등)을 자동으로 실행하여 방어 점수(Defense Score) 산출

---

## 🛠 기술 스택

| 구분 | 기술 / 라이브러리 | 설명 |
| :--- | :--- | :--- |
| **Frontend** | **Next.js 16 (App Router)** | React 19 기반 최신 SSR/CSR 하이브리드 아키텍처 |
| **Styling** | **Tailwind CSS v4** | 모던 다크모드 사이버펑크 테마 UI |
| **AI Model** | **Google Gemini 3.6 Flash** | 고속 추론 및 멀티턴 대화 처리 (`@google/generative-ai`) |
| **Database** | **Supabase (PostgreSQL)** | 팀 세션, 공격 로그, 시크릿 코드 관리 |
| **Realtime** | **Supabase Realtime & Presence** | WebSocket 기반 팀원 실시간 상태 및 채팅 동기화 |
| **Deployment**| **Vercel** | GitHub 연동 자동 CI/CD 배포 |

---

## 📂 디렉토리 구조

```
ai-redteam-challenge/
├── app/
│   ├── layout.tsx              # 전역 레이아웃 및 폰트 설정
│   ├── page.tsx                # 메인 페이지 (팀명 입력 & 스테이지 선택)
│   ├── stage/
│   │   └── [stageId]/page.tsx  # 스테이지별 팀 채팅 & 인원 표시 UI
│   ├── defense/
│   │   └── page.tsx            # 시스템 프롬프트 방어 샌드박스
│   ├── admin/
│   │   ├── page.tsx            # 관리자 로그인 페이지
│   │   └── dashboard/page.tsx  # 관리자 제어 대시보드
│   └── api/
│       ├── chat/route.ts       # Gemini AI 멀티턴 호출 & 생각 블록 정제 API
│       ├── defense/route.ts    # 방어 10대 공격 테스트 API
│       └── admin/              # 관리자 인증 및 설정 변경 API
├── lib/
│   ├── stagePrompts.ts         # 스테이지별 기본 시스템 프롬프트 및 안내
│   ├── judge.ts                # 플래그 탈취 성공 여부 판정 로직
│   ├── supabase.ts             # Supabase Client 생성 (SSR/CSR 호환)
│   └── types.ts                # TypeScript 데이터 타입 정의
├── supabase/
│   └── schema.sql              # DB 테이블, RLS 정책, Realtime 활성화 스크립트
└── .env.local                  # 로컬 환경 변수 (보안상 Git 제외)
```

---

## 🔑 환경 변수 설정 (.env.local)

프로젝트 루트 디렉토리에 `.env.local` 파일을 생성하고 아래 키를 입력해야 합니다.  
*(보안 파일이므로 절대 Git에 커밋하지 마세요)*

```env
# 1. Supabase 접속 정보 (Supabase 대시보드 > Project Settings > API)
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...

# 2. Supabase 서비스 롤 키 (관리자 및 서버사이드 DB 조작용)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...

# 3. Google Gemini API 키 (Google AI Studio에서 발급)
GEMINI_API_KEY=AIzaSy...

# 4. 관리자 세션 토큰 (관리자 로그인 인증 쿠키용 임의 문자열)
ADMIN_SESSION_TOKEN=redteam_admin_secret_token_2026
```

---

## 🚀 로컬 실행 가이드

```bash
# 1. 저장소 복제 (팀원 기준)
git clone https://github.com/jkphusvega/ai-redteam-challenge.git
cd ai-redteam-challenge

# 2. 의존성 패키지 설치
npm install

# 3. 환경 변수 파일 생성
# 루트 경로에 .env.local 생성 후 공유받은 키 복사/붙여넣기

# 4. 로컬 개발 서버 실행
npm run dev
```

브라우저에서 `http://localhost:3000`에 접속하여 플레이 및 개발을 진행합니다.

---

## 🧠 핵심 시스템 아키텍처

### 1. 실시간 동적 시크릿 코드 주입 흐름
```
[관리자 대시보드 (/admin)] 
       │ (시크릿 코드 변경: FLAG{NEW_CODE})
       ▼
[Supabase `app_settings` 테이블]
       ▲
       │ (사용자 메시지 전송 시 실시간 조회)
[API: /api/chat] 
       │ (시스템 프롬프트에 실시간 시크릿 코드 주입)
       ▼
[Google Gemini 3.6 Flash] 
       │ (추론 및 응답)
       ▼
[클라이언트 정제 & 플래그 검증]
```

### 2. Gemini 응답 필터링 (`sanitizeAIResponse`)
최신 Gemini 모델은 내부 추론(Thinking) 과정을 `(생각) ... (생각 끝)` 형태로 출력하는 경우가 있습니다.  
`app/api/chat/route.ts`의 정규식 필터를 통해 추론 과정 중 비밀 코드가 노출되거나 불필요한 사유가 사용자에게 노출되지 않도록 서버사이드에서 정제 후 클라이언트로 반환합니다.

### 3. Supabase Presence 기반 동접자 집계
`app/stage/[stageId]/page.tsx`에서 `supabase.channel(`room:${stageId}:${teamName}`)`을 구독하여:
- 각 사용자의 `userId`, `nickname`, `avatar` 정보를 실시간 브로드캐스팅합니다.
- `presence.on('sync')` 이벤트로 현재 방에 접속 중인 정확한 팀원 명단과 인원수를 화면 우측에 실시간 렌더링합니다.

---

## 🗄️ 데이터베이스 및 Supabase 설정

Supabase 웹 콘솔의 **SQL Editor**에서 `supabase/schema.sql` 스크립트를 실행하면 필요한 모든 테이블과 Realtime 설정이 완료됩니다.

### 주요 테이블
- `teams`: 팀 정보 및 현재 진행 스테이지, 시도 횟수
- `chat_logs`: 팀별 스테이지 채팅 내역 (멀티턴 히스토리 복원용)
- `challenge_attempts`: 인젝션 성공/실패 기록
- `app_settings`: 스테이지별 동적 시크릿 코드 (`stage1_secret_code`, `stage2_secret_code` 등) 및 전역 설정

---

## 🤝 협업 및 배포 워크플로우

1. **깃 브랜치 전략**:
   - `main`: Vercel 프로덕션에 자동 배포되는 브랜치입니다.
   - 새로운 기능 추가 시 `feature/기능명` 브랜치에서 작업 후 `main`으로 PR(Pull Request)을 올려 머지하는 것을 권장합니다.
2. **배포**:
   - `main` 브랜치에 코드가 push되면 Vercel이 자동으로 감지하여 1~2분 내에 빌드 및 배포를 완료합니다.
   - Vercel 대시보드의 **Environment Variables**에도 로컬의 `.env.local` 키와 동일한 값들이 등록되어 있어야 합니다.
