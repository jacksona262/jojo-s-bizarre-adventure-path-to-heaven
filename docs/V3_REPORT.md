# Path to Heaven · V3 "Legacy Update" report

## Backend used
* **Authentication**: Base44's built-in auth (email + password with email verification, Google sign-in, password reset). Its pages (`/login`, `/register`, `/forgot-password`, `/reset-password`) existed in the codebase but were not routed (they returned 404); they are now routed and themed. No passwords or secrets are stored by the game.
* **Data**: Base44 entities with row-level security (RLS), enforced server-side:
  | Entity | read | create | update / delete |
  |---|---|---|---|
  | `CloudSave` | owner only | signed-in | owner only |
  | `PlayerProfile` | public | signed-in | owner (delete: owner/admin) |
  | `RunStart` | public | signed-in | admin only |
  | `RunRecord` | public | signed-in | admin only |
* **Backend functions are not enabled for this app**, so there is no server-side game logic. Consequences are stated below rather than hidden.

## Accounts & usernames
* Guests can play everything; cloud saves, achievements on a profile and Hall of Fame submissions need an account.
* Signing in without a username shows a mandatory username screen: 3–20 letters/numbers/underscores, reserved names (admin, moderator, base44, …) and an abuse word list rejected, live availability check, case-insensitive uniqueness (claim → re-check; if two players race, the earlier claim wins and the later is rolled back). Changes are allowed once per 7 days.
* Limitation: without backend functions the format/word checks run in the client; RLS guarantees a profile can only be written by its owner, but a determined user could write an odd username through the API. Uniqueness is enforced by the claim/re-check protocol, not a database constraint.

## Cloud saves
* Each signed-in account gets its own local namespace (`pth.v1.u.<accountId>.*`), so accounts on one browser never mix; guest saves stay separate and untouched.
* Every save is written locally first (previous version kept as `.bak`), then uploaded to that slot's `CloudSave` record with an incrementing revision. Before uploading, the remote revision is compared: if another device saved the slot since this device last synced, nothing is overwritten – the other copy is held as a conflict and Load Game offers "Use the other device's / Keep this device's" (the replaced copy is kept as a backup).
* On sign-in, cloud copies are pulled the same way. Failed uploads stay queued and retry on reconnect; a status badge reports Saving / Saved to cloud / failed (saved on this device) / conflict.
* Signed-out progress on the device can be imported into the account (empty slots only, never overwriting).
* Slots: Checkpoint, Slot 1–3, plus a separate New Game+ checkpoint.

## Story timing
* Two clocks in the save: `run.storyMs` (official) and `totalMs` (total playtime).
* Official timer starts when New Game is confirmed; keeps running through pause menus, loading, cutscenes, deaths and retries; stops at the final victory over Jotaro. Active-session timing: only accumulates while the campaign is open; suspensions longer than 2 s count as 2 s.
* Monotonic clock (`performance.now`) on a 4 Hz timer outside the render loop.
* A per-run ledger stored beside the saves only moves forward, and on load the larger time wins – reloading an older checkpoint never rewinds the clock (tested: checkpoint at 0.0 s, clock at 7.0 s, reload → continued at 7.5 s; death count preserved).
* Changing difficulty mid-run marks the run "mixed" (unranked). Saves from before V3 are "untimed" (tracked, unranked). Runs using dev tools are unranked.
* Display format `HH:MM:SS.mmm` in the pause menu, journal, optional HUD timer (Settings), and the completion screen (official time, playtime, bosses, quests, lore, deaths, difficulty, personal best, Hall of Fame rank).
* Cutscene skipping is a Settings toggle ("Skip cutscenes", on by default per the V3 spec); scenes always leave the story in a defined state, so skipping never skips a requirement.

