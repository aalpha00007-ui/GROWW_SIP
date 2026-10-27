// Chat models, called from the server only: keys never reach the browser (PRD §3.4).
// Mistral and Groq both speak the OpenAI-style chat completions API, so one client serves both.

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** A chat model that answers in JSON mode and returns the reply's content. */
export interface Llm {
  readonly model: string;
  complete(messages: ChatMessage[], options: { temperature: number }): Promise<string>;
}

/** Any failure to get a usable reply. The pipeline turns it into the fallback card. */
export class LlmError extends Error {}

export const MISTRAL_URL = 'https://api.mistral.ai/v1/chat/completions';
export const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
/** Reads the investor's reason (call 1): the strongest model on Groq's free plan (architecture decision D4). */
export const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-120b';
/** Writes the answer (call 2): Mistral's free plan allows 0 requests a minute on mistral-small and -medium (D4). */
export const DEFAULT_MISTRAL_MODEL = 'ministral-8b-latest';
const TIMEOUT_MS = 12_000;
/** A patient client waits out rate limits this many times, for the eval; the app retries once and moves on. */
const PATIENT_RETRIES = 8;
/** Longer than this means a daily limit, not a per-minute one: give up rather than stall the eval for hours. */
const MAX_PATIENT_WAIT_MS = 60_000;

export interface ChatModelOptions {
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
  /** Wait before the one retry after a 429 (rate limited). */
  retryDelayMs?: number;
  /**
   * For the eval: keep waiting out 429s, as long as the provider's retry-after says. In the app a rate limit
   * gives up after one retry, so the investor never waits long.
   */
  patient?: boolean;
}

export function mistralFromEnv(env: NodeJS.ProcessEnv = process.env, options: { patient?: boolean } = {}): Llm | null {
  if (!env.MISTRAL_API_KEY) return null;
  return createMistral({ apiKey: env.MISTRAL_API_KEY, model: env.MISTRAL_MODEL || DEFAULT_MISTRAL_MODEL, ...options });
}

/** The reader for call 1, or null when no GROQ_API_KEY is set (then Mistral reads too). */
export function groqFromEnv(env: NodeJS.ProcessEnv = process.env, options: { patient?: boolean } = {}): Llm | null {
  if (!env.GROQ_API_KEY) return null;
  return createGroq({ apiKey: env.GROQ_API_KEY, model: env.GROQ_MODEL || DEFAULT_GROQ_MODEL, ...options });
}

export function createMistral(options: ChatModelOptions): Llm {
  return createChatModel('Mistral', MISTRAL_URL, options);
}

export function createGroq(options: ChatModelOptions): Llm {
  // gpt-oss thinks before it answers; low effort keeps it fast and inside the free plan's tokens a minute.
  const extra = options.model.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' } : {};
  return createChatModel('Groq', GROQ_URL, options, extra);
}

function createChatModel(provider: string, url: string, options: ChatModelOptions, extraBody: Record<string, unknown> = {}): Llm {
  const { apiKey, model, fetchImpl = fetch, retryDelayMs = 2_000, patient = false } = options;
  return {
    model,
    async complete(messages, { temperature }) {
      for (let attempt = 1; ; attempt++) {
        let response: Response;
        try {
          response = await fetchImpl(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({ model, messages, temperature, response_format: { type: 'json_object' }, ...extraBody }),
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });
        } catch (err) {
          const timedOut = (err as Error).name === 'TimeoutError';
          throw new LlmError(timedOut ? `${provider} did not answer within 12 s` : `${provider} request failed: ${(err as Error).message}`);
        }
        const retryAfterMs = Number(response.headers.get('retry-after')) * 1000;
        const dailyLimit = patient && retryAfterMs > MAX_PATIENT_WAIT_MS;
        if (response.status === 429 && attempt <= (patient ? PATIENT_RETRIES : 1) && !dailyLimit) {
          await new Promise((resolve) => setTimeout(resolve, patient && retryAfterMs > 0 ? retryAfterMs + 500 : retryDelayMs));
          continue;
        }
        if (!response.ok) throw new LlmError(`${provider} returned HTTP ${response.status}`);
        const body = (await response.json()) as { choices?: { message?: { content?: unknown } }[] };
        const content = body.choices?.[0]?.message?.content;
        if (typeof content !== 'string') throw new LlmError(`${provider} returned no message`);
        return content;
      }
    },
  };
}
