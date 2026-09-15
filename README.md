# 🛡️ AI Red Team Challenge (AI 프롬프트 인젝션 대항전)

실시간 멀티플레이어 협업 기반의 LLM 프롬프트 인젝션 & 보안 탈옥(Jailbreak) 교육 및 대항전 플랫폼입니다.

[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Realtime%20%26%20DB-3ECF8E?style=flat-square&logo=supabase)](https://supabase.com/)
[![Google Gemini](https://img.shields.io/badge/Gemini-3.6%20Flash-4285F4?style=flat-square&logo=google)](https://ai.google.dev/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v4-38B2AC?style=flat-square&logo=tailwind-css)](https://tailwindcss.com/)

---

## ⚡ 빠른 시작 (Quick Start)

### 1. 저장소 클론 및 패키지 설치
```bash
git clone https://github.com/jkphusvega/ai-redteam-challenge.git
cd ai-redteam-challenge
npm install
```

### 2. 환경 변수 설정
루트 경로에 `.env.local` 파일을 생성하고 필요한 키들을 입력합니다:
```env
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
GEMINI_API_KEY=AIzaSy...
ADMIN_SESSION_TOKEN=your_admin_secret_token
```

### 3. 개발 서버 실행
```bash
npm run dev
```
브라우저에서 [http://localhost:3000](http://localhost:3000)으로 접속합니다.

---

## 📖 상세 프로젝트 문서
팀원 협업 안내, 아키텍처, 데이터베이스 스키마 및 관리자 기능에 대한 전체 가이드는 아래 문서를 참고하세요:

👉 **[상세 프로젝트 가이드 문서 (PROJECT_GUIDE.md)](./PROJECT_GUIDE.md)**

---

## 🎮 주요 기능 소개
- **스테이지별 챌린지 (`/stage/[id]`)**: 초급, 중급, 고급 단계의 프롬프트 인젝션 공격 미션
- **실시간 멀티플레이어 팀 룸**: Supabase Presence 기반 동접 팀원 프로필 및 실시간 채팅 동기화
- **관리자 실시간 제어 센터 (`/admin`)**: 시크릿 코드 난수 즉시 변경, 최대 시도 횟수 조절, 라이브 공격 로그 감시
- **시스템 프롬프트 방어 샌드박스 (`/defense`)**: 10대 주요 LLM 탈옥 공격 자동 시뮬레이션 및 방어력 점수 산출
