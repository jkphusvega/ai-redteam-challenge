// ============================================================
// lib/types.ts — 애플리케이션 전역 TypeScript 타입 정의
// ============================================================

// ----------------------------------------------------------
// 게임 설정
// ----------------------------------------------------------

/** 스테이지 난이도 */
export type Difficulty = 'easy' | 'medium' | 'hard';

/** 게임 전역 설정 (Supabase game_config 테이블과 1:1 대응) */
export interface GameConfig {
  id: 1;
  maxAttempts: number;
  stage1Difficulty: Difficulty;
  stage2Difficulty: Difficulty;
  stage1SecretCode: string;
  stage2SecretCode: string;
  isGameActive: boolean;
  updatedAt: string;
}

/** Supabase DB row 형태 (snake_case) */
export interface GameConfigRow {
  id: 1;
  max_attempts: number;
  stage1_difficulty: Difficulty;
  stage2_difficulty: Difficulty;
  stage1_secret_code?: string;
  stage2_secret_code?: string;
  admin_password_hash: string;
  is_game_active: boolean;
  updated_at: string;
}

// ----------------------------------------------------------
// 스테이지
// ----------------------------------------------------------

/** 스테이지 메타데이터 */
export interface Stage {
  id: 1 | 2;
  title: string;
  description: string;
  secretCode: string;
  emoji: string;
}

// ----------------------------------------------------------
// 채팅
// ----------------------------------------------------------

/** 채팅 메시지 (Gemini API history용) */
export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

/** /api/chat 요청 바디 */
export interface ChatRequest {
  teamName: string;
  stageId: 1 | 2;
  message: string;
  turnNumber: number;
  history: ChatMessage[];
}

/** /api/chat 응답 */
export interface ChatResponse {
  reply: string;
  success: boolean;
  matchedPattern?: string;
}

// ----------------------------------------------------------
// 판정
// ----------------------------------------------------------

/** judge.ts 판정 결과 */
export interface JudgeResult {
  success: boolean;
  matchedPattern?: string;
}

// ----------------------------------------------------------
// DB 기록
// ----------------------------------------------------------

/** attempts 테이블 row */
export interface AttemptRow {
  id: string;
  team_name: string;
  stage: number;
  prompt_text: string;
  ai_response: string;
  success: boolean;
  turn_number: number;
  created_at: string;
}

/** defense_submissions 테이블 row */
export interface DefenseSubmissionRow {
  id: string;
  team_name: string;
  defense_prompt: string;
  blocked_count: number;
  total_attacks: number;
  created_at: string;
}

// ----------------------------------------------------------
// 방어 테스트
// ----------------------------------------------------------

/** 공격 문구 1건의 테스트 결과 */
export interface AttackResult {
  attackPrompt: string;
  aiResponse: string;
  blocked: boolean;
}

/** /api/defense-test 응답 */
export interface DefenseTestResponse {
  blockedCount: number;
  totalAttacks: number;
  results: AttackResult[];
}

// ----------------------------------------------------------
// 관리자
// ----------------------------------------------------------

/** /api/admin/login 요청 */
export interface AdminLoginRequest {
  password: string;
}

/** /api/admin/config PATCH 요청 */
export interface AdminConfigPatch {
  maxAttempts?: number;
  stage1Difficulty?: Difficulty;
  stage2Difficulty?: Difficulty;
  stage1SecretCode?: string;
  stage2SecretCode?: string;
  isGameActive?: boolean;
  newPassword?: string;
}
