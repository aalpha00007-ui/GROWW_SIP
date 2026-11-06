// POSTs JSON to one of our APIs. A failed request reads as an error with a plain-English message.
export type Posted<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * For saves: stop waiting after this long, and say the outcome isn't known. The server may still finish, so these are
 * saves it can safely take twice (a repeated start or investment changes nothing: server/funds.ts SAME_SAVE).
 */
export const SAVE = { timeoutMs: 20_000 };
const NO_REPLY = "We didn't get a reply, so this may or may not have gone through. It's safe to try again.";

export async function postJson<T = { message?: string }>(url: string, body: unknown = {}, { timeoutMs }: { timeoutMs?: number } = {}): Promise<Posted<T>> {
  const controller = new AbortController();
  const timer = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : null;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: controller.signal,
  }).catch(() => null);
  const data = (await response?.json().catch(() => null)) as (T & { error?: string }) | null;
  if (timer) clearTimeout(timer);
  if (response?.ok && data) return { ok: true, data };
  if (timeoutMs && !data) return { ok: false, error: NO_REPLY };
  return { ok: false, error: data?.error ?? 'That did not work. Check your connection and try again.' };
}