## Hall of Fame
* Categories: Any%, 100% (story + all 12 lore pages), Boss Rush, Boss Trials (per boss), New Game+; each split by difficulty (story / normal / hard). Global top 100, your rank, PB vs world record, run summary with splits and check results.
* **Labelled UNVERIFIED.** Checks performed on every entry: server-issued run id (RunStart created by the same account, kind matches); the server-recorded time between RunStart and RunRecord ≥ the claimed time; plausible minimum per category; every Seal defeated in order with splits inside the final time (story); all lore pages (100%); one entry per run id; best valid entry per player. Players cannot edit or delete records.
* Tested with in-memory runs (nothing written to the live board): genuine runs ranked fastest-first; a run claiming more time than the server observed, an implausibly fast run, a duplicate run, a run without a server start and a run missing splits were all rejected.

## Replayability
* **Boss rematch / time trial** for every Seal-bearer already defeated (any journey), in their real arena with story health; personal bests per boss.
* **Boss Rush**: all ten in a row, one clock, deaths restart the current fight; results with splits; separate board.
* **Modifiers** (unranked): no-hit, two time stops per fight, aggressive bosses.
* **New Game+** after a completed story: carries Stand upgrades, fragments, Enya's favour and lore; bosses +30% health, +20% AI difficulty, +15% damage per cycle; separate checkpoint so the completed save is never overwritten; separate leaderboard.
* Challenges never read or write campaign saves (verified: no save keys written during a rematch).

## Profiles & achievements
* Profile: username, join date, completions, fastest story, Seals broken, quests, lore, total playtime, deaths, Versus W/L, favourite fighter (Versus usage), Boss Rush clears, personal bests, achievements.
* 11 achievements (first Seal, THE WORLD, ten Seals, Over Heaven, story complete, every quest, no-damage boss, Versus win, Boss Rush, every lore page, New Game+), persisted locally and on the profile, with an unobtrusive pop-up.

## Journal & lore
* Journal tabs: The Road (current objective, chapters – future ones hidden), Events (clues), Seals (with split times), Lore (reread pages), Run (timer, playtime, deaths, difficulty).
* 12 optional lore pages placed near landmarks along the road.

## Pacing audit (measured, not assumed)
Measured in the running game with the game's own timing formula (dialogue at the current 1.5× reading pace) and the world layout:
* Dialogue time: boss scenes 779 s (21–87 s each), quest scenes 614 s (46–110 s each), opening 104 s + cold open 76 s → **≈ 26 min of dialogue**, plus ≈ 5 min of non-dialogue camera work → **≈ 30 min of cutscenes** (less with skipping).
* Road: **11.5 km** between objectives (legs 99–1007 m; longest is Ebon Crossing → telegraph). At Slow Dancer's mix of gallop/canter (≈ 11 m/s average) ≈ 18 min, plus quest-internal travel → **≈ 20–25 min of travel**.
* Combat: 14 story fights totalling ≈ 11,900 boss HP (Avdol 660 → Jotaro 1170). Test-bot damage in 35 s fights ran 4–8 DPS; at a typical 6 DPS that is ≈ 33 min, ≈ 35–60 min with deaths.
* Quests: 9 mandatory quests ≈ 3–6 min of play each beyond travel and dialogue → ≈ 35 min.
* **Estimated main story: ≈ 2–3 hours** for a first playthrough (≈ 1.5 h for a practised runner skipping cutscenes). This is an estimate from measured components; a complete human playthrough was not timed in this session. The game is not five hours long.
* Structure: bosses and quests strictly alternate (no back-to-back bosses); the Heaven step sits between the two Jotaro fights. The lore pages give the longest rides something optional to find, and the journal now always shows the current objective.

## Not done / needs you
* **Two-account test**: creating accounts is not something I can do on your behalf, so the cross-account and cross-device save test still needs two real accounts. Please: register two accounts, give each a username, play a little on each, sign out/in (and on a second device), and confirm each sees only its own saves. The isolation itself is enforced by the database (CloudSave read/update = owner only).
* **Verified leaderboard**: true verification needs backend functions (server-authoritative run events and validation). Until then the board is clearly labelled unverified.
* **Controller remapping** was not added (controls are listed in Settings; gamepad support already exists).
