#!/usr/bin/env python3
"""Build deterministic point-in-time *research features* from exported observations.

This is not a forecast, does not fit a model, and excludes candidate ID mappings by default.
Usage: python forecasting/build_snapshot.py tools/signal-observations.jsonl 2026-10-11 output.csv
"""
import argparse
import csv
import datetime as dt
import json
from collections import defaultdict
from pathlib import Path


def asof_epoch(day):
    parsed = dt.date.fromisoformat(day)
    end = dt.datetime.combine(parsed + dt.timedelta(days=1), dt.time(), dt.timezone.utc)
    return int(end.timestamp()) - 1


def build_features(records, cutoff, *, allow_candidates=False):
    """Enforce no look-ahead: never use later-observed OR later-collected information."""
    grouped = defaultdict(list)
    for row in records:
        if row.get("collection_status") != "observed":
            continue
        # Listing mappings can point at alternate editions or misidentified apps.
        # Skip unverified listing identities in research unless explicitly overridden.
        scope = row.get("scope", "listing")
        if scope == "listing" and row.get("match_status") != "verified" and not allow_candidates:
            continue
        if scope not in ("listing", "game"):
            continue
        if not (int(row["observed_at"]) <= cutoff and int(row["collected_at"]) <= cutoff):
            continue
        value = row.get("value")
        if value is None or float(value) < 0:
            continue
        identity = row.get("identity_key") or (f'listing:{row["mapping_id"]}' if row.get("mapping_id") is not None else f'game:{row["game_id"]}')
        key = (int(row["game_id"]), str(identity), str(row["source_id"]), str(row["metric"]))
        grouped[key].append((int(row["observed_at"]), float(value)))
    results = []
    for (game_id, identity_key, source, metric), samples in sorted(grouped.items()):
        samples.sort()
        latest = samples[-1]
        last7 = [v for t, v in samples if cutoff - 7 * 86400 < t <= cutoff]
        last30 = [v for t, v in samples if cutoff - 30 * 86400 < t <= cutoff]
        results.append({"game_id": game_id, "identity_key": identity_key, "source_id": source,
                        "metric": metric, "as_of": cutoff, "latest_observed_at": latest[0],
                        "latest_value": latest[1], "samples_7d": len(last7),
                        "sampled_max_7d": max(last7) if last7 else "",
                        "samples_30d": len(last30),
                        "sampled_max_30d": max(last30) if last30 else ""})
    return results


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('input_jsonl', type=Path)
    parser.add_argument('as_of_day', help='YYYY-MM-DD UTC; features include only data available by end of day')
    parser.add_argument('output_csv', type=Path)
    parser.add_argument('--allow-candidates', action='store_true',
                        help='research ONLY; candidate mappings are unverified identities')
    args = parser.parse_args()
    cutoff = asof_epoch(args.as_of_day)
    with args.input_jsonl.open(encoding='utf-8-sig') as f:
        records = [json.loads(line) for line in f if line.strip()]
    rows = build_features(records, cutoff, allow_candidates=args.allow_candidates)
    columns = ['game_id', 'identity_key', 'source_id', 'metric', 'as_of',
               'latest_observed_at', 'latest_value', 'samples_7d', 'sampled_max_7d',
               'samples_30d', 'sampled_max_30d']
    args.output_csv.parent.mkdir(parents=True, exist_ok=True)
    with args.output_csv.open('w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)
    print(f'{len(rows)} variant-level research feature rows written; NO forecasting claims.')


if __name__ == '__main__':
    main()
