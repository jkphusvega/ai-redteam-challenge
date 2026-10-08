import 'server-only';

// ============================================================
// lib/missionSecrets.ts — 서버 전용 미션 정답 및 암호 생성 관리
//
// 주의: 본 파일은 'server-only'가 적용되어 브라우저 클라이언트 JS 번들에
// 절대 포함되지 않으며, 클라이언트에서 import 시도시 빌드 에러가 발생합니다.
// ============================================================

export const STAGE2_CODES: Record<1 | 2 | 3, string> = {
  1: '032',
  2: '505',
  3: '9052',
};

/**
 * 팀명을 기반으로 일관성 있는 4자리 고유 랜덤 암호 생성 (STAGE 1 탈취 목표)
 */
export function generateTeamStage1Code(teamName: string): string {
  const clean = (teamName || '도전자').trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = (hash * 31 + clean.charCodeAt(i)) & 0x7fffffff;
  }
  const codeNum = 1000 + (hash % 9000); // 1000 ~ 9999 4자리 난수
  return String(codeNum);
}
