# Groww SIP Discovery Engine (n8n)

An n8n workflow that reads what people say about SIPs and first-time investing in India, tags every post with AI, and turns it into ranked opportunities in one Google Sheet. It was built to find out why first-time investors stop, pause or reduce their SIPs within 12 months.

**This copy has no keys or logins in it.** Whoever runs it adds their own.

- Results of our runs (view only): [Groww SIP Discovery Engine output sheet](https://docs.google.com/spreadsheets/d/1VD7EOA0AXQabFV16wWBP1cSEcLFAfxh4Vy__kRR1LqY/edit?usp=sharing)
- How we checked the AI: [AI Evidence Log](https://docs.google.com/document/d/1NPO-nWk6mJmmPEJcGYcKQFoYlIUjjMRZbAKlzBms1z4/edit?usp=sharing)

## What it does

```
Manual Trigger → Your keys → Settings → Check sheet
  1 Research & Collect
    Research Agent (Gemini) plans the searches
    YouTube comments · YouTube transcripts (spoken, Hindi) · Play Store · App Store
    TradingQ&A · Google Search · Quora · Trustpilot
    → Standardise → Remove duplicates → Validate → Save raw data
  2 Analyze & Discover
    Clean & keep SIP-related posts → AI Tagging Agent (Gemini)
    → Group by theme → Count unique posts → Generate insights (Gemini)
    → Check every quote against its post → Score and rank opportunities
    → Save Summary, Opportunities and Evidence Log
```

For each post the AI records: up to 3 of 13 themes, the writer's behaviour (Started, Continuing, Paused, Reduced, Stopped, Not stated), an answer to each of the 9 research questions where the post has one, the user segment if stated, and a word-for-word evidence quote. Code, not the AI, does the counting, scoring and quote checks.

Opportunities are scored out of 25: frequency, severity, evidence strength, addressability and uncertainty (1-5 each).

## Test it in 5 steps

1. **Import.** In n8n (an n8n Cloud trial, or free on your own computer with `npx n8n`), open a new workflow, click **⋯ → Import from URL** and paste:
   `https://raw.githubusercontent.com/aalpha00007-ui/GROWW_SIP/main/discovery-engine/groww-sip-discovery-engine.json`
   (or download [`groww-sip-discovery-engine.json`](groww-sip-discovery-engine.json) and use **Import from File**).
2. **Make the sheet.** [Make a copy of the blank sheet](https://docs.google.com/spreadsheets/d/1Ns-SazeZCkcQyXDN2wnLnuvii4FPkjJG64V178odgTM/copy). It has the 6 tabs with their headers in row 1. Copy its link.
3. **Your keys node.** Replace each `PASTE_...` value: the sheet link, a [SerpApi](https://serpapi.com) key (Play Store reviews, Google Search and video transcripts), a [YouTube Data API v3](https://console.cloud.google.com/apis/library/youtube.googleapis.com) key, and an [Apify](https://console.apify.com/settings/integrations) token (Quora and Trustpilot).
4. **Logins.** Open one of the three **Gemini Model** nodes and add a Google Gemini API credential ([key from Google AI Studio](https://aistudio.google.com/apikey)); pick it in all three. Open any **Google Sheets** node and sign in with Google; pick that login in every Sheets node.
5. **Run.** Click **Execute workflow**. Results appear in the sheet's tabs: 1 Summary, 2 Feedback Analysis, 3 Opportunities, 4 AI Evidence Log, 5 Raw Data, 6 Voice Data.

**For a quick, cheap test,** lower these in the **Settings** node first: `target_relevant_posts` 50, `youtube_max_videos` 3, `youtube_max_comments_per_video` 20, `youtube_transcript_videos` 1, `play_store_pages` 1, `app_store_pages` 1, `tradingqna_max_queries` 2, `google_max_queries` 1, `quora_max_queries` 1, `trustpilot_max_reviews` 20.

To study another app, change `app_name`, `play_store_app_id`, `app_store_app_id` and `trustpilot_domain` in **Settings**.

## Our runs (26 Oct 2026)

| | |
| --- | --- |
| Unique posts saved | 2,759 (2,720 written + 39 spoken clips) |
| SIP-related posts analysed | 423 (target was 1,000; the rest were short, duplicates or not about SIPs) |
| Sources that worked | 7 of 8 (Trustpilot requests failed) |
| Engine vs 20 hand-labelled posts | theme and behaviour both match on 12 of 20; at least one theme shared on 18 of 20 |

Before sharing your own copy, clear your keys from **Your keys**.
