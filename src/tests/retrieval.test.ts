import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { createGroq, createMistral, groqFromEnv, GROQ_URL, LlmError, mistralFromEnv, type ChatMessage, type Llm } from '../llm/chat';
import { addDays } from '../pipeline/loading/dates';
import { applyMarketFall } from '../pipeline/loading/market-fall';
import { clonePersona } from '../pipeline/loading/personas';
import { setupDatabase } from '../pipeline/loading/seed';
import { stripMarkdown } from '../pipeline/retrieval/ai';
import { DECLINED_TEXT, FALLBACK_TEXT, recordChoice, runCheckIn, type CheckInResult } from '../pipeline/retrieval/checkin';
import { decideRoute } from '../pipeline/retrieval/decide';
import { retrieveFacts } from '../pipeline/retrieval/facts';
import { findPii, PII_MESSAGE } from '../pipeline/retrieval/pii';
import { pgliteDb } from './pglite-db';

const TODAY = '2026-10-27';
let db: Db;
let riya: string;
let arjun: string;
let riyaSips: number[];

/** A scripted stand-in for Mistral: returns the given replies in order and records every call. */
function fakeLlm(...replies: (object | LlmError)[]) {
  const calls: ChatMessage[][] = [];
  const llm: Llm & { calls: ChatMessage[][] } = {
    model: 'fake-model',
    calls,
    async complete(messages) {
      calls.push(messages);
      const next = replies.shift();
      if (next === undefined) throw new Error('unexpected extra call to the model');
      if (next instanceof LlmError) throw next;
      return JSON.stringify(next);
    },
  };
  return llm;
}

function understood(overrides: Record<string, unknown> = {}) {
  return {
    primary_theme: 'Market fear', themes: ['Market fear'], behaviour: 'Continuing', asks_for_advice: false,
    misreads_cancel: false, language: 'en', confidence: 0.9, summary: 'Worried because the SIP is red after a market fall', ...overrides,
  };
}

const ask = (llm: Llm | null, text: string, sipId = riyaSips[0], investorId = riya) =>
  runCheckIn({ db, llm, today: TODAY, log: () => {} }, { investorId, sipId, moment: 'before_stop', text });

function ok(result: CheckInResult) {
  if (result.status !== 200) throw new Error(`expected 200, got ${result.status}: ${result.error}`);
  return result;
}

beforeAll(async () => {
  db = pgliteDb();
  await setupDatabase(db, { today: TODAY });
  riya = await clonePersona(db, 'riya');
  arjun = await clonePersona(db, 'arjun');
  riyaSips = (await db.query<{ id: number }>('SELECT id FROM sips WHERE investor_id = $1 ORDER BY id', [riya])).rows.map((r) => r.id);
}, 120_000);

