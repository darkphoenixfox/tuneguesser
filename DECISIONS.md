# TuneGuesser: decision log

Newest at the bottom. Each entry: what we decided, why, and what it replaced if anything.
Status: **Active** (in force), **Superseded** (replaced by a later entry), **Open** (still to confirm).

---

### DEC-001 · Name and roles · 2026-11-18 · Active
The game is called **TuneGuesser**. The user is team lead; Claude is the main developer.

### DEC-002 · Project shape · 2026-11-18 · Active
A TypeScript monorepo (npm workspaces): `packages/shared`, `apps/server`, `apps/web`. Tests with Vitest.
**Why:** the answer-matching and scoring rules are used by the server and shared types by both sides; one language and one repo keeps them in sync. The server is bundled by esbuild into one file, so the NAS needs no `node_modules`.

### DEC-003 · Phones as controllers · 2026-11-18 · Active
Players answer on their own phones with a room code (like Kahoot); the host screen plays music and shows scores. Realtime over WebSocket. The host is identified by a private token returned only to whoever created the room, so nobody else can start or skip.
**Alternatives rejected:** shared-screen/hot-seat (not what the user wanted).

### DEC-004 · Music source: Spotify first, YouTube later · 2026-11-18 · Active
Initially YouTube was chosen, then the user changed to **Spotify first**, leaving video/YouTube for later.
Everything the game needs from a music source is behind the `MusicProvider` interface (`loadTracks`, `play`, `pause`, `resume`), so YouTube (and a video-clip mode) can be added without touching game logic. A silent `DemoProvider` is used for tests and demo mode.
**Consequence:** the host needs **Spotify Premium** (playback control); the music plays on any device on the host's account.

### DEC-005 · Answer matching rules · 2026-11-18 · Active
Implemented in `packages/shared/src/matching.ts` (see README for the user-facing list). Key choices: typo tolerance scales with length and numbers must match exactly; text in brackets, remaster/live/edit suffixes and `feat.` are optional in titles; any single credited artist is enough; "The" is optional.
**Why:** this was an explicit requirement ("ignore small typos, accept the main artist only, accept titles without the parenthesis").

### DEC-006 · Scoring · 2026-11-18 · Active
Title max 1000, artist max 500, scaled linearly by elapsed round time down to a 20 % floor. Separate points for each part; each part scores once per round (first finder).
**Time is measured at the moment the player presses ANSWER**, not when the answer is sent, so slow typing on a phone costs nothing (the user raised slow typing as a concern).

### DEC-007 · Spotify API limits (Feb 2026 changes) · 2026-11-18 · Active
Found when a playlist request returned 403. Per Spotify's February 2026 migration guide: `GET /playlists/{id}/tracks` became **`/playlists/{id}/items`**, the `track` field became **`item`**, and playlist items are only returned for playlists the user **owns or collaborates on**. Development-mode apps also require the app owner to have Premium and limit who can log in (allow-list).
**Decision:** use `/items`, accept both field names, and show only readable playlists in the host picker with an explanation. Source: <https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide>.

### DEC-008 · Spotify login: PKCE, no client secret · 2026-11-18 · Active
Authorization Code with PKCE; the server keeps tokens in memory against a session cookie. Only the **Client ID** is needed.
**Consequence:** after every server restart (including deploys) the host logs in again. Persisting sessions is on the "not done yet" list.
**Redirect URIs:** `https://your.public.host/callback` (production) and `http://127.0.0.1:5173/callback` (local; Spotify requires `127.0.0.1`, not `localhost`).

### DEC-009 · Deployment: own Portainer stack on the NAS · 2026-11-18 · Active
Stack `tuneguesser` with its own containers (`tuneguesser-web` nginx, `tuneguesser-server` node:22-slim), network and folder `/volume1/docker/tuneguesser` (Windows share `NAS_DIR`), LAN port **8087**. Completely separate from the another project stack (the user asked for a different container). The deploy script follows another project's approach (copy to `K:` with robocopy, then the Portainer API with `PORTAINER_TOKEN`).
Secrets (Spotify Client ID, redirect URI) live in Portainer's stack environment, not in the repo.

### DEC-010 · Public address · 2026-11-18 · Active
`https://your.public.host`: Porkbun DNS (CNAME to `your.public.host`) → Synology DSM reverse proxy (HTTPS 443 → `localhost:8087`, with the WebSocket custom header) using the existing wildcard `*your.public.host` certificate.
**Gotcha found:** the first `tune` DNS record pointed at a wrong IP, and DSM served the wrong certificate until the reverse-proxy entry was bound to the wildcard certificate.

### DEC-011 · One main URL with two tabs · 2026-11-18 · Active
`/` has **Join a game** and **Host a game** tabs; tabs hide during a game. A link with a room code opens Join; returning from Spotify login opens Host.

### DEC-012 · Host can play too (optional) · 2026-11-18 · Active
In the lobby the host can enter a name and play from the host screen (an embedded answer area during rounds). The host counts toward the 4-player limit.

