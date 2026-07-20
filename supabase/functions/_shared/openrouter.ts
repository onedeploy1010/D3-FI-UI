// OpenRouter LLM client for Supabase Edge Functions (Deno).
// Ported from server/services/openrouter.ts — real HTTP calls to openrouter.ai.
// Configured via the `OPENROUTER_API_KEY` (+ optional model/site) edge secrets.

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

function getConfig() {
  const apiKey = Deno.env.get('OPENROUTER_API_KEY');
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not configured');
  return {
    apiKey,
    model: Deno.env.get('OPENROUTER_MODEL') || 'openai/gpt-4o-mini',
    siteUrl: Deno.env.get('OPENROUTER_SITE_URL') || 'https://d3-fi.com',
    siteName: Deno.env.get('OPENROUTER_SITE_NAME') || 'D3-AI Analytics',
  };
}

export function isOpenRouterConfigured(): boolean {
  return Boolean(Deno.env.get('OPENROUTER_API_KEY'));
}

export async function chatCompletion(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  options?: { json?: boolean; temperature?: number; maxTokens?: number },
): Promise<string> {
  const cfg = getConfig();
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': cfg.siteUrl,
      'X-Title': cfg.siteName,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      temperature: options?.temperature ?? 0.4,
      max_tokens: options?.maxTokens ?? 1200,
      ...(options?.json ? { response_format: { type: 'json_object' } } : {}),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter error ${res.status}: ${err}`);
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenRouter returned empty response');
  return content;
}

export async function analyzeJson<T>(system: string, user: string): Promise<T> {
  const raw = await chatCompletion(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    { json: true, temperature: 0.3 },
  );
  return JSON.parse(raw) as T;
}
