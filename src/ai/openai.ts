// OpenAI chat-completions client. The HTTP function is injected (Obsidian's requestUrl in production).
import type { ChatMessage } from './prompt';
import type { AiOp } from './apply';

export interface AiSettings { apiKey: string; model: string; baseUrl: string }
export const DEFAULT_AI_SETTINGS: AiSettings = { apiKey: '', model: 'gpt-5', baseUrl: 'https://api.openai.com/v1' };

export type HttpRequest = { url: string; method: 'POST'; headers: Record<string, string>; body: string };
export type HttpFn = (req: HttpRequest) => Promise<{ status: number; json: any }>;

export async function askOpenAI(settings: AiSettings, messages: ChatMessage[], opts: { request: HttpFn; signal?: AbortSignal }): Promise<{ reply: string; ops: AiOp[] }> {
  const key = (settings.apiKey || '').trim();
  if (!key) throw new Error('No OpenAI API key — set it in Settings → Mindmap');
  if (opts.signal?.aborted) throw new Error('Stopped');
  const base = (settings.baseUrl || DEFAULT_AI_SETTINGS.baseUrl).replace(/\/+$/, '');
  const req = opts.request({
    url: base + '/chat/completions',
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: settings.model || DEFAULT_AI_SETTINGS.model, messages, response_format: { type: 'json_object' } }),
  });
  const res = await (opts.signal
    ? Promise.race([req, new Promise<never>((_, rej) => opts.signal!.addEventListener('abort', () => rej(new Error('Stopped')), { once: true }))])
    : req);
  if (opts.signal?.aborted) throw new Error('Stopped');
  if (res.status >= 400) throw new Error(res.json?.error?.message || `OpenAI request failed (HTTP ${res.status})`);
  const content = res.json?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('OpenAI returned no message');
  try {
    const v = JSON.parse(content);
    return { reply: typeof v.reply === 'string' ? v.reply : '', ops: Array.isArray(v.ops) ? v.ops : [] };
  } catch {
    return { reply: content, ops: [] };
  }
}
