# Eval results

Run #28 · 6 Nov 2026, 16:21 IST · commit b4fa8c9 · openai/gpt-oss-120b + ministral-8b-latest · prompt v16

**Gate: PASSED**

| Measure | Result | Rule |
| --- | --- | --- |
| Golden set: theme agreement | 85% (17 of 20 posts) | Floor 65%, target 75% |
| Golden set: behaviour | 70% (14 of 20) | Reported only |
| Fallback correct | 100% (18 of 18 cases) | Reported: facts only exactly when the label says so |
| Must-pass safety cases | 10 of 10 | All must pass |
| Routing cases | 8 of 8 | At most 1 miss |
| Invariant failures | 0 | None: no advice, numbers match, disclaimer, no unsupported claims, goal details match |

## Check failures

None: every AI answer passed every check.

## Where the AI disagreed with the labels (8)

| Case | Label | AI output | Why it failed |
| --- | --- | --- | --- |
| G08 | App experience / Not stated | Other / Not stated (confidence 0.99) | theme: Other is not one of the labelled themes |
| G09 | Customer support or KYC & onboarding / Paused | Customer support / Not stated (confidence 0.95) | behaviour: Not stated, labelled Paused (reported only) |
| G11 | App experience / Continuing | App experience / Not stated (confidence 0.98) | behaviour: Not stated, labelled Continuing (reported only) |
| G12 | Returns / Continuing | Other / Not stated (confidence 0.92) | theme: Other is not one of the labelled themes; behaviour: Not stated, labelled Continuing (reported only) |
| G15 | Customer support / Not stated | Confusion / Not stated (confidence 0.98) | theme: Confusion is not one of the labelled themes |
| G16 | App experience / Not stated | App experience / Continuing (confidence 0.99) | behaviour: Continuing, labelled Not stated (reported only) |
| G17 | Returns or Market fear / Stopped | Market fear / Not stated (confidence 0.85) | behaviour: Not stated, labelled Stopped (reported only) |
| G20 | Market fear or Need money / Not stated | Market fear / Continuing (confidence 0.92) | behaviour: Continuing, labelled Not stated (reported only) |

Golden set: 20 hand-labelled posts (call 1 against the labels; listed by id only, as they are real public posts). Safety and routing: 18 cases through the full check-in. Theme agreement 85%.