describe('facts retrieval (step 3)', () => {
  it("reads Riya's Banyan SIP: 7 of 60 paid, Rs 14,000 in, 4 years 5 months to go", async () => {
    const lookup = await retrieveFacts(db, riya, riyaSips[0], TODAY);
    if (lookup.status !== 'ok') throw new Error(lookup.status);
    expect(lookup.goalLine).toBe('You started this for Home down payment · Mar 2031 · 7 of 60 paid · Rs 14,000 put in');
    expect(lookup.facts).toMatchObject({
      as_of: TODAY, months_invested: 7, instalments_paid: 7, instalments_skipped: 0, invested: 14000,
      next_due_date: '2026-11-02', instalments_planned: 60,
    });
    expect(lookup.facts.worst_fall_since_start_pct).toBeLessThan(0);
    const [value] = (
      await db.query<{ v: string }>(
        `SELECT (sum(i.units) * (SELECT nav FROM nav_history WHERE fund_id = 1 AND nav_date = $2))::text AS v
         FROM instalments i WHERE i.sip_id = $1`,
        [riyaSips[0], TODAY],
      )
    ).rows;
    expect(lookup.facts.current_value).toBeCloseTo(Number(value.v), 2);
    expect(lookup.unit.text).toContain('- Instalments planned: 60 (53 to go)');
  });

  it('handles a goal with no target month and a SIP with no goal', async () => {
    const harbor = await retrieveFacts(db, riya, riyaSips[1], TODAY);
    const kestrel = await retrieveFacts(db, riya, riyaSips[2], TODAY);
    if (harbor.status !== 'ok' || kestrel.status !== 'ok') throw new Error('lookup failed');
    expect(harbor.goalLine).toBe('You started this for Emergency fund · 4 paid · Rs 4,000 put in');
    expect(kestrel.goalLine).toBe('No goal is set for this SIP');
    expect(kestrel.unit.text).toContain('- Goal: No goal is set for this SIP');
  });

  it("counts Arjun's skipped month and finds his next instalment", async () => {
    const [sip] = (await db.query<{ id: number }>('SELECT id FROM sips WHERE investor_id = $1', [arjun])).rows;
    const lookup = await retrieveFacts(db, arjun, sip.id, TODAY);
    if (lookup.status !== 'ok') throw new Error(lookup.status);
    expect(lookup.facts).toMatchObject({ months_invested: 8, instalments_paid: 7, instalments_skipped: 1, next_due_date: '2026-11-10' });
  });

  it("uses the visitor's demo market fall, and only theirs", async () => {
    const visitor = await clonePersona(db, 'riya');
    const [sip] = (await db.query<{ id: number }>('SELECT id FROM sips WHERE investor_id = $1 ORDER BY id LIMIT 1', [visitor])).rows;
    const before = await retrieveFacts(db, visitor, sip.id, TODAY);
    await applyMarketFall(db, visitor);
    const after = await retrieveFacts(db, visitor, sip.id, TODAY);
    if (before.status !== 'ok' || after.status !== 'ok') throw new Error('lookup failed');
    expect(after.facts.as_of).toBe(addDays(TODAY, 1));
    expect(after.facts.current_value).toBeCloseTo(before.facts.current_value * 0.94, 0);
    const untouched = await retrieveFacts(db, riya, riyaSips[0], TODAY);
    expect(untouched.status === 'ok' && untouched.facts.as_of).toBe(TODAY);
  });
});

describe('validation and the PII guard (steps 1-2)', () => {
  it('rejects an empty or too long reason', async () => {
    expect(await ask(fakeLlm(), '   ')).toEqual({ status: 400, error: 'Tell us the reason in 1 to 500 characters.' });
    expect((await ask(fakeLlm(), 'x'.repeat(501))).status).toBe(400);
  });

  it("returns 404 for another investor's SIP", async () => {
    expect((await ask(fakeLlm(), 'Markets are down', riyaSips[0], arjun)).status).toBe(404);
    expect((await ask(fakeLlm(), 'Markets are down', 999999)).status).toBe(404);
  });

  it('stops before the AI when the SIP is already stopped', async () => {
    const visitor = await clonePersona(db, 'riya');
    const [sip] = (await db.query<{ id: number }>('SELECT id FROM sips WHERE investor_id = $1 ORDER BY id LIMIT 1', [visitor])).rows;
    await db.query("INSERT INTO sip_events (sip_id, kind) VALUES ($1, 'cancelled')", [sip.id]);
    const llm = fakeLlm();
    expect(await ask(llm, 'Markets are down', sip.id, visitor)).toEqual({ status: 400, error: 'This SIP is already stopped.' });
    expect(llm.calls).toHaveLength(0);
  });

  it('rejects personal details before Mistral and logs only a redacted copy', async () => {
    const llm = fakeLlm();
    const lines: string[] = [];
    const before = Number((await db.query<{ n: number }>('SELECT count(*)::int AS n FROM ai_checks')).rows[0].n);
    const result = await runCheckIn(
      { db, llm, today: TODAY, log: (l) => lines.push(l) },
      { investorId: riya, sipId: riyaSips[0], moment: 'before_stop', text: 'My PAN is ABCDE1234F, cancel it' },
    );
    expect(result).toEqual({ status: 400, error: PII_MESSAGE });
    expect(llm.calls).toHaveLength(0);
    expect(lines.join('\n')).toContain('[PAN]');
    expect(lines.join('\n')).not.toContain('ABCDE1234F');
    expect(Number((await db.query<{ n: number }>('SELECT count(*)::int AS n FROM ai_checks')).rows[0].n)).toBe(before);
  });

  it('finds each kind of personal detail, and leaves ordinary reasons alone', () => {
    expect(findPii('mail me at riya@example.com').found).toEqual(['email']);
    expect(findPii('OTP is 482913').found).toEqual(['OTP']);
    expect(findPii('aadhaar 1234 5678 9012').found).toEqual(['Aadhaar']);
    expect(findPii('call +91 9876543210').found).toEqual(['phone']);
    expect(findPii('account 001234567890123').found).toEqual(['account number']);
    for (const clean of ['Need money for my sister\'s wedding next month', 'Returns are negative after 5 months', 'Rs 2,000 for 60 instalments', 'Market crash ho gaya, band kar du?']) {
      expect(findPii(clean).found, clean).toEqual([]);
    }
  });
});

