# Game Signal Tracker — Milestone C1 Foundation Bundle

**Read this before uploading.** This is a coordinated, additive release for the **existing** `siegeviperx/game-signal-tracker` GitHub repository and its existing Cloudflare Worker/D1 database. It does **not** start a new app or replace the authoritative `docs/TECHNICAL_REQUIREMENTS.md` v0.4.

## Deployment stages (follow in order)

### 1. Extract the ZIP and copy into a local GitHub repository

A ZIP uploaded directly to GitHub will **not** unpack into repository files. On Windows, the simplest route is **GitHub Desktop**:

1. Download the ZIP and choose **Extract All**.
2. In GitHub Desktop, choose **File → Clone repository**, select `siegeviperx/game-signal-tracker`, and clone it locally (or use its already-cloned directory).
3. Open the local repository folder in File Explorer.
4. Copy **the contents** of the extracted release folder into the repository root, preserving directory paths (`worker/src/`, `migrations/`, `frontend/`, etc.). Select replace when prompted for files included in the release. Do not copy a wrapper folder named `gst-next-release` inside the repository.
5. Do **not** delete files that are present in the repo but absent from the ZIP. This is a **partial, path-preserving patch bundle**, not a full repository replacement.
6. Leave `docs/TECHNICAL_REQUIREMENTS.md`, `worker/wrangler.toml`, `frontend/config.js`, secrets, IDs, `package.json`, and `package-lock.json` unchanged.
7. In GitHub Desktop, inspect the staged changes. Commit everything once with message `C1 multi-listing and signal foundation`, then **Push origin**.

You may instead use the GitHub web UI, but you will have to upload files to the correct folders manually; a ZIP itself cannot be committed as a deployable application patch. GitHub Desktop is recommended for this 17+ file batch.

### 2. Wait for BOTH GitHub Actions workflows

- **Deploy Game Signal Tracker API**: runs JavaScript tests, Python migration/feature tests, applies migration `0005_signal_foundation.sql` to D1, *then* deploys the Worker.
- **Deploy Game Signal Tracker**: publishes the updated GitHub Pages frontend.

If either is red, **STOP**. Do not manually run D1 migration SQL, do not enable new sources, and do not run the variant script until the Worker workflow is green.

### 3. Verify read endpoints (no admin credentials needed)

- `https://game-signal-tracker-api.siegeviperx.workers.dev/health` — should show `signal_sources.steam_current_players.enabled=0`, `rights_status=review_required`.
- `https://game-signal-tracker-api.siegeviperx.workers.dev/game/23248/variants` — existing Frostpunk Steam mapping still `verified`, now marked `23248.a`.
- `https://game-signal-tracker-api.siegeviperx.workers.dev/game/23248/signals` — initially `insufficient_data` until an approved signal is collected.
- `https://siegeviperx.github.io/game-signal-tracker/signals.html` — Signal Lab page. It can show variants before signals exist.
- The original cards, calendar, health and game detail pages should still work.

### 4. Batch-fill multi-listing mappings (after workflows are green)

The 85 stored mappings remain intact. The matcher can add 17 Steam listing IDs across the eight previously ambiguous games, assuming their upstream source data has not changed. Those new records are **candidates**, not automatically verified SKUs. Start PowerShell in the extracted release's `tools` directory:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\run-variant-matching.ps1"
```

Enter the same `ADMIN_TOKEN` you used previously **without** `Bearer`, quotes or whitespace. Never send the token in chat. Script writes `tools/variant-matching-checkpoint.txt` and `tools/variant-matching-results.csv` locally (do not commit those files). Safe to resume or rerun: existing verified mappings aren't overwritten. Use Ctrl+C to stop between batches.

Optional read-only Cloudflare D1 verification:

```sql
SELECT COUNT(*) AS mappings, COUNT(DISTINCT game_id) AS mapped_games
FROM external_game_ids WHERE provider='steam';
SELECT game_id, GROUP_CONCAT(variant_code || ':' || external_id, ', ') AS listings
FROM external_game_ids WHERE provider='steam'
GROUP BY game_id HAVING COUNT(*) > 1 ORDER BY game_id;
```

### 5. Signal collection: separate source-rights approval required

**Do not enable collection as part of this deployment.** The Steam current-player endpoint is merely a configurable integration. Before collecting, document its API terms, attribution, rate limits, commercial/public redistribution rights, and a permissible cadence in `docs/SOURCE_RIGHTS_CHECKLIST.md`. The new database row is deliberately `enabled=0, rights_status=review_required`.

Only after the review is genuinely approved should an authorized operator use a deliberate, auditable update to set that specific source's `rights_status='approved'`, `enabled=1`, `approved_at`, and review notes. This is a **source-configuration approval**, not a schema migration, and is not included as an auto-running script. The optional script `tools/collect-steam-signals.ps1` remains gated until approval. Do not set `STEAM_COLLECTION_ENABLED=true` in Worker config before that.

The existing six-hour IGDB sync stays unchanged. Automated Steam sampling is **off** unless BOTH the source is approved/enabled in D1 AND an explicit Worker `STEAM_COLLECTION_ENABLED='true'` variable is configured later. A small five-listing shard is intentionally used to bound runtime and API traffic; its schedule must be revisited after measuring quotas and coverage.

### 6. Research feature export (only after real observations exist)

From PowerShell in `tools/`, run `export-observations.ps1` with the same `-ExecutionPolicy Bypass -File` pattern. It writes `tools/signal-observations.jsonl` locally. Keep it private; do not commit it. With Python 3 installed, run:

```powershell
python ..\forecasting\build_snapshot.py .\signal-observations.jsonl 2026-10-11 .\asof-features.csv
```

The date is an illustrative *as-of* cutoff: replace it with your actual desired UTC cutoff. By default, candidate listing IDs are **excluded** from feature building. The output is a research feature table, **not a prediction**. No historical labels, model evaluation, commercial forecast, reception forecast or breakout probability is included in this release.

## Paths added or replaced

| Repository path | Change |
|---|---|
| `migrations/0005_signal_foundation.sql` | Additive variant codes and game/listing signal history schema |
| `worker/src/igdb.js` | Multi-match IGDB Steam mapping, stable a/b/c designations, existing API retained |
| `worker/src/variants.js` | Deterministic suffix generation a…z, aa… |
| `worker/src/signals.js` | Gated Steam sampled player count ingestion, daily rollups, read/export functions |
| `worker/src/index.js` | New public signal/listing reads, protected collection/export, no-store admin replies |
| `worker/src/core.js` | Existing working helper functions, **preserved unchanged** |
| `frontend/index.html` | Signal Lab link; cards/calendar intact |
| `frontend/signals.html`, `frontend/signals.js` | Signal Lab discovery, listing table, daily chart |
| `tools/*.ps1` | Resume-safe variant matching; optional collection; authenticated JSONL export |
| `forecasting/*.py` | No-lookahead historical research feature builder and tests |
| `tests/*.test.js`, `tests/migration_test.py` | Matching, collector, source gate, SQLite migration regression tests |
| `.github/workflows/deploy-worker.yml` | Existing workflow preserved with additional pre-migration Python/Node test coverage |
| `docs/*.md` | Instructions, operational gates and research scope; requirements v0.4 unchanged |

## Safety / rollback

A normal revert of the application files would leave the new D1 columns/tables in place. **Do not drop tables or revert migration records**. The original Worker can ignore the additive schema. Revert the commit only if the new Worker misbehaves, and verify existing routes. This release was tested locally against simulated SQLite/D1 and mocked upstream responses, **not deployed to Cloudflare by ChatGPT**.
