import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { createGroq, createMistral, groqFromEnv, GROQ_URL, LlmError, mistralFromEnv, type ChatMessage, type Llm } from '../llm/chat';
import { addDays } from '../pipeline/loading/dates';
import { applyMarketFall } from '../pipeline/loading/market-fall';
import { clonePersona } from '../pipeline/loading/personas';
import { setupDatabase } from '../pipeline/loading/seed';
import { parseUnderstanding, stripMarkdown } from '../pipeline/retrieval/ai';
import { detectLanguage, scriptLanguage, writtenIn } from '../pipeline/retrieval/language';
import { cardText, DECLINED_TEXT, FALLBACK_TEXT, PREDICTION_TEXT, recordChoice, runCheckIn, withLocalDisclaimer, type CheckInResult } from '../pipeline/retrieval/checkin';
import { loadClaimPatterns } from '../pipeline/loading/fixtures';
import { runChecks } from '../pipeline/retrieval/checks';
import { decideRoute } from '../pipeline/retrieval/decide';
import { retrieveFacts } from '../pipeline/retrieval/facts';
import { findPii, PII_MESSAGE } from '../pipeline/retrieval/pii';
import { factsProblem } from '../pipeline/chunking/facts';
import { answerMessages, LOCAL_DISCLAIMERS, ROUTE_EXPLAINERS } from '../pipeline/retrieval/prompts';
import { situation, slotsFor } from '../pipeline/retrieval/slots';
import { PERSONA_KEYS } from '../pipeline/loading/raw';
import { startSip } from '../server/funds';
import { investmentsView } from '../server/investments';
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

describe('The cash route', () => {
  it('gets the stopping explainer too, and says stopping gives no money back and a redemption may have an exit load', async () => {
    expect(ROUTE_EXPLAINERS.cash).toEqual(['skip', 'pause', 'lower_amount', 'stop']);
    const lookup = await retrieveFacts(db, arjun, (await db.query<{ id: number }>('SELECT id FROM sips WHERE investor_id = $1', [arjun])).rows[0].id, TODAY);
    if (lookup.status === 'not_found') throw new Error('missing');
    const slots = slotsFor(lookup.facts, { pause: true });
    const [system, user] = answerMessages({
      route: 'cash', slots, situation: situation(lookup.facts), explainers: [], language: 'en', moment: 'before_stop', reason: 'I need the money',
    });
    expect(system.content).toContain('Say that stopping gives no money back; getting money out is a separate redemption, which may have an exit load.');
    // The exit load reaches the writer as a placeholder, never as a number.
    expect(user.content).toContain('- {exit_load}: an exit load of #% if redeemed within # year');
  });
});

