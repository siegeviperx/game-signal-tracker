# C2 local test results — 2026-10-11

Run against a temporary integration tree composed of the C1 source foundation plus the new C2 release overlay.

- `node --test tests/*.test.js`: **23 passed, 0 failed** (existing C1 regression cases + C2 parsing, security, rights gating, source-specific logic, editorial review, descriptive momentum and direct SQLite persistence).
- `python3 tests/migration_test.py`: **2 passed** (C1 additive schema and data preservation).
- `python3 tests/c2_migration_test.py`: **3 passed** (C2 additive source registry, preserved Frostpunk mapping, new video/news tables, missingness and deduplication).
- `python3 -m unittest -q test_snapshot` in `forecasting/`: **1 passed** (point-in-time feature research tests).
- `node --check` across Worker source modules: **passed**.
- A separate realistic SQLite/Worker integration exercise with mocked upstream HTTPS responses saved Twitch sample **59** and YouTube sample **1,450** as synthetic fixtures (NOT real production data). CSV/training forecasts were not generated.

**Not yet tested:** production D1 migration, actual Twitch/YouTube API credentials or quotas, editorial feed terms, live rights approvals, real historical outcomes, peer calibration, browser UI automation, or full-catalog IGDB paging. Therefore production behavior and model predictive skill are **not** claimed by these local tests.

The GitHub workflow runs JS tests and the C2 offline SQLite test *before* migrating and deploying Worker code. Recheck green Actions after deployment.