### DEC-013 · Gameplay: buzzer model · 2026-11-18 · Active · supersedes the first design
The first version let all players type answers at the same time during the round. The user clarified the real concept: a big **ANSWER** button; the first press stops the music and the timer; others see "<Player> is guessing"; only that player answers. A pause button added earlier to cope with slow typing was **removed** (the buzzer replaces it).
Rules decided along the way:
- A correct song **or** artist is shown to everyone and the music continues (resumes where it stopped).
- **3 attempts** per player per round; a guess with a correct part does **not** use up an attempt (user's rule).
- The guesser has **25 seconds** to answer, so a stalled phone cannot freeze the game (our addition).
- Round time **doubled to 40 seconds** (user's request).
- The round ends when both parts are found, time runs out, everyone is out of attempts, or the song is skipped.

### DEC-014 · One answer field · 2026-11-18 · Active · supersedes separate title/artist fields
A single text box; the player may type the song, the artist, or both in any order. The matcher tries the text as a title, as an artist, and every way of splitting it in two (explicit separators `-`, `by`, `,`, `|`, or any word boundary). Parts already found are ignored (and an answer that finds nothing new costs an attempt).
**Risk:** more flexible matching means more ways to match by accident; guarded by tests, to be extended with real-world cases.

### DEC-015 · Resume, don't restart · 2026-11-18 · Active
After a guess the song continues with Spotify's own **resume** (no track, no seek). The earlier version re-played the track at a saved position, which restarted it. Root cause found: Spotify's play/pause calls can answer with a **plain-text success body** that our code tried to parse as JSON and treated as a failure, triggering the restart fallback. Now any non-JSON success body counts as success; the seek-based replay is only a fallback when Spotify refuses to resume. The pause request is awaited before resuming so they cannot arrive out of order.

### DEC-016 · Music errors are shown to the host · 2026-11-18 · Active
Failures from Spotify (pause/resume) are shown as a red message on the host screen for ~7 seconds and logged, instead of being silently swallowed.

### DEC-017 · Reveal keeps the music playing · 2026-11-18 · Active
When a round ends (any reason) the answer is shown and the song **plays on for 5 seconds** before the next song starts. If a guess had paused the music, it is resumed for the reveal. Reveal length changed from 8 s to 5 s. Music stops only after the last song.
The user specified this for the "everyone is out of guesses" case; we applied it to every way a round can end for consistency (can be narrowed if wanted).

### DEC-018 · Skip is a vote, host included · 2026-11-18 · Active
Players get a *Skip song* button and the song is skipped only when **every voter** has voted (votes can be withdrawn). First version: players voted but the host's Skip skipped immediately. **Changed at the user's request:** the host's Skip is **one vote like everyone else's**, with no override.
Voters = connected players, plus the host if the host is not also playing (a host who plays has one vote, as that player, linked through the host token when joining). Players who left or disconnected are not counted; if the host screen is closed the host is not counted. A solo player with no host screen open can skip alone. A skip ends the round the normal way (reveal + 5 s of music). The host's *Next song* button during the reveal still advances immediately.

### DEC-019 · Player Exit · 2026-11-18 · Active
Phones have an **✕ Exit** button. In the lobby it frees the player's slot; mid-game it drops them out and ends any guess in progress (confirmation is asked during a game).

### DEC-020 · Attempts-left indicator removed · 2026-11-18 · Active
The dots showing remaining attempts were shown, then removed at the user's request. The rule remains; a player with no attempts sees a disabled "Out of tries" button.

### DEC-021 · Scores on phones after every round · 2026-11-18 · Active
Phones only showed the player's own points at the reveal. The same ranking as the host screen (all players, totals and points earned this round, own row highlighted) now shows on every phone at each reveal and at game over.

### DEC-022 · Host settings: auto-advance and theme · 2026-11-18 · Active
A ⚙ panel on the host screen (also available on the setup screen before the room exists).
- **Auto-advance** (default **Yes** = the previous behavior). Applies **only to rounds that end because time ran out**, as the user worded it; other round endings keep their automatic 5 s reveal. With **No** the reveal waits for the host's *Next song* and the music keeps playing. Changeable live; takes effect on a reveal that is already showing.
- **Dark/Light theme:** stored per device in `localStorage`; the host's choice does not propagate to phones (phones stay dark; a phone toggle can be added).
Open: should "No" also apply to every other kind of round ending?

### DEC-023 · Game types (GameConfig) · 2026-11-18 · Active
The Host page now sets a `GameConfig` (shared package, validated server-side by `sanitizeConfig`): playlists (multi, remembered on the host device), play-to rounds or score target, order (buzzer / round robin), answers (type / multiple choice), hints (none / reveal / trivia), timer (seconds or unlimited), attempts 1-5, multipliers, auto-advance. Unknown or out-of-range values are clamped to defaults.

### DEC-024 · Auto-advance holds every round end · 2026-11-18 · Active · supersedes DEC-022 (auto-advance part) and DEC-017 (the 5 s applies when auto-advance is on)
User: the screen must hold at **all** round ends so a good song can be heard in full. With auto-advance off every reveal waits; the song keeps playing and the next round starts when the song ends (computed from track length and where it started, plus a small buffer) or when the host presses Next. Default stays on (5 s reveal).

### DEC-025 · Theme per device · 2026-11-18 · Active · answers an open question of DEC-022
Dark/light is stored per device; phones got their own toggle (join screen and in-game header).

### DEC-026 · Round robin semantics · 2026-11-18 · Active (details Open)
Each song is assigned to the next connected player in turn. Only that player can buzz or vote to skip; the round ends when they have used their attempts. Others watch. The host's skip is not counted. Open: should other players be able to steal after a failure?

### DEC-027 · Multiple choice semantics · 2026-11-18 · Active (details Open)
4 options "Title - first artist": the correct one plus 3 other songs from the selected playlists (fewer if the playlists are tiny; with no alternatives the round falls back to typing is NOT implemented, the round just has no options). Only the guesser receives the options (per-recipient state). A wrong pick uses an attempt and removes that option for that player; the right one scores title and artist (no "at once" bonus).

### DEC-028 · Hints · 2026-11-18 · Active
*Reveal:* letters appear in a random order as `elapsed / window` grows (evenly, so every letter is visible at 95 % of the time; spaces and punctuation always shown; changed from a 60 % cap at the user's request), frozen while a player is answering. With an unlimited timer the window is 60 s. *Trivia:* facts are fetched in the background (prefetch of the current and next song) from **MusicBrainz** (tags, area, begin year) and **Wikipedia** (first sentence of the artist's page, with the artist's name hidden) plus the release year, and are revealed one by one over the timer. Free public APIs, no keys; failures just mean fewer facts. Open: trivia quality for lesser-known artists, and song-specific trivia is not covered.

### DEC-029 · Multipliers · 2026-11-18 · Active
Title + artist in one answer ×1.5; streak ×(1 + 0.25 × rounds in a row, max 4). Applied per scored part, shown in a banner on host and phones (and kept visible at the reveal). Values are our choice and can be tuned.

### DEC-030 · Unlimited timer · 2026-11-18 · Active
No countdown (∞). The round ends when the song ends. Score decay uses a 40 s window and hints a 60 s window so speed still matters.

### DEC-031 · Keyboard and gamepad controls · 2026-11-18 · Active
Enter / A = accept (buzz, and next song at the reveal, also for phone players); 1-4 or A B X Y pick multiple-choice options; Alt+S / Select skip; Alt+P / Start pause. Alt combos use the physical key code so they work with any layout. A gamepad (Gamepad API, standard mapping) shows Xbox or PlayStation glyphs (taken from the another project project's style) and an on-screen keyboard for typed answers. **Pause** is a new feature: it freezes the clock and music; any player or the host can toggle it. Open: should pause be host-only?

### DEC-032 · Quit stops the music · 2026-11-18 · Active
The host's quit (and Cancel / New game) sends a `quit` message: the server pauses Spotify, ends the game for players and deletes the room. Closing the browser tab without quitting does not stop the music.

### DEC-033 · Guess setting (song / artist / both) · 2026-11-18 · Active
`GameConfig.guess`. Only the wanted parts can be found or scored; the other is ignored (a typed answer matching only the unwanted part counts as wrong). The round ends when all wanted parts are found. Artist-only is scored on the title's 1000 scale so a round is still worth a full song. Multiple choice shows just the title or just the artist as options (distinct values). The "title + artist at once" multiplier applies only with *Both*. With *Reveal* hints the unguessed part is displayed in full as context.

### DEC-034 · Adaptive two-column layout, no duplicate info · 2026-11-18 · Active
From 900 px wide, screens use two columns: host playing = timer | scores, then answers | trivia and score banner; reveal = song details | scores; the phone/keyboard player view (also usable in a desktop browser) = answer field | on-screen keyboard, multiple-choice options in 2 columns, reveal = song | scores. Below 900 px it is one column. Duplicates removed: the letter hint is shown **inside** the Song/Artist answer panel (no separate "? ? ?" and "_ _ _" blocks), and at the reveal the points banner shows only the multipliers because the scoreboard already shows the points.

### DEC-035 · Keyboard auto-completion and Quickstart · 2026-11-18 · Active
The gamepad on-screen keyboard has a suggestion row (up from the letters): up to 2 whole titles/artists starting with what was typed, plus words completing the word being typed (accents and case ignored; a picked word is followed by a space). The list (titles/artists of the selected playlists, only the part being guessed) is sent once per connection to a player who buzzes in type mode; it contains the answer among all the others, like a search box. **Quickstart** button at the top of the host setup creates a room at once with the last playlists, device and settings (remembered on the host's device).

---

## Open questions
- Should the 5-second playing reveal apply to every round end (current) or only when everyone is out of attempts?
- Should a player be allowed more than 3 tries when playing solo?
- Video-clip mode (needs YouTube).
- Round robin: should others be able to steal after a failure? Multiple choice points: should they differ from typed answers?
