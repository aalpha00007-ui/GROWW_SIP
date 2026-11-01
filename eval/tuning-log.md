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

## The holdout set: `eval/holdout-set.json`

Ten real posts from the same collected data as the golden set, never used for any rule, with every label left
blank for the owner to fill in by hand. The fields are the golden set's own (`id, source, text, engine_theme,
engine_behaviour, human_theme, human_behaviour`). The engine's own guesses are left blank too: they would be a
suggested label.

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

1. Fill in `human_theme` (one to three of the 13 themes, comma-separated, as in the golden set) and
   `human_behaviour` (one of Started, Continuing, Paused, Reduced, Stopped, Not stated) for each post, by hand,
   before looking at any AI output.
2. Run `npm run eval -- --set holdout`. It reads only the labelled posts (call 1, about 1,400 Groq tokens each)
   and writes `eval/holdout-results.json` and `.md`. Commit them; /quality shows the score next to the golden set's.
3. Don't change a prompt rule because of a holdout miss. If one is changed anyway, the holdout is no longer a
   holdout: record it here and pick new posts the same way.