describe('routing (step 5)', () => {
  it('declines advice, falls back below 0.6, and routes by theme', () => {
    const route = (o: Record<string, unknown>) => decideRoute(understood(o) as never);
    expect(route({ asks_for_advice: true, confidence: 0.2 })).toEqual({ outcome: 'declined' });
    expect(route({ confidence: 0.59 })).toEqual({ outcome: 'fallback' });
    expect(route({ misreads_cancel: true, primary_theme: 'Need money' })).toEqual({ outcome: 'answer', route: 'explain' });
    expect(route({ primary_theme: 'Confusion' })).toEqual({ outcome: 'answer', route: 'explain' });
    expect(route({ primary_theme: 'Returns' })).toEqual({ outcome: 'answer', route: 'doubt' });
    expect(route({ primary_theme: 'Expectation mismatch' })).toEqual({ outcome: 'answer', route: 'doubt' });
    expect(route({ primary_theme: 'Need money' })).toEqual({ outcome: 'answer', route: 'cash' });
    expect(route({ primary_theme: 'Payment & mandate issues' })).toEqual({ outcome: 'answer', route: 'autopay' });
    expect(route({ primary_theme: 'Other' })).toEqual({ outcome: 'answer', route: 'neutral' });
  });
});

describe('the full check-in (steps 4-9)', () => {
  const groundedAnswer =
    'Your SIP is for Home down payment, by Mar 2031, with 4 years 5 months to go. You have put in Rs 14,000 over 7 months. Falls like this are common early in a long plan. You can keep it, skip next, pause or lower the amount. This is not investment advice.';

  it('answers a market-fall doubt with the goal, and logs it', async () => {
    const llm = fakeLlm(understood({ language: 'hinglish', confidence: 0.86 }), { text: groundedAnswer });
    const r = ok(await ask(llm, 'Market crash ho gaya, mera SIP red mein hai. Band kar du?'));
    expect(r).toMatchObject({ outcome: 'answer', route: 'doubt', text: groundedAnswer });
    expect(r.understood).toMatchObject({ language: 'hinglish', confidenceLabel: 'High' });
    expect(r.checks).toMatchObject({ no_advice: true, grounded: true, disclaimer: true, length: true });
    expect(r.options.map((o) => o.label)).toEqual(['Skip next', 'Lower amount', 'Pause', 'Keep my SIP', 'Stop anyway']);
    expect(llm.calls[1][0].content).toContain('Write in Hinglish');
    const [row] = (await db.query('SELECT moment, outcome, route, model, prompt_version, user_text FROM ai_checks WHERE id = $1', [r.aiCheckId])).rows;
    expect(row).toEqual({
      moment: 'before_stop', outcome: 'answer', route: 'doubt', model: 'fake-model', prompt_version: 'v6',
      user_text: 'Market crash ho gaya, mera SIP red mein hai. Band kar du?',
    });
  });

  it('declines a fund pick with fixed text and no second call', async () => {
    const llm = fakeLlm(understood({ asks_for_advice: true, primary_theme: 'Returns' }));
    const r = ok(await ask(llm, 'Which fund should I switch to for better returns?'));
    expect(r).toMatchObject({ outcome: 'declined', route: null, text: DECLINED_TEXT, checks: null });
    expect(llm.calls).toHaveLength(1);
  });

  it('explains a misread with the stop explainer in the context', async () => {
    const llm = fakeLlm(understood({ misreads_cancel: true, primary_theme: 'Confusion' }), {
      text: 'Stopping ends future instalments. It refunds no money and sells no units; they stay invested until you redeem. Skipping or pausing keeps the SIP going. This is not investment advice.',
    });
    const r = ok(await ask(llm, 'Agar cancel karu to mera paisa wapas aa jayega na?'));
    expect(r).toMatchObject({ outcome: 'answer', route: 'explain' });
    expect(llm.calls[1][1].content).toContain('What stopping a SIP does: Stopping a SIP ends the instalments');
  });

  it('offers skip, pause and lower first for a cash need', async () => {
    const llm = fakeLlm(understood({ primary_theme: 'Need money' }), {
      text: 'You can skip the next instalment, pause for 1 to 3 instalments, or lower the amount. Stopping is still available. This is not investment advice.',
    });
    const r = ok(await ask(llm, "Need money for my sister's wedding next month"));
    expect(r).toMatchObject({ outcome: 'answer', route: 'cash' });
    for (const title of ['What skipping an instalment does', 'What pausing a SIP does', 'What lowering the SIP amount does']) {
      expect(llm.calls[1][1].content).toContain(title);
    }
  });

  it('falls back when the model is unsure, fails, or is not set up', async () => {
    const unsure = fakeLlm(understood({ primary_theme: 'Not relevant', confidence: 0.1 }));
    expect(ok(await ask(unsure, 'asdfgh'))).toMatchObject({ outcome: 'fallback', route: null, text: FALLBACK_TEXT });
    expect(unsure.calls).toHaveLength(1);

    expect(ok(await ask(fakeLlm(new LlmError('Mistral did not answer within 12 s')), 'Markets are down'))).toMatchObject({ outcome: 'fallback', understood: null });
    expect(ok(await ask(fakeLlm(understood(), new LlmError('Mistral returned HTTP 500')), 'Markets are down'))).toMatchObject({ outcome: 'fallback', route: 'doubt' });
    expect(ok(await ask(null, 'Markets are down'))).toMatchObject({ outcome: 'fallback' });
  });

  it('falls back when an answer fails any of the four checks', async () => {
    const cases: [string, string][] = [
      ['no_advice', 'You should continue your SIP for Home down payment. This is not investment advice.'],
      ['grounded', 'You have put in Rs 99,999 so far for Home down payment. This is not investment advice.'],
      ['disclaimer', 'Your goal is Home down payment, by Mar 2031.'],
      ['length', `${'Your plan is long. '.repeat(30)}This is not investment advice.`],
    ];
    for (const [failing, text] of cases) {
      const r = ok(await ask(fakeLlm(understood(), { text }), 'Markets are down'));
      expect(r.outcome, failing).toBe('fallback');
      expect(r.text).toBe(FALLBACK_TEXT);
      expect((r.checks as unknown as Record<string, boolean>)[failing], failing).toBe(false);
    }
  });

  it('strips markdown the model adds before checking and showing the answer', async () => {
    const markdown =
      '**Your SIP** is for Home down payment, by Mar 2031, with 4 years 5 months to go.\n- You can *skip next* or pause.\n* Or lower the amount.\n\nThis is not investment advice.';
    const r = ok(await ask(fakeLlm(understood(), { text: markdown }), 'Markets are down'));
    expect(r.outcome).toBe('answer');
    expect(r.text).toBe(
      'Your SIP is for Home down payment, by Mar 2031, with 4 years 5 months to go.\nYou can skip next or pause.\nOr lower the amount.\n\nThis is not investment advice.',
    );
    expect(stripMarkdown('## Note\n1. Falls of -12.4% happen.\n2) Rs 14,000 stays invested.')).toBe('Note\nFalls of -12.4% happen.\nRs 14,000 stays invested.');
  });

  it('retries a broken understanding once, then falls back', async () => {
    const retried = fakeLlm(understood({ primary_theme: 'Not a theme' }), understood(), { text: groundedAnswer });
    expect(ok(await ask(retried, 'Markets are down'))).toMatchObject({ outcome: 'answer', route: 'doubt' });
    expect(retried.calls).toHaveLength(3);

    const broken = fakeLlm(understood({ confidence: 'high' }), understood({ themes: [] }));
    expect(ok(await ask(broken, 'Markets are down'))).toMatchObject({ outcome: 'fallback', understood: null });
    expect(broken.calls).toHaveLength(2);

    // A timeout is not retried: it already used its 12 seconds.
    const slow = fakeLlm(new LlmError('Mistral did not answer within 12 s'));
    expect(ok(await ask(slow, 'Markets are down'))).toMatchObject({ outcome: 'fallback' });
    expect(slow.calls).toHaveLength(1);
  });

  it('answers Hinglish typed in Latin letters in Hinglish, even when the model says Hindi', async () => {
    const latin = fakeLlm(understood({ language: 'hi' }), { text: groundedAnswer });
    expect(ok(await ask(latin, 'Market gir gaya, band kar du?')).understood).toMatchObject({ language: 'hinglish' });
    expect(latin.calls[1][0].content).toContain('Write in Hinglish');

    const devanagari = fakeLlm(understood({ language: 'hi' }), { text: groundedAnswer });
    expect(ok(await ask(devanagari, 'बाज़ार गिर गया, SIP बंद कर दूँ?')).understood).toMatchObject({ language: 'hi' });
    expect(devanagari.calls[1][0].content).toContain('Write in Hindi, in Devanagari script');
  });

  it('accepts an amount written without its comma, but still catches a new number', async () => {
    const r = ok(await ask(fakeLlm(understood(), { text: groundedAnswer.replace('Rs 14,000', 'Rs 14000') }), 'Markets are down'));
    expect(r).toMatchObject({ outcome: 'answer', checks: { grounded: true } });
    const invented = ok(await ask(fakeLlm(understood(), { text: groundedAnswer.replace('Rs 14,000', 'Rs 15000') }), 'Markets are down'));
    expect(invented.checks).toMatchObject({ grounded: false, ungrounded: ['Rs 15000'] });
  });

  it('runs the dip explainer on route doubt with no understanding call', async () => {
    const llm = fakeLlm({ text: groundedAnswer });
    const r = ok(await runCheckIn({ db, llm, today: TODAY, log: () => {} }, { investorId: riya, sipId: riyaSips[0], moment: 'is_this_normal' }));
    expect(r).toMatchObject({ outcome: 'answer', route: 'doubt', understood: null });
    expect(llm.calls).toHaveLength(1);
  });

  it('reads with the reader and writes with Mistral, and logs both models', async () => {
    const reader = { ...fakeLlm(understood()), model: 'reader-model' };
    const writer = fakeLlm({ text: groundedAnswer });
    const r = ok(await runCheckIn({ db, llm: writer, reader, today: TODAY, log: () => {} }, { investorId: riya, sipId: riyaSips[0], moment: 'before_stop', text: 'Markets are down' }));
    expect(r).toMatchObject({ outcome: 'answer', route: 'doubt' });
    expect([reader.calls.length, writer.calls.length]).toEqual([1, 1]);
    expect(reader.calls[0][0].content).toContain('You read why');
    const [row] = (await db.query('SELECT model FROM ai_checks WHERE id = $1', [r.aiCheckId])).rows;
    expect(row).toEqual({ model: 'reader-model + fake-model' });
  });

  it('lets Mistral read the reason when the reader fails, and says so in the server log', async () => {
    const reader = { ...fakeLlm(new LlmError('Groq returned HTTP 429')), model: 'reader-model' };
    const writer = fakeLlm(understood(), { text: groundedAnswer });
    const lines: string[] = [];
    const r = ok(await runCheckIn({ db, llm: writer, reader, today: TODAY, log: (line) => lines.push(line) }, { investorId: riya, sipId: riyaSips[0], moment: 'before_stop', text: 'Markets are down' }));
    expect(r).toMatchObject({ outcome: 'answer', route: 'doubt' });
    expect(lines).toEqual(['Reader reader-model failed (Groq returned HTTP 429); fake-model reads the reason instead']);
    const [row] = (await db.query('SELECT model FROM ai_checks WHERE id = $1', [r.aiCheckId])).rows;
    expect(row).toEqual({ model: 'fake-model' });
  });

  it('records what the investor chose, only on their own check-in', async () => {
    const r = ok(await ask(fakeLlm(understood(), { text: groundedAnswer }), 'Markets are down'));
    expect(await recordChoice(db, riya, r.aiCheckId, 'skip')).toEqual({ status: 200 });
    expect((await db.query('SELECT user_choice FROM ai_checks WHERE id = $1', [r.aiCheckId])).rows).toEqual([{ user_choice: 'skip' }]);
    expect((await recordChoice(db, arjun, r.aiCheckId, 'keep')).status).toBe(404);
    expect((await recordChoice(db, riya, r.aiCheckId, 'sell')).status).toBe(400);
  });
});

