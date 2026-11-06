# Tuning log: how the golden-set score was tuned, and the holdout set

The golden set (`data/eval/golden_set/golden_set.csv`, 20 hand-labelled posts) is what the eval gate scores. Some
prompt rules were written after seeing which golden posts the AI missed, so the golden score is partly tuned to
those 20 posts. This log records exactly what was tuned, and sets up a holdout set that was never used for tuning,
so the evidence log can show an honest score next to the tuned one.

Only call 1 (reading the reason) is scored on the golden set. Changes to call 2 (writing the answer) don't move
this score.

## Score before and after the rules of 1 Nov 2026

| Run | Date | Reading prompt | Theme agreement | Misses |
| --- | --- | --- | --- | --- |
| #22 (local) | 1 Nov 2026, 13:26 IST | v9 (no new rules; the reading prompt was the same as v8's) | **60%** (12 of 20) | G07, G08, G11, G12, G13, G14, G15, G18 |
| #23 (CI, commit ca053d8) | 1 Nov 2026, 13:50 IST | v10 (the two rules below) | **90%** (18 of 20) | G08, G15 |

For context, earlier runs of the reading prompt before these rules scored 65-80% on identical runs (PRD §7), so
#22's 60% was a low draw, and part of the jump is run-to-run variation.

## The rules added (prompt v10, reading prompt only)

Both were added on 1 Nov 2026 after reading the misses in run #22, in `UNDERSTAND_SYSTEM`
(`src/pipeline/retrieval/prompts.ts`).

| # | Rule, as written | Golden posts that led to it | What those posts are | #22 (before) | #23 (after) |
| --- | --- | --- | --- | --- | --- |
| 1 | Text that walks through the steps in the app, such as a tutorial or a video's script, in any language, is "App experience", even when the steps are for stopping or pausing a SIP. "Confusion" is only for a writer who does not understand something or asks how it works. | **G11**, **G18** | Hindi YouTube transcripts showing how to cancel or pause a SIP in the app | Both read as Confusion | Both App experience (match) |
| 2 | An article, headline or comment about market falls or crashes and what SIP investors do in them is "Market fear", even when it is general advice rather than the writer's own worry. It is never "Not relevant" or "Other". | **G07**, **G14** | Google Search results: articles on stopping a SIP in a market crash | G07 Not relevant, G14 Other | Both Market fear (match) |

Of the 6 posts gained between #22 and #23:

- 4 (G07, G11, G14, G18) are the posts the rules were written for.
- 2 (G12, G13) were not targeted by any rule. G12 (fund performance praise, labelled Returns) has nothing to do with
  either rule, so it is most likely run-to-run variation. G13 (a comment saying the stock market is manipulated,
  labelled Market fear) is close to rule 2's wording, so rule 2 may have helped it.

**A fairer reading:** leaving out the 4 targeted posts, the AI agreed on 12 of the other 16 (75%) in #22 and 14 of 16
(88%) in #23. The holdout set below is the clean test.

## Earlier tuning, before 1 Nov 2026

This is not only the 1 Nov rules. The first committed reading prompt (commit 0d96f1f, 28 Oct 2026) was already
written while measuring on the golden set: architecture decision D4 records "5 prompt versions" of `ministral-8b`
scored on it before `gpt-oss-120b` was chosen. The post-to-rule links from that period were not logged, but some
theme definitions match golden posts closely:

- "App experience: ... or a guide or video showing the steps for doing something in it (a guide explains; it is not
  'Confusion')" fits G04, G11 and G18 (YouTube transcripts).
- "Other: ... such as a general opinion of SIPs, or a goal they have already reached" fits general-opinion posts
  in the set.

So the 65-80% range before 1 Nov is also partly tuned. Only the holdout set gives an untuned number.

## Other changes on 1 Nov 2026 that did not come from the golden set

| Change | Came from | Affects the golden score? |
| --- | --- | --- |
| Prompt v9: an answer keeps each number's unit | Live runs ("Markets are down": "-20.7%" written as "Rs 20,700") | No (call 2) |
| Numbers check: "the Rs 2,000 instalment" is an amount, not a count | Live runs | No (call 2 check) |
| Prompt v11: the writer uses placeholders and never writes a number | The owner's brief | No (call 2) |

## 2 Nov 2026: prompt v12, after eval run #24 (writer only; the reading prompt is unchanged)

Run #24 (prompt v11) failed the gate on the answers, not the reading: golden 80%, but must-pass 9 of 10 (s18) and
routing 5 of 8 (s01, s14, s16). s01, s16 and s18 were 104, 121 and 93 words once the placeholders were filled in,
so they fell back. So these changes came from the safety cases' failures. They change call 2 only, so they can't
move the golden or holdout score. The holdout was run once on 2 Nov (70%, `eval/holdout-results.md`), before
this, and the reading rules have not changed since.

