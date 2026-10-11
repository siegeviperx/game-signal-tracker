# C2 INSTALL — GitHub WEBSITE only, no GitHub Desktop

**You already work on `main`; keep using your browser-based github.dev editor.** This ZIP is a **folder-content overlay** of the existing repository, NOT a second repository or an extra folder. The existing `docs/TECHNICAL_REQUIREMENTS.md` v0.4 must stay intact. Do not delete or replace entire existing folders. Do not run schema-changing SQL in Cloudflare manually: GitHub Actions applies migration `0006` automatically.

## Before you upload

1. Extract the ZIP locally. Open the extracted folder named `GameSignalTracker_C2_MultiSource_2026-10-11`.
2. In your normal web browser open https://github.com/siegeviperx/game-signal-tracker and press the **period key (`.`)** to open github.dev.
3. In the left Explorer, expand your existing repository folders. **Drag the files inside the extracted folders** into the *matching* folder in github.dev. If it warns about same-named individual files, choose Replace/Overwrite. **Do not drag the entire extracted release folder into the repo**, and do not delete current files not in this ZIP.
4. Example: on Windows open the ZIP's `worker/src` folder, select all files inside, and drag those files onto **`worker/src`** in github.dev. Then do the same for `migrations` → `migrations`, `tests` → `tests`, `tests/fixtures` → `tests/fixtures`, `frontend` → `frontend`, `forecasting` → `forecasting`, `tools` → `tools`, `docs` → `docs`, `.github/workflows` → `.github/workflows`.
5. Important: in the file explorer, hidden `.github` may not show depending on Windows settings. It is a normal folder. The `deploy-worker.yml` workflow must be updated to run the new offline migration test before production deployment.

## File replacement versus addition

**Replace** these files by dropping in same path:
- `worker/src/index.js` — new API routes and gated scheduler.
- `worker/src/igdb.js` — paged catalog sync plus prior mapping logic.
- `frontend/index.html` — Trending navigation.
- `frontend/signals.html` and `frontend/signals.js` — multi-source history and reviewed editorial evidence.
- `.github/workflows/deploy-worker.yml` — tests → additive migration → deploy.
- `worker/src/core.js`, `worker/src/signals.js`, `worker/src/variants.js` — unchanged baseline support files included for compatibility. If github.dev says unchanged, that is fine.

**Add** these files (new paths):
- `migrations/0006_multisource_momentum.sql`
- `worker/src/measurements.js`, `multisource.js`, `editorial.js`, `momentum.js`, `twitch-mapping.js`, `video-import.js`
- `frontend/trending.html`, `frontend/trending.js`
- `tests/c2-multisource.test.js`, `tests/c2_migration_test.py`, `tests/fixtures/0005_signal_foundation_fixture.sql`
- `tools/run-c2-batch.ps1`, `tools/import-reviewed-videos.ps1`, `tools/video-batch-example.json`
- `forecasting/build_snapshot.py`, `forecasting/test_snapshot.py` if not already present; all documents in `docs/`.

**Do NOT upload:** nested `GameSignalTracker_C2_MultiSource_2026-10-11` as an extra folder, the ZIP file itself, the TXT backup, temporary `__pycache__`, passwords/API tokens, or the version of `0005` under `tests/fixtures` into the actual `migrations` folder. `0005` is already production migration; fixture is test-only.

## Check Source Control and deploy

1. In github.dev, click **Source Control** on the far-left toolbar. Review expected changed / added files and check that `migrations/0006_multisource_momentum.sql` is present exactly once.
2. Confirm lower-left branch says **`main`** (you have chosen to deploy directly to main). This means the commit **will** trigger the production Actions workflows, including D1 migration. If you want a review first, use a separate branch; don't mix workflows accidentally.
3. Enter commit message `C2 Multi-Source Data and Momentum Engine`, choose Commit, then **Sync Changes** / Push when prompted.
4. Visit https://github.com/siegeviperx/game-signal-tracker/actions. Wait until the Worker and frontend workflows finish green. **Do not run another migration manually.** If red, stop and share the failing step.
5. The source additions are **disabled by default**. A green deployment alone does not authorize upstream collection.

## Safe smoke test — requires no token and contacts no new sources

- `https://game-signal-tracker-api.siegeviperx.workers.dev/health`
- `https://game-signal-tracker-api.siegeviperx.workers.dev/sources`
- `https://game-signal-tracker-api.siegeviperx.workers.dev/trending`
- `https://game-signal-tracker-api.siegeviperx.workers.dev/game/23248/variants`
- `https://siegeviperx.github.io/game-signal-tracker/trending.html`
- `https://siegeviperx.github.io/game-signal-tracker/signals.html?game=23248`

Expected if no new source is approved yet: sources show new providers disabled, trending says **insufficient data**, Frostpunk mapping is still `23248.a` and Steam `323190`, and the site still has no validated forecast probabilities. These are correct outcomes.

## After successful deploy (not before)

Read `docs/SOURCE_RIGHTS_CHECKLIST.md` and `docs/C2_RUNBOOK.md`. Start with IGDB admin catalog backfill (uses your existing approved IGDB integration). For the new providers, document and confirm rights, configure credentials where required, approve the exact source, then run a **small** authenticated batch. Source cron flags default off.

Do **not** paste your ADMIN_TOKEN, Twitch credentials, YouTube API key, or Cloudflare token in chat, GitHub issues, scripts, or repository files.
