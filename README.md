# Minds Mosaic forecast ledger

We forecast the answers to real public surveys with Minds Mosaic before the survey is in the field or before its result is released. Every forecast is hashed into an append-only ledger and timestamped in the Bitcoin blockchain with OpenTimestamps, so anyone can check that it existed before the deadline. While a survey is pending only the hashes are public. Once the publisher releases its result, every locked forecast is scored, misses included.

## Scorecard

Across 13 scored surveys and 77 questions, Minds Mosaic has a distribution error (TVD) of 0.034, against 0.036 for repeating the last published wave. Average miss per answer option: 1.37 percentage points (repeating the last wave: 1.42). Correlation between forecast and actual answer shares: 0.993. On the 4 surveys locked before fieldwork began (19 questions): 0.023 against 0.029.

Lower is better for TVD and miss. TVD is 0 for a perfect forecast and 1 for a completely wrong one. All figures are for the full surveyed population, on questions that also have a previous wave to compare with.

| Evidence type | Surveys | Questions | Minds Mosaic TVD | Last wave TVD | Minds Mosaic miss (pp) | Last wave miss (pp) |
|---|---:|---:|---:|---:|---:|---:|
| Attitude | 12 | 62 | 0.036 | 0.037 | 1.49 | 1.50 |
| Stated intent | 10 | 15 | 0.025 | 0.032 | 0.89 | 1.07 |
| Behaviour | not scored yet | | | | | |

Attitude: opinions and ratings. Stated intent: what people say they will do. Behaviour: what people actually do.

The pooled figures include 1 survey whose publisher does not allow its data to be republished. It is listed in `index.json` with forecast hashes and lock times only.

### By survey

| Survey | First lock | Released | Questions | Minds Mosaic TVD | Last wave TVD | Minds Mosaic miss (pp) | Last wave miss (pp) |
|---|---|---|---:|---:|---:|---:|---:|
| The Economist/YouGov Poll (weekly, US registered voters) | 2026-10-23 21:34 UTC | 2026-10-29 15:54 UTC | 54 | 0.045 | 0.061 | 1.75 | 2.27 |
| YouGov GB weekly trackers (government approval, most important issues, Westminster voting intention) | 2026-10-23 21:53 UTC | 2026-10-27 18:52 UTC | 30 | 0.037 | 0.037 | 2.76 | 2.75 |
| Emerson College Polling national poll (US likely voters) | 2026-10-24 01:48 UTC | 2026-10-30 12:58 UTC | 2 | 0.022 | 0.016 | 1.43 | 1.09 |
| NPR/PBS News/Marist Poll (national, US registered voters) | 2026-10-24 01:47 UTC | 2026-10-26 10:00 UTC | 2 | 0.025 | 0.025 | 1.02 | 1.05 |
| Reuters/Ipsos poll (national, US adults, Ipsos KnowledgePanel) | 2026-10-24 01:46 UTC | 2026-10-26 20:56 UTC | 1 | 0.010 | 0.010 | 0.40 | 0.40 |
| Find Out Now weekly GB Westminster voting intention | 2026-10-24 01:52 UTC | 2026-10-30 13:46 UTC | 2 | 0.020 | 0.020 | 0.58 | 0.58 |
| Opinium / The Observer political poll (Westminster voting intention and leader approval) | 2026-10-25 00:55 UTC | 2026-10-31 14:04 UTC | 2 | 0.024 | 0.022 | 0.71 | 0.67 |
| European Commission Joint Harmonised Consumer Survey, France (INSEE monthly household survey CAMME), monthly questions Q1-Q8, Q11, Q12, October 2026 | 2026-10-26 10:14 UTC | 2026-10-29 10:00 UTC | 10 | 0.064 | 0.067 | 2.28 | 2.37 |
| European Commission Joint Harmonised Consumer Survey, Austria (fieldwork Ipsos, CCB Consumer Confidence Barometer), monthly questions Q1-Q9, Q11, Q12, October 2026 | 2026-10-27 01:27 UTC | 2026-10-29 10:00 UTC | 11 | 0.046 | 0.049 | 1.62 | 1.72 |
| European Commission Joint Harmonised Consumer Survey, Germany (fieldwork NIQ/GfK eBUS), monthly questions Q1-Q9, Q11, Q12, October 2026 | 2026-10-27 01:08 UTC | 2026-10-29 10:00 UTC | 11 | 0.024 | 0.025 | 0.83 | 0.87 |
| European Commission Joint Harmonised Consumer Survey, Spain (fieldwork NIQ/GfK eBUS), monthly questions Q1-Q9, Q11, Q12, October 2026 | 2026-10-27 01:17 UTC | 2026-10-29 10:00 UTC | 11 | 0.040 | 0.035 | 1.41 | 1.25 |
| Cabinet Office ESRI 消費動向調査 (Consumer Confidence Survey, monthly): consumer-attitude components and one-year price outlook, two-or-more-person households | 2026-10-27 01:37 UTC | 2026-10-29 05:00 UTC | 5 | 0.013 | 0.014 | 0.49 | 0.53 |

Per survey, questions include audience subgroups where the publisher reports them.

## Additional research forecasts

Alongside Minds Mosaic we lock additional research forecasts for the same surveys. They are pre-registered and timestamped the same way and stay in the record whatever their score. They are listed under their ledger tag.

| Ledger tag | Forecasts locked | Surveys scored | Questions | TVD | Last wave TVD | Miss (pp) | Last wave miss (pp) |
|---|---:|---:|---:|---:|---:|---:|---:|
| `pure` | 547 | 13 | 77 | 0.086 | 0.036 | 3.47 | 1.42 |
| `cellsS` | 237 | 0 | | | | | |
| `cellsH` | 237 | 0 | | | | | |
| `memory3` | 452 | 11 | 62 | 0.093 | 0.037 | 3.44 | 1.40 |
| `blend` | 51 | 4 | 38 | 0.052 | 0.034 | 1.87 | 1.18 |

## Status

As of 2026-11-01 16:24 UTC: 48 surveys, 2070 forecasts in 161 timestamped batches. 13 scored, 35 pending, 0 not scoreable. 546 of the forecasts are Minds Mosaic; the rest are additional research forecasts.

## Files

- [`index.json`](index.json): every locked survey with status, lock times, hashes, Bitcoin blocks and file paths. Start here.
- `forecasts/<survey>/<tag>.json`: the locked forecasts. Pending surveys list hashes and lock times only.
- `results/<survey>.json`: release date, source and scores. Released numbers appear only where the publisher allows it.
- `proofs/`: the hash chain (`index.jsonl`), batch manifests and their OpenTimestamps proofs.
- [`verify.py`](verify.py): checks all of it with plain Python 3.

## How to verify

```
git clone https://github.com/minds-ai-co/forecast-ledger.git && cd forecast-ledger
python3 verify.py            # hash chain, Merkle roots, timestamp proofs, index.json
python3 verify.py --online   # also checks each proof against the Bitcoin block header
```

A forecast counts only if its Bitcoin timestamp is before the deadline (`cutoff_utc` in `index.json`). The official OpenTimestamps client works too: `ots info proofs/batches/<batch>.json.ots`.

Ledger chain head `f35435ffdbead8212412545eaa2c553b006b3be5717bd6a4791dc61ae1dd8c7c`.
