// Task 2: the investor's language, by code, and the check that the reply is in it. Every AI reply here is
// scripted (a fake model): no call leaves this computer.
import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { LlmError, type ChatMessage, type Llm } from '../llm/chat';
import { clonePersona } from '../pipeline/loading/personas';
import { setupDatabase } from '../pipeline/loading/seed';
import { cardText, runCheckIn, type CheckInResult } from '../pipeline/retrieval/checkin';
import { detectLanguage, scriptLanguage, writtenIn } from '../pipeline/retrieval/language';
import { DISCLAIMER, LOCAL_DISCLAIMERS } from '../pipeline/retrieval/prompts';
import { checkInCard } from '../server/checkin-card';
import { pgliteDb } from './pglite-db';

describe('Detecting the language from the investor\'s own words', () => {
  it.each([
    ['Market crash ho gaya, mera SIP red mein hai. Band kar du?', 'hinglish'],
    ['job chali gayi, paise chahiye', 'hinglish'],
    ['Agar cancel karu to mera paisa wapas aa jayega na?', 'hinglish'],
    ['SIP cancel karne se autopay bhi band hoga kya?', 'hinglish'],
    ['बाज़ार गिर गया, SIP बंद कर दूँ?', 'hi'],
    ['मुझे पैसों की ज़रूरत है', 'hi'],
    ['சந்தை வீழ்ச்சி அடைந்துள்ளது', 'other'], // Tamil
    ['বাজার পড়ে গেছে', 'other'], // Bengali
    ['بازار گر گیا ہے', 'other'], // Urdu
    ['I need the money', 'en'],
    ['Is this the right fund?', 'en'],
    ['I want to cancel so I get my invested amount back', 'en'],
    ['SIP band', 'en'], // one Hindi word is not enough
    ['', 'en'],
  ])('reads "%s" as %s', (text, language) => {
    expect(detectLanguage(text)).toBe(language);
  });

  it.each([
    // [reason, what the model said, what is used]
    ['Market gir gaya, band kar du?', 'en', 'hinglish'],
    ['Market gir gaya, band kar du?', 'hi', 'hinglish'],
    ['बाज़ार गिर गया, SIP बंद कर दूँ?', 'hinglish', 'hi'],
    ['बाज़ार गिर गया, SIP बंद कर दूँ?', 'en', 'hi'],
    ['बाजार पडला आहे, SIP बंद करू का?', 'other', 'other'], // Marathi: the model knows it isn't Hindi
    ['சந்தை வீழ்ச்சி அடைந்துள்ளது', 'en', 'other'],
    ['சந்தை வீழ்ச்சி அடைந்துள்ளது', 'hi', 'other'],
    ['paise chahiye abhi', 'other', 'hinglish'],
    ['I need the money', 'en', 'en'],
    ['I need the money', 'other', 'other'],
  ] as const)('"%s", read by the model as %s, is answered in %s', (reason, said, used) => {
    expect(scriptLanguage(reason, said)).toBe(used);
  });

  it('checks a reply is in the language, without counting the disclaimers', () => {
    const hinglish = `Aapka SIP chalu hai aur aap pause kar sakte hain. ${LOCAL_DISCLAIMERS.hinglish} ${DISCLAIMER}`;
    const hindi = `आपका SIP चालू है। ${LOCAL_DISCLAIMERS.hi} ${DISCLAIMER}`;
    const english = `Your SIP is running. ${DISCLAIMER}`;
    expect(writtenIn(hinglish, 'hinglish')).toBe(true);
    expect(writtenIn(hindi, 'hi')).toBe(true);
    expect(writtenIn(english, 'en')).toBe(true);
    expect(writtenIn(english, 'other')).toBe(true); // other languages are answered in English
    // An English reply with the Hinglish disclaimer stuck on is still English.
    expect(writtenIn(`Your SIP is running. ${LOCAL_DISCLAIMERS.hinglish} ${DISCLAIMER}`, 'hinglish')).toBe(false);
    expect(writtenIn(`Your SIP is running. ${LOCAL_DISCLAIMERS.hi} ${DISCLAIMER}`, 'hi')).toBe(false);
    expect(writtenIn(hinglish, 'en')).toBe(false);
    expect(writtenIn(hindi, 'en')).toBe(false);
    expect(writtenIn(hindi, 'hinglish')).toBe(false);
  });
});