| Change | Came from | Affects the golden score? |
| --- | --- | --- |
| One second draft when a draft is too long filled in, writes a number, or compares two numbers; never for advice or a claim | Run #24: s01, s16, s18 too long | No (call 2) |
| A comparison between two placeholders ("larger than") fails "Numbers match your SIP" | Run #24: s16 said -20.7% "is larger than" -21.0% | No (call 2 check) |
| Filling in drops words repeated at a placeholder's edge, and "a" after "your"/"the" | Run #24: "instalments instalments", "an exit load of an exit load of", "Your a value" | No (call 2) |
| Shorter phrases for the fund's biggest fall and units per instalment | The dip answer could not fit 90 words with them | No (call 2) |

Run #25 (prompt v12) then passed must-pass 10 of 10 with 0 invariant failures and golden 80%, but missed routing
(6 of 8: s14, and s01, whose second draft was 91 words). Prompt v13 changes one thing: a second draft for length
aims at 75 words ("about a third shorter"), not just under 90 ("a little too long" was all s01 was told). The
90-word limit and every check are unchanged.

Run #26 (prompt v13) missed the same way: golden 80%, behaviour 85%, must-pass 10 of 10, 0 invariant failures,
routing 6 of 8 (s14, and s01 again: its second draft was 98 words). s01 is the Hinglish doubt answer written by
Groq; in runs #24-#26 it used 7 or 8 placeholders, including two the doubt guidance never asked for, and wrote
words that said a placeholder's meaning again ("..., SIP shuru hone ke baad sabse badi aapke SIP ka sabse bada
girav hai"). Prompt v14, the last writer change before the next run is reported as it comes:

| Change | Came from | Affects the golden score? |
| --- | --- | --- |
| The doubt route's guidance names its placeholders (the six it always meant) and says to use no others and not to say a placeholder's meaning again, as the dip guidance does | Runs #24-#26: s01 | No (call 2) |
| Shorter Hinglish and Hindi phrases for the worst fall and the fund's biggest fall (10 and 13 words to 8 and 11) | Runs #24-#26: s01 | No (call 2) |

## 6 Nov 2026: what changed after the holdout results were first seen, and is it still fresh?

The holdout was first run on 2 Nov 2026 at 13:18 IST (commit db767b3, prompt v11: 70%, 7 of 10). Its misses were read
then: H02, H06 and H10. This is everything that changed after that moment.

| Prompt | Date | What changed | Which call | Could it move a holdout score? |
| --- | --- | --- | --- | --- |
| v12 | 2 Nov | One second draft; comparisons fail; doubled words dropped | Writer | No |
| v13 | 2 Nov | A second draft for length aims lower | Writer | No |
| v14 | 2 Nov | Doubt guidance names its placeholders; shorter Hinglish and Hindi phrases | Writer | No |
| v15 | 3 Nov | "On track" claims fail; a value drops words the model already said; Groq writes if Mistral fails | Writer and checks | No |
| **v16** | **6 Nov** | **The reading prompt gains a `goal_completed` field**, plus writer and check changes (below) | **Reader and writer** | **Yes** |

**How this was checked, not assumed:** the reading prompt (`UNDERSTAND_SYSTEM` in
`src/pipeline/retrieval/prompts.ts`) hashes the same at commits db767b3, 73e1a0f and 4760c8e, and in the v15 work. So
v12 to v15 did not touch what the holdout measures, and the holdout score of 70% stood for them.

**v16 is different.** It adds one key to the reading prompt, because of the QA review and case s14 (a reached goal
read as a cash shortage), not because of a holdout miss. It has no rule about themes, and H02, H06 and H10 played no
part in it. The facts the reader sees changed too: "Scheduled skips", and new planned counts.

But the rule in this log is plain: a prompt changed after a holdout result has been seen is no longer tested on an
unseen set. **So the holdout is no longer fully fresh.** It was seen on v11, and the reading prompt then changed. It
stays useful as a check on posts no rule was written for, and the owner asked for it to be run once more on v16.
That run is a second look at known posts, not a clean measurement, and /quality says so.

**Open:** a fully fresh score needs new posts, picked the same way as below and labelled by the owner. The owner's
labels are not edited here, so this is left to the owner.

Other v16 changes, none of which can move a reading score: `goal_facts` must-pass check; claim patterns for a floor, a
recovery and an expected return; the disclaimer once in the reply's language; natural Hindi and Hinglish phrases;
a question before answering unmet expectations.

## The holdout set: `eval/holdout-set.json`

