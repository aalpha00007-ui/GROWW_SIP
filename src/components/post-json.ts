// POSTs JSON to one of our APIs. A failed request reads as an error with a plain-English message.
export type Posted<T> = { ok: true; data: T } | { ok: false; error: string };

export async function postJson<T = { message?: string }>(url: string, body: unknown = {}): Promise<Posted<T>> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => null);
  const data = (await response?.json().catch(() => null)) as (T & { error?: string }) | null;
  if (response?.ok && data) return { ok: true, data };
  return { ok: false, error: data?.error ?? 'That did not work. Check your connection and try again.' };
}