describe('A check-in in each language, with scripted AI replies', () => {
  const TODAY = '2026-10-27';
  let db: Db;
  let riya: string;
  let sipId: number;

  // The same reply in three languages, with placeholders for Riya's numbers: the server fills them in.
  const REPLIES = {
    en: 'Your SIP is for {goal_name}, by {goal_date}, with {time_to_goal}. You have {put_in_so_far}, over {months_invested}. You can keep it, skip next, pause or lower the amount. This is not investment advice.',
    hinglish: 'Aapka goal {goal_name} hai, {goal_date} tak, aur {time_to_goal} hain. Aapne {put_in_so_far} hain. Aap keep, skip, pause ya amount lower kar sakte hain. This is not investment advice.',
    hi: 'आपका लक्ष्य {goal_name} है, {goal_date} तक, {time_to_goal} हैं। आपने {put_in_so_far} हैं। आप SIP जारी रख सकते हैं, skip, pause या amount कम कर सकते हैं। This is not investment advice.',
  };
  // The quality-check line in each language, for an answer that wasn't in the investor's language.
  const NOT_IN_LANGUAGE: Record<string, string> = {
    en: "Quality check: the answer wasn't in your language → showing facts only",
    other: "Quality check: the answer wasn't in your language → showing facts only",
    hinglish: 'Quality check: jawab aapki bhasha mein nahi tha → sirf facts dikha rahe hain',
    hi: 'गुणवत्ता जाँच: जवाब आपकी भाषा में नहीं था → सिर्फ़ तथ्य दिखा रहे हैं',
  };

  /** Scripted replies in order, recording every call. */
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
  const reading = (language: string, summary = 'Worried about the market fall') => ({
    primary_theme: 'Market fear', themes: ['Market fear'], behaviour: 'Continuing', asks_for_advice: false, asks_for_prediction: false,
    misreads_cancel: false, language, confidence: 0.9, summary,
  });
  async function ask(llm: Llm | null, reason: string) {
    const r: CheckInResult = await runCheckIn({ db, llm, today: TODAY, log: () => {} }, { investorId: riya, sipId, moment: 'before_stop', text: reason });
    if (r.status !== 200) throw new Error(r.error);
    return r;
  }
  const systemPrompt = (llm: { calls: ChatMessage[][] }) => llm.calls[1][0].content;

  beforeAll(async () => {
    db = pgliteDb();
    await setupDatabase(db, { today: TODAY });
    riya = await clonePersona(db, 'riya');
    [{ id: sipId }] = (await db.query<{ id: number }>('SELECT id FROM sips WHERE investor_id = $1 ORDER BY id LIMIT 1', [riya])).rows;
  }, 120_000);

  it('answers Hinglish in Hinglish, even when the model says English, with its disclaimer once', async () => {
    const llm = fakeLlm(reading('en', 'Market girne se dar kar SIP band karna chahte hain'), { text: REPLIES.hinglish });
    const r = await ask(llm, 'Market crash ho gaya, mera SIP red mein hai. Band kar du?');
    expect(systemPrompt(llm)).toContain('Write in Hinglish');
    expect(r).toMatchObject({ outcome: 'answer', language: 'hinglish', checks: { in_language: true } });
    // The numbers are filled in Hinglish, each with what it means.
    expect(r.text).toContain('Mar 2031 tak, aur goal tak 4 saal 5 mahine baaki hain. Aapne ab tak Rs 14,000 lagaye hain.');
    expect(r.text.endsWith(LOCAL_DISCLAIMERS.hinglish)).toBe(true);
    expect(r.text).not.toContain(DISCLAIMER);
    expect(checkInCard(r)).toMatchObject({ lang: 'hi-Latn', understood: 'Market girne se dar kar SIP band karna chahte hain' });
    // How it was checked is in Hinglish too.
    expect(checkInCard(r).checked?.summary).toBe('Yeh jawab kaise check hua');
    expect(checkInCard(r).checked?.items.map((s) => s.label)).toContain('Numbers aapke SIP se milaye');
  });

  it('answers Hindi in Hindi, even when the model says Hinglish, with its disclaimer once', async () => {
    const llm = fakeLlm(reading('hinglish', 'बाज़ार गिरने से SIP बंद करना चाहते हैं'), { text: REPLIES.hi });
    const r = await ask(llm, 'बाज़ार गिर गया, SIP बंद कर दूँ?');
    expect(systemPrompt(llm)).toContain('Write in Hindi, in Devanagari script');
    expect(r).toMatchObject({ outcome: 'answer', language: 'hi', checks: { in_language: true } });
    // The numbers are filled in Hindi: the month in Devanagari, years and months as साल and महीने.
    expect(r.text).toContain('मार्च 2031 तक, लक्ष्य तक 4 साल 5 महीने बाकी हैं। आपने अब तक लगाए Rs 14,000 हैं।');
    expect(r.text.endsWith(LOCAL_DISCLAIMERS.hi)).toBe(true);
    expect(r.text).not.toContain(DISCLAIMER);
    expect(checkInCard(r).lang).toBe('hi');
    expect(checkInCard(r).checked?.summary).toBe('यह जवाब कैसे जाँचा गया');
    expect(checkInCard(r).checked?.items.map((s) => s.label)).toContain('आंकड़े आपके SIP से मिलाए');
  });

  it('answers English in English, with the English disclaimer only', async () => {
    const llm = fakeLlm(reading('en'), { text: REPLIES.en });
    const r = await ask(llm, 'Markets are down and my SIP is red');
    expect(r).toMatchObject({
      outcome: 'answer', language: 'en', checks: { in_language: true },
      text: 'Your SIP is for Home down payment, by Mar 2031, with 4 years 5 months to go. You have Rs 14,000 put in so far, over 7 months invested. You can keep it, skip next, pause or lower the amount. This is not investment advice.',
    });
    expect(checkInCard(r).checked?.items.map((s) => s.label)).toEqual([
      'Checked for advice words', 'Numbers compared with your SIP', 'Disclaimer included', 'Length checked', 'Checked for unsupported claims', 'Language checked', 'Goal details compared with your SIP',
    ]);
  });

  it('answers other languages in English, which the checks can read', async () => {
    const tamil = fakeLlm(reading('other'), { text: REPLIES.en });
    expect(await ask(tamil, 'சந்தை வீழ்ச்சி அடைந்துள்ளது')).toMatchObject({ outcome: 'answer', language: 'other' });
    expect(systemPrompt(tamil)).toContain('Write in English');
    const marathi = fakeLlm(reading('other'), { text: REPLIES.en });
    expect(await ask(marathi, 'बाजार पडला आहे, SIP बंद करू का?')).toMatchObject({ outcome: 'answer', language: 'other' });
  });

  it.each([
    ['an English reply to Hinglish', 'Market crash ho gaya, band kar du?', 'hinglish', 'en'],
    ['a Hinglish reply to Hindi', 'बाज़ार गिर गया, SIP बंद कर दूँ?', 'hi', 'hinglish'],
    ['a Hindi reply to English', 'Markets are down', 'en', 'hi'],
    ['a Hinglish reply to English', 'Markets are down', 'en', 'hinglish'],
    ['a Hindi reply to Tamil', 'சந்தை வீழ்ச்சி அடைந்துள்ளது', 'other', 'hi'],
  ] as const)('stops %s, and shows facts only in the investor\'s language', async (_what, reason, said, replyIn) => {
    const r = await ask(fakeLlm(reading(said), { text: REPLIES[replyIn] }), reason);
    expect(r).toMatchObject({ outcome: 'fallback', checks: { in_language: false }, fallbackReason: { kind: 'checks', failed: ['in_language'] } });
    expect(r.text).toBe(cardText('fallback', r.language));
    // The quality-check line is in the investor's language and script, from fixed translations.
    expect(checkInCard(r).gate).toBe(NOT_IN_LANGUAGE[r.language]);
  });

  it('shows the fixed cards in the investor\'s language when the AI is unavailable', async () => {
    expect(await ask(null, 'बाज़ार गिर गया, SIP बंद कर दूँ?')).toMatchObject({ outcome: 'fallback', language: 'hi', text: cardText('fallback', 'hi') });
    expect(await ask(null, 'job chali gayi, paise chahiye')).toMatchObject({ outcome: 'fallback', language: 'hinglish', text: cardText('fallback', 'hinglish') });
    expect(await ask(null, 'I need the money')).toMatchObject({ outcome: 'fallback', language: 'en', text: cardText('fallback', 'en') });
    const down = await ask(fakeLlm(new LlmError('Groq did not answer within 10 s')), 'Market crash ho gaya, band kar du?');
    expect(down).toMatchObject({ outcome: 'fallback', language: 'hinglish' });
    expect(checkInCard(down).gate).toBe('Quality check: AI abhi uplabdh nahi hai → sirf facts dikha rahe hain');
  });
});
