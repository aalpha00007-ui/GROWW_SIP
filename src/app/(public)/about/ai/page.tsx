// How the AI works: only what the code does. The models, texts and limits on this page are read from the
// pipeline's own constants and from the same settings the check-in uses (server/api.ts checkInDeps), so the page
// cannot drift from the code.
import type { Metadata } from 'next';
import Link from 'next/link';
import { groqFromEnv, mistralFromEnv } from '@/llm/chat';
import { DECLINED_TEXT, FALLBACK_TEXT, OFFICIAL_LINKS, OPTIONS } from '@/pipeline/retrieval/checkin';
import { MIN_CONFIDENCE } from '@/pipeline/retrieval/decide';
import { DISCLAIMER, MAX_WORDS } from '@/pipeline/retrieval/prompts';

export const metadata: Metadata = { title: 'How the AI works · Groww prototype' };

const H2 = 'text-xl font-bold';
const LIST = 'mt-3 list-disc space-y-2 pl-5';

export default function HowTheAiWorks() {
  const reader = groqFromEnv()?.model ?? null;
  const writer = mistralFromEnv()?.model ?? null;
  const stop = OPTIONS.find((o) => o.key === 'cancel')!.label;

  return (
    <article className="mx-auto max-w-3xl space-y-8 text-ink">
      <header>
        <h1 className="text-3xl font-bold">How the AI works</h1>
        <p className="mt-2 text-lg text-muted">
          The AI appears in two places, both on one of your SIPs: <b>Before you stop</b>, when you tap Stop and say why, and{' '}
          <b>What does this dip mean for my goal?</b>, on a SIP after a market fall. Everything else in the prototype is plain code.
        </p>
      </header>

      <section>
        <h2 className={H2}>Which models</h2>
        {writer ? (
          <ul className={LIST}>
            <li>
              <b>Reading your reason:</b> {reader ? <code>{reader}</code> : <code>{writer}</code>}
              {reader ? (
                <>
                  {' '}
                  on Groq. If Groq fails or is out of free requests, <code>{writer}</code> on Mistral reads it instead.
                </>
              ) : (
                ' on Mistral.'
              )}
            </li>
            <li>
              <b>Writing the answer:</b> <code>{writer}</code> on Mistral.
            </li>
            <li>Both are called from our server only; the keys never reach your browser. Every answer is saved with the names of the models that made it.</li>
          </ul>
        ) : (
          <p className="mt-3">No AI model is set up on this server, so every check-in shows the safe fallback described below.</p>
        )}
      </section>

      <section>
        <h2 className={H2}>What the AI gets</h2>
        <ul className={LIST}>
          <li>
            <b>Your SIP&apos;s own numbers, worked out by code:</b> the fund&apos;s name and category, the instalment, months invested, instalments paid
            and skipped, what you&apos;ve put in, its value today and the change, the worst fall since it started, the next instalment date, and the
            SIP&apos;s goal with the time to go, or that no goal is set.
          </li>
          <li>
            <b>At Before you stop, the reason you typed.</b> First, code checks it for an email, phone number, PAN, Aadhaar, OTP or account number.
            If it finds one, nothing is sent and you&apos;re asked to say it in your own words.
          </li>
          <li>
            <b>For some answers, short fixed explainers</b> on what stopping, skipping, pausing and lowering the amount do.
          </li>
          <li>Nothing else: not your name, username or PIN, and not your other SIPs.</li>
        </ul>
      </section>

      <section>
        <h2 className={H2}>How an answer is checked before you see it</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5">
          <li>
            The first model reads your reason and fills in a fixed form: what it&apos;s about, whether you asked for advice, your language, how sure it is,
            and a short summary. A reply that doesn&apos;t fit the form gets one retry.
          </li>
          <li>
            Code, not the AI, decides what happens next. If you asked which fund to buy, sell or switch, or for a return prediction, you get a fixed
            reply instead of an AI answer. If the model is less than {Math.round(MIN_CONFIDENCE * 100)}% sure, you get the safe fallback.
          </li>
          <li>
            The second model writes a short reply, at most {MAX_WORDS} words, in English, Hindi or Hinglish, using only the numbers it was given.
          </li>
          <li>
            Code checks the reply four ways: no advice words (such as &ldquo;recommend&rdquo; or &ldquo;you should sell&rdquo;); every rupee amount,
            percentage and count of months or years matches the numbers it was given; it ends with &ldquo;{DISCLAIMER}&rdquo;; and it is {MAX_WORDS} words
            or fewer.
          </li>
        </ol>
        <p className="mt-3">For &ldquo;What does this dip mean for my goal?&rdquo; there is no reason to read, so it starts at step 3.</p>
      </section>

      <section>
        <h2 className={H2}>When it won&apos;t answer</h2>
        <ul className={LIST}>
          <li>
            <b>Asked for advice:</b> &ldquo;{DECLINED_TEXT}&rdquo;
          </li>
          <li>
            <b>The safe fallback,</b> when a check fails, the model is unsure, doesn&apos;t answer in time or returns an error: &ldquo;{FALLBACK_TEXT}&rdquo;,
            shown with your SIP&apos;s numbers and links to the {OFFICIAL_LINKS.map((l) => l.label).join(' and ')}.
          </li>
        </ul>
      </section>

      <section>
        <h2 className={H2}>What it never does</h2>
        <ul className={LIST}>
          <li>
            It never tells you to buy, sell, switch, stop or keep a SIP, and never names a fund to pick. Its instructions forbid it, and the advice check
            turns any reply with advice words into the safe fallback.
          </li>
          <li>
            The choice stays yours. Every card offers {OPTIONS.map((o) => o.label).join(', ')}, and {stop} is always one tap.
          </li>
        </ul>
      </section>

      <section>
        <h2 className={H2}>What is saved, and how it&apos;s tested</h2>
        <ul className={LIST}>
          <li>
            Each check-in is saved with your demo account: your reason, what the AI understood, the reply, the check results and what you chose next.
            Deleting your demo account deletes them.
          </li>
          <li>
            A fixed test set (sample reasons with known answers, safety cases and routing cases) checks the AI when its code or data change. The
            latest result, and live counts of answers, fallbacks and declines, are on the{' '}
            <Link href="/quality" className="font-semibold text-primary underline underline-offset-2">
              Quality page
            </Link>
            .
          </li>
        </ul>
      </section>
    </article>
  );
}
