// ============================================================
// lib/upstage.ts — Upstage Solar API 클라이언트 (OpenAI 호환 REST)
//
// 환경 변수:
//   UPSTAGE_API_KEY  — Upstage 콘솔에서 발급한 키 (up_... 형식)
//   UPSTAGE_MODEL    — 사용할 모델명 (기본값: solar-pro)
// ============================================================

const UPSTAGE_ENDPOINT = 'https://api.upstage.ai/v1/chat/completions';

export type UpstageMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export function getUpstageApiKey(): string {
  return process.env.UPSTAGE_API_KEY ?? '';
}

export function isUpstageConfigured(): boolean {
  return Boolean(getUpstageApiKey());
}

export function getUpstageModel(): string {
  return process.env.UPSTAGE_MODEL || 'solar-pro';
}

/**
 * Upstage Chat Completions 호출 후 첫 번째 응답 텍스트를 반환합니다.
 * 실패 시 예외를 던지므로 호출부에서 Fallback 처리하세요.
 */
export async function upstageChat(
  messages: UpstageMessage[],
  options: { temperature?: number; maxTokens?: number; timeoutMs?: number } = {}
): Promise<string> {
  const apiKey = getUpstageApiKey();
  if (!apiKey) throw new Error('UPSTAGE_API_KEY가 설정되지 않았습니다.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);

  try {
    const res = await fetch(UPSTAGE_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: getUpstageModel(),
        messages,
        temperature: options.temperature ?? 0.7,
        ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Upstage API 오류 (${res.status}): ${errText.slice(0, 300)}`);
    }

    const data = await res.json();
    const content: unknown = data?.choices?.[0]?.message?.content;
    return typeof content === 'string' ? content : '';
  } finally {
    clearTimeout(timer);
  }
}