describe('The day of a demo market fall', () => {
  it('measures a fall on the day a new SIP started from the price it was bought at', async () => {
    // The seed's last NAV is TODAY; a SIP started the next day buys at that NAV, and the demo fall is added for that day.
    const tomorrow = addDays(TODAY, 1);
    const visitor = await clonePersona(db, 'kabir');
    const started = await startSip(db, visitor, { fundId: 1, amount: 1000, day: 4 }, tomorrow);
    if (started.status !== 200) throw new Error(started.error);
    await applyMarketFall(db, visitor);
    const lookup = await retrieveFacts(db, visitor, started.id, tomorrow);
    if (lookup.status !== 'ok') throw new Error(lookup.status);
    expect(lookup.facts.worst_fall_since_start_pct).toBe(-6);
    expect(lookup.unit.lines).toContainEqual({ label: 'Worst fall since start', value: '-6.0%' });
    expect(lookup.unit.lines).toContainEqual({ label: 'Change vs put in', value: '-Rs 60 (-6.0%)' });
    expect(factsProblem(lookup.facts)).toBeNull();
    const view = await investmentsView(db, visitor);
    expect(view?.rows.find((r) => r.label === '1D returns')?.value).toBe('-₹60 (-6.0%)');
    expect(view?.rows.find((r) => r.label === 'Total returns')?.value).toBe('-₹60 (-6.0%)');
  });

  it("leaves every seed persona's worst fall as it was, and their facts pass the sanity check", async () => {
    for (const key of PERSONA_KEYS) {
      const investor = await clonePersona(db, key);
      const sips = (await db.query<{ id: number; fund_id: number }>('SELECT id, fund_id FROM sips WHERE investor_id = $1', [investor])).rows;
      for (const sip of sips) {
        const lookup = await retrieveFacts(db, investor, sip.id, TODAY);
        if (lookup.status === 'not_found') throw new Error('missing SIP');
        expect(factsProblem(lookup.facts)).toBeNull();
        // The worst fall the way it was worked out before: from the first payment date, peak from the NAVs only.
        const [before] = (
          await db.query<{ worst: string | null }>(
            `SELECT round(min(nav / peak - 1) * 100, 1)::text AS worst FROM (
               SELECT nav, max(nav) OVER (ORDER BY nav_date) AS peak FROM visible_nav_history($1)
               WHERE fund_id = $2 AND nav_date >= (SELECT min(paid_on) FROM instalments WHERE sip_id = $3 AND paid_on IS NOT NULL)
             ) t`,
            [investor, sip.fund_id, sip.id],
          )
        ).rows;
        expect(lookup.facts.worst_fall_since_start_pct).toBe(before.worst === null ? null : Number(before.worst));
      }
    }
  });

  it("doesn't let facts that don't add up reach the AI: the fallback card, and no model call", async () => {
    const later = addDays(TODAY, 5);
    const visitor = await clonePersona(db, 'kabir');
    const started = await startSip(db, visitor, { fundId: 1, amount: 1000, day: 4 }, later);
    if (started.status !== 200) throw new Error(started.error);
    // Worth less than was put in, with no NAV after the payment to show a fall: the facts contradict each other.
    await db.query('UPDATE instalments SET units = units * 0.9 WHERE sip_id = $1', [started.id]);
    const lookup = await retrieveFacts(db, visitor, started.id, later);
    if (lookup.status !== 'ok') throw new Error(lookup.status);
    expect(factsProblem(lookup.facts)).toMatch(/worst fall since start is missing/);
    const llm = fakeLlm();
    const result = ok(await runCheckIn({ db, llm, today: later, log: () => {} }, { investorId: visitor, sipId: started.id, moment: 'is_this_normal' }));
    expect(result.outcome).toBe('fallback');
    expect(llm.calls).toHaveLength(0);
  });
});

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
    expect(route({ asks_for_advice: true, confidence: 0.2 })).toEqual({ outcome: 'declined', kind: 'advice' });
    // A market prediction is its own intent; a fund's future returns are both, and read as a prediction.
    expect(route({ asks_for_prediction: true, confidence: 0.2 })).toEqual({ outcome: 'declined', kind: 'prediction' });
    expect(route({ asks_for_prediction: true, asks_for_advice: true })).toEqual({ outcome: 'declined', kind: 'prediction' });
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
  // The writer never writes a number: it writes placeholders, and the server fills them in.
  const groundedAnswer =
    'Your SIP is for {goal_name}, by {goal_date}, with {time_to_goal}. You have {put_in_so_far}, over {months_invested}. Values move with the market. You can keep it, skip next, pause or lower the amount. This is not investment advice.';
  const groundedShown =
    'Your SIP is for Home down payment, by Mar 2031, with 4 years 5 months to go. You have Rs 14,000 put in so far, over 7 months invested. Values move with the market. You can keep it, skip next, pause or lower the amount. This is not investment advice.';
  // The same answer as a model would write it in Hinglish and in Hindi: only the language changes.
  const hinglishAnswer =
    'Aapka SIP {goal_name} ke liye hai, {goal_date} tak, aur {time_to_goal} hain. Aapne {put_in_so_far} hain. Aap keep, skip, pause ya amount lower kar sakte hain. This is not investment advice.';
  const hindiAnswer =
    'आपका SIP {goal_name} के लिए है, {goal_date} तक, {time_to_goal} हैं। आपने {put_in_so_far} हैं। आप जारी रख सकते हैं, skip, pause या amount कम कर सकते हैं। This is not investment advice.';

  it('answers a market-fall doubt with the goal, and logs it', async () => {
    const llm = fakeLlm(understood({ language: 'hinglish', confidence: 0.86 }), { text: hinglishAnswer });
    const r = ok(await ask(llm, 'Market crash ho gaya, mera SIP red mein hai. Band kar du?'));
    // The placeholders are filled in Hinglish, and a Hinglish answer carries the Hinglish disclaimer too, just before the English one.
    expect(r).toMatchObject({
      outcome: 'answer', route: 'doubt',
      text: 'Aapka SIP Home down payment ke liye hai, Mar 2031 tak, aur goal tak 4 saal 5 mahine baaki hain. Aapne ab tak Rs 14,000 lagaye hain. Aap keep, skip, pause ya amount lower kar sakte hain. Yeh investment advice nahi hai. This is not investment advice.',
    });
    expect(r.understood).toMatchObject({ language: 'hinglish', confidenceLabel: 'High' });
    expect(r.checks).toMatchObject({ no_advice: true, grounded: true, disclaimer: true, length: true });
    expect(r.options.map((o) => o.label)).toEqual(['Skip next', 'Lower amount', 'Pause', 'Keep my SIP', 'Stop anyway']);
    expect(llm.calls[1][0].content).toContain('Write in Hinglish');
    const [row] = (await db.query('SELECT moment, outcome, route, model, prompt_version, user_text FROM ai_checks WHERE id = $1', [r.aiCheckId])).rows;
    expect(row).toEqual({
      moment: 'before_stop', outcome: 'answer', route: 'doubt', model: 'fake-model', prompt_version: 'v13',
      user_text: 'Market crash ho gaya, mera SIP red mein hai. Band kar du?',
    });
  });

  it('declines a fund pick with fixed text and no second call', async () => {
    const llm = fakeLlm(understood({ asks_for_advice: true, primary_theme: 'Returns' }));
    const r = ok(await ask(llm, 'Which fund should I switch to for better returns?'));
    // A facts-only card ends with the disclaimer, as an AI answer does.
    expect(r).toMatchObject({ outcome: 'declined', declineKind: 'advice', route: null, text: `${DECLINED_TEXT} This is not investment advice.`, checks: null });
    expect(llm.calls).toHaveLength(1);
  });

  it("says first that it can't predict markets, then shows the facts, with no second call", async () => {
    const llm = fakeLlm(understood({ asks_for_prediction: true, primary_theme: 'Market fear' }));
    const r = ok(await ask(llm, 'Will the market fall more next month?'));
    expect(r).toMatchObject({ outcome: 'declined', declineKind: 'prediction', route: null, checks: null, fallbackReason: null });
    expect(r.text).toBe(`${PREDICTION_TEXT} This is not investment advice.`);
    expect(r.text.split('. ')[0]).toBe("This app can't predict whether markets will rise or fall");
    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0][0].content).toContain('"asks_for_prediction"');
    // In the investor's language.
    const hinglish = ok(await ask(fakeLlm(understood({ asks_for_prediction: true, language: 'hinglish' })), 'Market aur girega kya?'));
    expect(hinglish.text).toBe(cardText('prediction', 'hinglish'));
  });

  it('shows the fixed cards in Hindi or Hinglish, by code when the AI could not read the reason', async () => {
    const hindi = ok(await ask(fakeLlm(understood({ asks_for_advice: true, language: 'hi' })), 'कौन सा फंड सबसे अच्छा है?'));
    expect(hindi).toMatchObject({ language: 'hi', text: cardText('advice', 'hi') });
    // No AI at all: the investor's own words settle the language.
    const down = ok(await ask(null, 'job chali gayi, paise chahiye'));
    expect(down).toMatchObject({ outcome: 'fallback', language: 'hinglish', text: cardText('fallback', 'hinglish') });
    expect(ok(await ask(null, 'I need the money'))).toMatchObject({ language: 'en', text: `${FALLBACK_TEXT} This is not investment advice.` });
  });

  it('explains a misread with the stop explainer in the context', async () => {
    const llm = fakeLlm(understood({ misreads_cancel: true, primary_theme: 'Confusion' }), {
      text: 'Stop karne se aage ke instalments band ho jaate hain. Koi paisa refund nahi hota aur units sell nahi hote; redeem karne tak woh invested rehte hain. Skip ya pause se SIP chalta rehta hai. This is not investment advice.',
    });
    // Hinglish, though the model said English: the investor's own words settle it, and the answer must match.
    const r = ok(await ask(llm, 'Agar cancel karu to mera paisa wapas aa jayega na?'));
    expect(r).toMatchObject({ outcome: 'answer', route: 'explain' });
    expect(llm.calls[1][1].content).toContain('What stopping a SIP does: Stopping a SIP ends the instalments');
  });

  it('offers skip, pause and lower first for a cash need', async () => {
    const llm = fakeLlm(understood({ primary_theme: 'Need money' }), {
      text: 'You can skip the next instalment, pause for {pause_length}, or lower the amount. Stopping is still available. This is not investment advice.',
    });
    const r = ok(await ask(llm, "Need money for my sister's wedding next month"));
    expect(r).toMatchObject({ outcome: 'answer', route: 'cash' });
    expect(r.text).toContain('pause for 1 to 3 instalments, or lower');
    for (const title of ['What skipping an instalment does', 'What pausing a SIP does', 'What lowering the SIP amount does']) {
      expect(llm.calls[1][1].content).toContain(title);
    }
  });

  it('falls back when the model is unsure, fails, or is not set up, and says which step stopped it', async () => {
    const unsure = fakeLlm(understood({ primary_theme: 'Not relevant', confidence: 0.1 }));
    expect(ok(await ask(unsure, 'asdfgh'))).toMatchObject({ outcome: 'fallback', route: null, text: cardText('fallback', 'en'), fallbackReason: { kind: 'unsure' } });
    expect(unsure.calls).toHaveLength(1);

    expect(ok(await ask(fakeLlm(new LlmError('Mistral did not answer within 10 s')), 'Markets are down'))).toMatchObject({
      outcome: 'fallback', understood: null, fallbackReason: { kind: 'timeout' },
    });
    expect(ok(await ask(fakeLlm(understood(), new LlmError('Mistral returned HTTP 500')), 'Markets are down'))).toMatchObject({
      outcome: 'fallback', route: 'doubt', fallbackReason: { kind: 'error' },
    });
    expect(ok(await ask(null, 'Markets are down'))).toMatchObject({ outcome: 'fallback', fallbackReason: { kind: 'error' } });
    // An answer or a decline has no fallback reason.
    expect(ok(await ask(fakeLlm(understood(), { text: groundedAnswer }), 'Markets are down')).fallbackReason).toBeNull();
    expect(ok(await ask(fakeLlm(understood({ asks_for_advice: true })), 'Which fund?')).fallbackReason).toBeNull();
  });

  it('falls back when an answer fails any of the checks, and names the check', async () => {
    const cases: [string, string][] = [
      ['no_advice', 'You should continue your SIP for Home down payment. This is not investment advice.'],
      ['grounded', 'You have put in Rs 99,999 so far for Home down payment. This is not investment advice.'],
      ['disclaimer', 'Your goal is Home down payment, by {goal_date}.'],
      ['length', `${'Your plan is long. '.repeat(30)}This is not investment advice.`],
      ['no_claims', 'This fall is temporary for Home down payment, by {goal_date}. This is not investment advice.'],
    ];
    for (const [failing, text] of cases) {
      // The writer writes the same failing draft twice: a wrong number or a long draft gets a second try (v12).
      const llm = fakeLlm(understood(), { text }, { text });
      const r = ok(await ask(llm, 'Markets are down'));
      expect(r.outcome, failing).toBe('fallback');
      expect(r.text).toBe(cardText('fallback', 'en'));
      expect((r.checks as unknown as Record<string, boolean>)[failing], failing).toBe(false);
      expect(r.fallbackReason, failing).toEqual({ kind: 'checks', failed: [failing] });
      // Advice, a claim or no disclaimer never gets a second try.
      const retried = failing === 'grounded' || failing === 'length';
      expect(llm.calls, failing).toHaveLength(retried ? 3 : 2);
      expect(r.checks!.second_draft, failing).toEqual(retried ? [failing === 'grounded' ? 'numbers' : 'length'] : undefined);
    }
  });

  it('finds unsupported claims in English, Hindi and Hinglish, and leaves plain numbers alone', () => {
    const claims = loadClaimPatterns();
    const found = (text: string) => runChecks(`${text} This is not investment advice.`, [], [], claims);
    for (const text of [
      'This is a normal dip.', "Don't worry, it will bounce back.", 'A small dip like this is temporary.', 'Falls like this are common.',
      'The fund will recover.', 'There is nothing to worry about.',
      'Chinta mat karo, market wapas aa jayega.', 'Yeh normal hai.', 'Sab theek ho jayega.', 'Ghabraiye mat.',
      'यह गिरावट सामान्य है।', 'चिंता मत कीजिए।', 'सब ठीक हो जाएगा।',
    ]) {
      expect(found(text).no_claims, text).toBe(false);
    }
    expect(found('Ghabraiye mat.').claims_found).toEqual(['\\bghabra(iye|o|na)? mat\\b']);
    for (const text of [
      groundedAnswer.replace(' This is not investment advice.', ''),
      'Aapka SIP Home down payment ke liye hai. Value aaj Rs 12,086 hai, worst fall -14.2% raha.',
      'आपने अब तक Rs 14,000 लगाए हैं। आज इसकी कीमत Rs 12,086 है।',
    ]) {
      expect(found(text).no_claims, text).toBe(true);
    }
  });

  it('tells the writer never to call a fall normal, and gives it the fund history as a fact', async () => {
    const lookup = await retrieveFacts(db, riya, riyaSips[0], TODAY);
    if (lookup.status !== 'ok') throw new Error(lookup.status);
    const slots = slotsFor(lookup.facts, { pause: false });
    const [system, user] = answerMessages({
      route: 'doubt', slots, situation: situation(lookup.facts), explainers: [], language: 'en', moment: 'is_this_normal', reason: '',
    });
    expect(system.content).toContain(
      'Never call a fall normal, small, big, temporary or expected, and never tell them not to worry. Describe it only with its placeholders.',
    );
    // The fund's history reaches the writer as a placeholder, which the dip guidance points to.
    expect(user.content).toContain("- {fund_biggest_fall}: a #% fall in <a month and year>, the biggest in this fund's demo history");
    expect(system.content).toContain('First: {worst_fall}, next to {fund_biggest_fall}.');
    expect(system.content).not.toContain('Describe what is normal only in general terms.');
    const biggest = lookup.facts.fund_biggest_fall;
    expect(biggest?.pct).toBeLessThan(0);
    // The fund's whole history includes the months since this SIP started, so its fall is at least as deep.
    expect(biggest!.pct).toBeLessThanOrEqual(lookup.facts.worst_fall_since_start_pct! + 0.05);
    expect(lookup.unit.text).toMatch(/\n- Biggest fall from a high in this fund's demo history: -\d+\.\d% \([A-Z][a-z]{2} \d{4}\)\n/);
  });

  it('writes Hindi and Hinglish answers with the reader, and with Mistral when the reader fails', async () => {
    const reader = { ...fakeLlm(understood({ language: 'hinglish' }), { text: hinglishAnswer }), model: 'reader-model' };
    const writer = fakeLlm();
    const r = ok(await runCheckIn({ db, llm: writer, reader, today: TODAY, log: () => {} }, { investorId: riya, sipId: riyaSips[0], moment: 'before_stop', text: 'Market gir gaya, band kar du?' }));
    expect(r).toMatchObject({ outcome: 'answer', route: 'doubt' });
    expect([reader.calls.length, writer.calls.length]).toEqual([2, 0]);
    expect(reader.calls[1][0].content).toContain('Write in Hinglish');
    expect((await db.query('SELECT model FROM ai_checks WHERE id = $1', [r.aiCheckId])).rows).toEqual([{ model: 'reader-model' }]);

    const failing = { ...fakeLlm(understood({ language: 'hi' }), new LlmError('Groq returned HTTP 429')), model: 'reader-model' };
    const backup = fakeLlm({ text: hindiAnswer });
    const lines: string[] = [];
    const hi = ok(await runCheckIn({ db, llm: backup, reader: failing, today: TODAY, log: (l) => lines.push(l) }, { investorId: riya, sipId: riyaSips[0], moment: 'before_stop', text: 'बाज़ार गिर गया, SIP बंद कर दूँ?' }));
    expect(hi).toMatchObject({ outcome: 'answer', route: 'doubt' });
    expect(backup.calls[0][0].content).toContain('Write in Hindi, in Devanagari script');
    expect(lines).toEqual(['Writer reader-model failed (Groq returned HTTP 429); fake-model writes instead']);
    expect((await db.query('SELECT model FROM ai_checks WHERE id = $1', [hi.aiCheckId])).rows).toEqual([{ model: 'reader-model + fake-model' }]);
  });

  it('strips markdown the model adds before checking and showing the answer', async () => {
    const markdown =
      '**Your SIP** is for {goal_name}, by {goal_date}, with {time_to_goal}.\n- You can *skip next* or pause.\n* Or lower the amount.\n\nThis is not investment advice.';
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

  it('fills the placeholders, and blocks any number the model writes itself, even one the facts state', async () => {
    const r = ok(await ask(fakeLlm(understood(), { text: groundedAnswer }), 'Markets are down'));
    expect(r).toMatchObject({ outcome: 'answer', text: groundedShown, checks: { grounded: true } });
    // Rs 14,000 is a real fact, but the model wrote it, not the server: it could have given it any meaning.
    // Each gets one second draft (v12), and here writes the number again.
    const twice = (text: string) => fakeLlm(understood(), { text }, { text });
    const copied = ok(await ask(twice(groundedAnswer.replace('{put_in_so_far}', 'put in Rs 14,000')), 'Markets are down'));
    expect(copied).toMatchObject({ outcome: 'fallback', checks: { grounded: false }, fallbackReason: { kind: 'checks', failed: ['grounded'] } });
    expect(copied.checks!.ungrounded).toContain('written by the AI: 14,000');
    const invented = ok(await ask(twice(groundedAnswer.replace('{put_in_so_far}', 'put in Rs 15000')), 'Markets are down'));
    expect(invented.checks).toMatchObject({ grounded: false, ungrounded: ['written by the AI: 15000', 'Rs 15000'] });
  });

  it('checks every number: counts, units and amounts without "Rs" must be numbers the facts state', () => {
    const facts = ['Rs 14,000', '60', '53', '44.2', '2031', '4 years', '5 months'];
    const check = (text: string) => runChecks(`${text} This is not investment advice.`, facts, [], []).ungrounded;
    expect(check('53 instalments are still to come, and Rs 2,000 buys 44.2 units by 2031.')).toEqual(['Rs 2,000']);
    expect(check('You have put in 14,000 rupees; 53 of 60 instalments to go.')).toEqual([]);
    expect(check('99 instalments are still to come.')).toEqual(['99']);
    expect(check("About 45 units at today's NAV.")).toEqual(['45']);
    // A duration must match as written: "4 years" is a fact, "5 years" is not.
    expect(check('4 years 5 months to go.')).toEqual([]);
    expect(check('5 years to go.')).toEqual(['5 years']);
    // Digits in another script can't be checked, so they fail.
    expect(check('५३ किस्तें बाकी हैं।')).toEqual(['५३']);
  });

  it('wants the Hindi or Hinglish disclaimer as well as the English one in those languages', () => {
    const english = 'Your goal is Home down payment. This is not investment advice.';
    expect(runChecks(english, [], [], [], 'hinglish').disclaimer).toBe(false);
    expect(runChecks(withLocalDisclaimer(english, 'hinglish'), [], [], [], 'hinglish').disclaimer).toBe(true);
    expect(withLocalDisclaimer(english, 'hi')).toBe(`Your goal is Home down payment. ${LOCAL_DISCLAIMERS.hi} This is not investment advice.`);
    expect(withLocalDisclaimer(english, 'en')).toBe(english);
    // Written by the model already, or no English disclaimer to put it before: left as it is.
    const both = `Goal set. ${LOCAL_DISCLAIMERS.hinglish} This is not investment advice.`;
    expect(withLocalDisclaimer(both, 'hinglish')).toBe(both);
    expect(withLocalDisclaimer('No disclaimer here.', 'hi')).toBe('No disclaimer here.');
  });

  it('keeps the 90-word limit on the reply and the English disclaimer; the added local disclaimer is not counted', () => {
    const reply = (n: number) => `${'shabd '.repeat(n)}`.trim();
    // 85 words of reply + the English disclaimer (5) = 90: passes, with the Hinglish one on top.
    const hinglish = `${reply(85)} ${LOCAL_DISCLAIMERS.hinglish} This is not investment advice.`;
    expect(runChecks(hinglish, [], [], [], 'hinglish')).toMatchObject({ length: true, words: 90 });
    // One more word of reply goes over, as before.
    expect(runChecks(`${reply(86)} ${LOCAL_DISCLAIMERS.hinglish} This is not investment advice.`, [], [], [], 'hinglish')).toMatchObject({ length: false, words: 91 });
    expect(runChecks(`${reply(86)} This is not investment advice.`, [], [], [], 'en')).toMatchObject({ length: false, words: 91 });
  });

  it('reads a confidence written as text ("0.95"), as Mistral writes it, but still rejects anything else', () => {
    const reply = (confidence: unknown) => JSON.stringify({ ...understood(), confidence });
    expect(parseUnderstanding(reply('0.95')).confidence).toBe(0.95);
    expect(parseUnderstanding(reply(0.95)).confidence).toBe(0.95);
    for (const bad of ['high', '1.5', '', '0. nine', null]) {
      expect(() => parseUnderstanding(reply(bad)), String(bad)).toThrow('does not match the schema');
    }
  });

  it("settles the language from the investor's own words when the model says English", () => {
    expect(detectLanguage('Market crash ho gaya, mera SIP red mein hai')).toBe('hinglish');
    expect(detectLanguage('बाज़ार गिर गया')).toBe('hi');
    for (const english of ['I need the money', 'I want to cancel so I get my invested amount back', 'Is this the right fund?', '']) {
      expect(detectLanguage(english), english).toBe('en');
    }
    expect(scriptLanguage('job chali gayi, paise chahiye', 'en')).toBe('hinglish');
    expect(scriptLanguage('Market gir gaya, band kar du?', 'hi')).toBe('hinglish');
    expect(scriptLanguage('I need the money', 'en')).toBe('en');
  });

  it('reads "a fall of 6%" as the facts\' "-6.0%", but still catches 6.5%', () => {
    const facts = ['-6.0%', 'Rs 3,000'];
    expect(runChecks('A fall of 6% on Rs 3,000. This is not investment advice.', facts, [], []).ungrounded).toEqual([]);
    expect(runChecks('A fall of 6.5% on Rs 3,000. This is not investment advice.', facts, [], []).ungrounded).toEqual(['6.5%']);
    expect(runChecks('A fall of 60% on Rs 3,000. This is not investment advice.', facts, [], []).ungrounded).toEqual(['60%']);
  });

  it('runs the dip explainer on route doubt with no understanding call', async () => {
    const llm = fakeLlm({ text: groundedAnswer });
    const r = ok(await runCheckIn({ db, llm, today: TODAY, log: () => {} }, { investorId: riya, sipId: riyaSips[0], moment: 'is_this_normal' }));
    expect(r).toMatchObject({ outcome: 'answer', route: 'doubt', understood: null, moment: 'is_this_normal', goalDetail: 'plan' });
    expect(llm.calls).toHaveLength(1);
    // Its own guidance: connect the dip to the goal and timeline, with the plan's share and the units at the latest NAV.
    const system = llm.calls[0][0].content;
    expect(system).toContain("connect today's dip to their goal and timeline");
    expect(system).toContain('Second: {share_put_in_pct}, {instalments_to_go} and {time_to_goal}, for {goal_name}.');
    expect(system).toContain('Third: each future instalment buys units at the NAV on its date: {units_now}, against {units_at_peak}.');
    const user = llm.calls[0][1].content;
    expect(user).toContain('- {share_put_in_pct}: #% of the planned amount put in so far');
    expect(user).toContain('- {units_now}: # units per instalment at the latest NAV');
    // The writer never sees a number, so it has none to copy or misuse.
    expect(user).not.toMatch(/\d/);
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

  it("tries once more when Groq rejects the model's own JSON, and not on other 400s", async () => {
    const invalid = () => new Response(JSON.stringify({ error: { code: 'json_validate_failed', message: 'Failed to generate JSON.' } }), { status: 400 });
    const replies = [invalid(), reply(200)];
    const once = createGroq({ apiKey: 'k', model: 'm', fetchImpl: async () => replies.shift()! });
    expect(await once.complete([], { temperature: 0 })).toBe('{"text":"hi"}');
    let calls = 0;
    const twice = createGroq({ apiKey: 'k', model: 'm', fetchImpl: async () => (calls++, invalid()) });
    await expect(twice.complete([], { temperature: 0 })).rejects.toThrow('Groq returned HTTP 400');
    expect(calls).toBe(2);
    calls = 0;
    const other = createGroq({ apiKey: 'k', model: 'm', fetchImpl: async () => (calls++, new Response('{"error":{"code":"model_not_found"}}', { status: 400 })) });
    await expect(other.complete([], { temperature: 0 })).rejects.toThrow('Groq returned HTTP 400');
    expect(calls).toBe(1);
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