Ten real posts from the same collected data as the golden set, never used for any rule. The fields are the golden
set's own (`id, source, text, engine_theme, engine_behaviour, human_theme, human_behaviour`). The engine's own
guesses are left blank: they would be a suggested label.

**Who labelled them:** the labels (`human_theme`, `human_behaviour`) were **drafted by Claude and reviewed by the
owner** on 1 Nov 2026, then entered as given. They were not written blind by hand first, as the golden set's were,
so where the drafting model and the model under test lean the same way, the holdout may agree a little more than
fully hand-written labels would. The labels were entered before the holdout was ever run. No theme rule was changed
because of a holdout miss, but the reading prompt did change after the results were first seen: see the section
above.

| Post | Theme(s) | Behaviour |
| --- | --- | --- |
| H01 | App experience | Not stated |
| H02 | KYC & onboarding, App experience | Not stated |
| H03 | Other | Not stated |
| H04 | App experience | Not stated |
| H05 | Need money | Stopped |
| H06 | Returns, Market fear | Not stated |
| H07 | Market fear | Not stated |
| H08 | App experience | Not stated |
| H09 | Payment & mandate issues, App experience | Continuing |
| H10 | Not relevant | Not stated |

**Where they come from:** the Google Sheet "Groww SIP Discovery Engine (1000-post run)", the same Evidence Log run as
the golden set (`run_2026-10-26T15-35-36`). Written posts are from the "2 Feedback Analysis" tab (the posts the
engine analysed, text from "Post (cleaned)", the column the golden set's G01 matches word for word). The
transcript is from the "6 Voice Data" tab ("Transcript Clip", the column G11 matches).

**How they were picked (a fixed rule, not by hand):**

1. Same kinds as the golden set: the golden set has about 3 posts per source, so the holdout takes about half that
   per source. App Store 2, Play Store 2, YouTube comments 2, YouTube transcripts 1, TradingQ&A 1, Quora 1, Google
   Search 1.
2. Left out of the candidates: the 20 golden posts of this run, and the 20 golden-set candidates of the next run
   (`run_2026-10-26T16-22-56`), so nothing that was ever a golden post is in it.
3. Within each source, posts are taken evenly spaced in the sheet's own order: with *n* candidates and *q* to take,
   positions ⌊(i + ½) × n / q⌋ for i = 0 … q−1. For transcripts, the candidates are the first clip of each video
   that has a transcript in this run (9 videos once the golden ones are left out).
4. None of these posts was read while writing any rule. Two of them are the same kinds as posts that led to the
   rules (H04 is a Hindi app walkthrough like G11 and G18; H07 is a market-correction article like G07 and G14).
   That's deliberate: it tests whether the rules work on posts they weren't written for.

| Holdout id | Source | Post ID in the sheet | Sheet and row |
| --- | --- | --- | --- |
| H01 | App Store | as_14520139245 | 2 Feedback Analysis, row 9 |
| H02 | Play Store | gp_aa0ed8b4-ffd8-4182-9915-f553531a6d3a | 2 Feedback Analysis, row 35 |
| H03 | YouTube | yt_c_Ugyd40g_mQ13CacW53N4AaABAg | 2 Feedback Analysis, row 105 |
| H04 | YouTube Transcripts | yt_t_K74TyPvcYtA_0 | 6 Voice Data, row 17 |
| H05 | TradingQ&A | tq_544228 | 2 Feedback Analysis, row 282 |
| H06 | Quora | qa_1477743904469660 | 2 Feedback Analysis, row 291 (the only Quora post left) |
| H07 | Google Search | g_oqn8ta | 2 Feedback Analysis, row 320 |
| H08 | App Store | as_14504433694 | 2 Feedback Analysis, row 22 |
| H09 | Play Store | gp_b94b83bb-16e9-4b69-b9a5-c6ad6b52874b | 2 Feedback Analysis, row 46 |
| H10 | YouTube | yt_c_Ugx3XTrFYvTfHGrZfUN4AaABAg | 2 Feedback Analysis, row 203 |

**To use it:**

1. The labels are in (see above). A post added later gets `human_theme` (one to three of the 13 themes,
   comma-separated, as in the golden set) and `human_behaviour` (one of Started, Continuing, Paused, Reduced,
   Stopped, Not stated) before any AI output is seen.
2. Run `npm run eval -- --set holdout`. It reads only the labelled posts (call 1, about 1,400 Groq tokens each)
   and writes `eval/holdout-results.json` and `.md`. Commit them; /quality shows the score next to the golden set's.
3. Don't change a prompt rule because of a holdout miss. If one is changed anyway, the holdout is no longer a
   holdout: record it here and pick new posts the same way.
