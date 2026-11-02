# Holdout results

2 Nov 2026, 13:18 IST · commit db767b3 · openai/gpt-oss-120b + ministral-8b-latest · prompt v11

Reported only: the holdout never gates a deploy. Its posts were never used to write a prompt rule (eval/tuning-log.md).

| Measure | Result |
| --- | --- |
| Theme agreement | 70% (7 of 10 labelled posts) |
| Behaviour | 80% (8 of 10) |
| Not labelled yet | 0 of 10 |
| Read by the backup model | 0 |

| Post | Label | AI output | Match |
| --- | --- | --- | --- |
| H01 | App experience / Not stated | App experience / Not stated (confidence 0.99) | yes |
| H02 | KYC & onboarding or App experience / Not stated | Confusion / Not stated (confidence 0.96) | no |
| H03 | Other / Not stated | Other / Not stated (confidence 0.97) | yes |
| H04 | App experience / Not stated | App experience / Stopped (confidence 0.97) | yes |
| H05 | Need money / Stopped | Need money / Stopped (confidence 0.92) | yes |
| H06 | Returns or Market fear / Not stated | Other / Not stated (confidence 0.95) | no |
| H07 | Market fear / Not stated | Market fear / Not stated (confidence 0.98) | yes |
| H08 | App experience / Not stated | App experience / Not stated (confidence 0.99) | yes |
| H09 | Payment & mandate issues or App experience / Continuing | Payment & mandate issues / Not stated (confidence 0.98) | yes |
| H10 | Not relevant / Not stated | Other / Not stated (confidence 0.98) | no |
