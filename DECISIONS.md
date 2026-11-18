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

### DEC-018 · Player skip vote · 2026-11-18 · Active
Players get a *Skip song* button; the song is skipped when **every connected player** has voted (votes can be withdrawn; players who left or disconnected are not counted; a solo player skips alone). The host's Skip still works immediately. A skip ends the round the normal way (reveal + 5 s of music).

### DEC-019 · Player Exit · 2026-11-18 · Active
Phones have an **✕ Exit** button. In the lobby it frees the player's slot; mid-game it drops them out and ends any guess in progress (confirmation is asked during a game).

### DEC-020 · Attempts-left indicator removed · 2026-11-18 · Active
The dots showing remaining attempts were shown, then removed at the user's request. The rule remains; a player with no attempts sees a disabled "Out of tries" button.

---

## Open questions
- Should the 5-second playing reveal apply to every round end (current) or only when everyone is out of attempts?
- Should a player be allowed more than 3 tries when playing solo?
- Game modes still to build: multiple choice, hints (year, artist trivia), video-clip mode (needs YouTube).
