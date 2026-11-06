# Holdout results

6 Nov 2026, 16:23 IST · commit b4fa8c9 · openai/gpt-oss-120b + ministral-8b-latest · prompt v16

Reported only: the holdout never gates a deploy. Its posts were never used to write a prompt rule, but its results were first seen on prompt v11 and the reading prompt changed in v16, so it is no longer fully fresh (eval/tuning-log.md).

| Measure | Result |
| --- | --- |
| Theme agreement | 60% (6 of 10 labelled posts) |
| Behaviour | 70% (7 of 10) |
| Not labelled yet | 0 of 10 |
| Read by the backup model | 0 |

| Post | Label | AI output | Match |
| --- | --- | --- | --- |
| H01 | App experience / Not stated | App experience / Not stated (confidence 0.99) | yes |
| H02 | KYC & onboarding or App experience / Not stated | Confusion / Not stated (confidence 0.97) | no |
| H03 | Other / Not stated | Not relevant / Not stated (confidence 0.2) | no |
| H04 | App experience / Not stated | App experience / Stopped (confidence 0.97) | yes |
| H05 | Need money / Stopped | Other / Not stated (confidence 0.92) | no |
| H06 | Returns or Market fear / Not stated | Other / Not stated (confidence 0.9) | no |
| H07 | Market fear / Not stated | Market fear / Not stated (confidence 0.98) | yes |
| H08 | App experience / Not stated | App experience / Not stated (confidence 0.99) | yes |
| H09 | Payment & mandate issues or App experience / Continuing | Payment & mandate issues / Not stated (confidence 0.97) | yes |
| H10 | Not relevant / Not stated | Not relevant / Not stated (confidence 0.9) | yes |