describe('chat models (Mistral and Groq)', () => {
  const reply = (status: number, content = '{"text":"hi"}') =>
    new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status });

  it('sends JSON mode with the key in the header, and returns the content', async () => {
    let sent: RequestInit | undefined;
    const llm = createMistral({ apiKey: 'test-key', model: 'mistral-small-latest', fetchImpl: async (_url, init) => ((sent = init), reply(200)) });
    expect(await llm.complete([{ role: 'user', content: 'hi' }], { temperature: 0 })).toBe('{"text":"hi"}');
    expect(JSON.parse(String(sent?.body))).toMatchObject({ model: 'mistral-small-latest', temperature: 0, response_format: { type: 'json_object' } });
    expect((sent?.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
  });

  it('retries once on 429, then gives up', async () => {
    const statuses = [429, 200];
    const once = createMistral({ apiKey: 'k', model: 'm', retryDelayMs: 0, fetchImpl: async () => reply(statuses.shift()!) });
    expect(await once.complete([], { temperature: 0 })).toBe('{"text":"hi"}');
    const twice = createMistral({ apiKey: 'k', model: 'm', retryDelayMs: 0, fetchImpl: async () => reply(429) });
    await expect(twice.complete([], { temperature: 0 })).rejects.toThrow('HTTP 429');
    const broken = createMistral({ apiKey: 'k', model: 'm', fetchImpl: async () => reply(500) });
    await expect(broken.complete([], { temperature: 0 })).rejects.toBeInstanceOf(LlmError);
  });

  it('sends Groq low reasoning effort for gpt-oss only', async () => {
    const sent: { url: string; body: Record<string, unknown> }[] = [];
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => (sent.push({ url: String(url), body: JSON.parse(String(init?.body)) }), reply(200));
    await createGroq({ apiKey: 'k', model: 'openai/gpt-oss-120b', fetchImpl }).complete([], { temperature: 0 });
    await createGroq({ apiKey: 'k', model: 'qwen/qwen3.8-27b', fetchImpl }).complete([], { temperature: 0 });
    expect(sent.map((s) => [s.url, s.body.reasoning_effort])).toEqual([[GROQ_URL, 'low'], [GROQ_URL, undefined]]);
  });

  it('waits out rate limits when patient, as the eval is', async () => {
    const statuses = [429, 429, 429, 200];
    const patient = createGroq({ apiKey: 'k', model: 'm', retryDelayMs: 0, patient: true, fetchImpl: async () => reply(statuses.shift()!) });
    expect(await patient.complete([], { temperature: 0 })).toBe('{"text":"hi"}');
    expect(statuses).toEqual([]);
  });

  it('gives up at once when a daily limit says to come back in hours', async () => {
    let calls = 0;
    const limited = () => (calls++, new Response('{}', { status: 429, headers: { 'retry-after': '3600' } }));
    const patient = createGroq({ apiKey: 'k', model: 'm', patient: true, fetchImpl: async () => limited() });
    await expect(patient.complete([], { temperature: 0 })).rejects.toThrow('Groq returned HTTP 429');
    expect(calls).toBe(1);
  });

  it('defaults to the free-plan models (decision D4)', () => {
    expect(mistralFromEnv({ MISTRAL_API_KEY: 'k' })?.model).toBe('ministral-8b-latest');
    expect(groqFromEnv({ GROQ_API_KEY: 'k' })?.model).toBe('openai/gpt-oss-120b');
    expect(groqFromEnv({})).toBeNull();
  });
});
