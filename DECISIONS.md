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
Everything the game needs from a music source is behind the `MusicProvider` interface (`loadTracks`, `play`, `pause`, `resume`), so YouTube (and a video-clip mode) can be added without touching game logic. A silent `DemoProvider` is used by the tests (the user-facing demo mode was removed in DEC-063).
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
**Redirect URIs:** `https://<public host>/callback` (production) and `http://127.0.0.1:5173/callback` (local; Spotify requires `127.0.0.1`, not `localhost`).

### DEC-009 · Deployment: own Portainer stack on the NAS · 2026-11-18 · Active
Stack `tuneguesser` with its own containers (`tuneguesser-web` nginx, `tuneguesser-server` node:22-slim), network and its own folder on the NAS, LAN port **8087**. Completely separate from any other stack on the NAS. The deploy script copies to the NAS share with robocopy, then uses the Portainer API with `PORTAINER_TOKEN`.
Secrets (Spotify Client ID, redirect URI) live in Portainer's stack environment, not in the repo.

### DEC-010 · Public address · 2026-11-18 · Active
Public address: DNS CNAME → Synology DSM reverse proxy (HTTPS 443 → `localhost:8087`, with the WebSocket custom header) using an existing wildcard certificate.
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
Enter / A = accept (buzz, and next song at the reveal, also for phone players); 1-4 or A B X Y pick multiple-choice options; Alt+S / Select skip; Alt+P / Start pause. Alt combos use the physical key code so they work with any layout. A gamepad (Gamepad API, standard mapping) shows Xbox or PlayStation glyphs and an on-screen keyboard for typed answers. **Pause** is a new feature: it freezes the clock and music; any player or the host can toggle it. Open: should pause be host-only?

### DEC-032 · Quit stops the music · 2026-11-18 · Active
The host's quit (and Cancel / New game) sends a `quit` message: the server pauses Spotify, ends the game for players and deletes the room. Closing the browser tab without quitting does not stop the music.

### DEC-033 · Guess setting (song / artist / both) · 2026-11-18 · Active
`GameConfig.guess`. Only the wanted parts can be found or scored; the other is ignored (a typed answer matching only the unwanted part counts as wrong). The round ends when all wanted parts are found. Artist-only is scored on the title's 1000 scale so a round is still worth a full song. Multiple choice shows just the title or just the artist as options (distinct values). The "title + artist at once" multiplier applies only with *Both*. With *Reveal* hints the unguessed part is displayed in full as context.

### DEC-034 · Adaptive two-column layout, no duplicate info · 2026-11-18 · Active
From 900 px wide, screens use two columns: host playing = timer | scores, then answers | trivia and score banner; reveal = song details | scores; the phone/keyboard player view (also usable in a desktop browser) = answer field | on-screen keyboard, multiple-choice options in 2 columns, reveal = song | scores. Below 900 px it is one column. Duplicates removed: the letter hint is shown **inside** the Song/Artist answer panel (no separate "? ? ?" and "_ _ _" blocks), and at the reveal the points banner shows only the multipliers because the scoreboard already shows the points.

### DEC-035 · Keyboard auto-completion and Quickstart · 2026-11-18 · Active
The gamepad on-screen keyboard has a suggestion row (up from the letters): words completing the word being typed (accents and case ignored; a picked word is followed by a space). The list (titles/artists of the selected playlists, only the part being guessed) is sent once per connection to a player who buzzes in type mode; it contains the answer among all the others, like a search box. **Quickstart** button at the top of the host setup creates a room at once with the last playlists, device and settings (remembered on the host's device).

### DEC-036 · Gamepad navigation of menus · 2026-11-18 · Active
A small spatial focus navigator (`input/nav.ts`): d-pad moves to the nearest control in that direction, A clicks, left/right adjust number boxes and drop-downs, LB/RB switch tabs; a yellow focus ring shows while a pad is used (hidden again on mouse/touch). It is off while a screen marked `data-pad-game` is up (a running round or reveal, the on-screen keyboard) because those use the buttons for game actions. Text boxes open the same on-screen keyboard (without auto-completion) as a pop-up: A on the box, Y = done, Start = cancel; the text is passed to the app as a normal input event so its own tidying (e.g. upper-casing the room code) applies.

### DEC-037 · Change device during a game · 2026-11-18 · Active
Host-only 🔈 button lists the Spotify devices and transfers playback (`PUT /me/player` with `play` true if the music was playing, false if paused by a buzz or pause). The Enter keycap was removed from the ANSWER button at the user's request (the gamepad glyph stays).

### DEC-038 · Cancel an answer · 2026-11-18 · Active
The player who pressed ANSWER can cancel (Esc, Start, or a Cancel button): no attempt is used and the music resumes. The round clock was frozen while they were answering, so nothing is lost or gained; they can buzz again at once.

### DEC-039 · Common-word dictionary in the autocomplete · 2026-11-18 · Active
After up to 3 words from the playlist, the suggestion row is filled with the 5,000 most common English words (frequency list from the Google n-gram data, `packages/shared/src/dictionary.ts`, bundled into the web app, about 35 KB). English only for now; song titles in other languages come from the playlist words.

### DEC-040 · Longer answer time with the on-screen keyboard · 2026-11-18 · Active
A device with a gamepad connected tells the server (`padkb`); its player then has **60 s** instead of 25 s to answer. The on-screen keyboard is also about 1.7x wider than the text column (the answer area takes up to 1400 px on wide screens).

### DEC-041 · On-screen keyboard buttons · 2026-11-18 · Active · supersedes the button choices in DEC-031/035
A presses the highlighted key, **B cancels** (no attempt used), **X backspace**, **Y send**. The bottom row shows space plus labelled Cancel / Backspace / Send keys with their glyphs. Swapped later at the user's request: **X = space, R1/RB = backspace**. The same keyboard is used by the text-box pop-up (B or Start closes it, Y = Done).

### DEC-042 · Letters start after 10 s · 2026-11-19 · Active
The Reveal hint shows only underscores for the first 10 s (or half the timer if it is shorter than 20 s); the letters then appear evenly so all are visible just before time ends.

### DEC-043 · Hints are checkboxes; artwork hint · 2026-11-19 · Active · supersedes the single-choice hints of DEC-023/028
`GameConfig.hints` is now `{reveal, trivia, art}` (any combination; the old single-choice value is still accepted when loading saved settings). The **artwork** hint sends the cover URL and a progress value (elapsed / timer window, frozen on pause) to the host screen only; the canvas draws it as 3 to 96 blocks per side and the sharp image at the end. Note: the cover URL is in the room state, so a technically minded player could look at it on the network; acceptable for a party game. Tracks without cover art show no art area.

### DEC-044 · Gamepad access to the corner buttons · 2026-11-19 · Active
LB/L1 (in a game, or any screen without tabs) or Select/Share (menu screens) enters a "corner menu" mode: all pad buttons go only to the menu handler so the game does not react (A cannot buzz by accident); left/right pick device / quit / settings / mute, A presses, panels are navigated with the d-pad, B / LB / Select leaves. A "Menu" glyph hint sits under the buttons.

### DEC-045 · In-app confirmation dialogs · 2026-11-19 · Active
Quit (host) and Exit (player) used the browser's `window.confirm`, which a gamepad cannot operate. They now use an in-app `Confirm` dialog: A confirms (Quit), B / Start / Esc go back; while open it takes over the pad (menu mode) so the game and the corner-menu navigator ignore it. Mouse and touch work too.

### DEC-046 · Hints never complete before the timer ends · 2026-11-19 · Active · supersedes the end point in DEC-042/043
The revealed letters and the pixelated artwork are scaled to finish 5 s after the timer (`HINT_GRACE_MS`), so at timeout they are close to, but not at, 100%; the reveal screen then shows the full answer. The artwork progress is capped below 1 during play.

### DEC-047 · Abandoned rooms are ended · 2026-11-19 · Active
A room kept running (timers, auto-advance, `play()` calls on the host's Spotify) after the host closed the tab, so songs kept changing on the host's account. Now, when the host screen has been disconnected for 60 s (reloads reconnect in time), the server ends the game and stops the music (a lobby is just dropped). Rooms older than 4 h also stop their music.

### DEC-048 · Voice answers with the browser's speech recognition · 2026-11-19 · Active
A 🎤 button on the typed answer form uses the Web Speech API (free, no server). Interim text fills the box, the final text is auto-sent after 1.5 s unless edited. Chosen over a server-side speech-to-text service (Whisper) for zero infrastructure; the answer matcher's typo tolerance absorbs most recognition errors. Not offered on the gamepad keyboard form or where the API is missing. Possible later: sound-alike matching for names, or Whisper for better accuracy.

### DEC-049 · Shared settings menu, next-song setting moved, Android app, private addresses · 2026-11-19 · Active
The ⚙ menu is one component on the Join and Host screens (theme + link to the Android APK; the APK link is hidden inside the app). *Next song automatically* is now a gameplay option on the setup page, no longer changed live during a game. The Android app is a Capacitor shell (`android-app/`, `npm run build:apk`) around the live site; its APK embeds the server address, so it is git-ignored and served from the web app. Deployment settings (NAS path, public address, Portainer URL) now come from the environment or an untracked `.env`, never from the repo, and the git history was rewritten to remove the private addresses and unrelated project names.

### DEC-050 · Spotify login in the Android app runs in the system browser · 2026-11-19 · Active
Inside the Capacitor WebView the login link was opened in the phone's browser by default, so the session ended up in the browser, not the app (error "Spotify login failed"), and Spotify rejects embedded web views anyway. The app now calls `TuneGuesserApp.openExternal(login URL with a random nonce)`; the server parks the finished login under that nonce (2 min, one use) and the browser page returns to the app through the `net.phoenixfox.tuneguesser://auth` link; the app polls `/api/auth/claim?nonce=` and moves the login into its own session. No user-agent spoofing. Also: a failed Spotify `play` no longer crashes the server (it used to wipe all logins).

### DEC-051 · TV remote navigation · 2026-11-19 · Active
On an Nvidia Shield remote the arrow keys changed number boxes and drop-downs instead of moving on, so the setup page could not be left. In the Android app (or a TV browser) the arrow keys are now captured and routed to the same spatial focus navigator as the gamepad d-pad: up/down always move, left/right adjust numbers and drop-downs or move, Enter clicks the focused control. Works on every screen including the game (so the corner buttons are reachable).

### DEC-052 · Log in from another device (TV without a browser) · 2026-11-19 · Active · extends DEC-050
Android TV / Shield has no browser, so opening the login in the system browser does nothing. The app now shows a QR code and a 5-letter short link (`/api/l/CODE`, valid 10 min) that redirect to the same nonce login on whichever device opens them; the app polls `/api/auth/claim` as before. The app's `openExternal` no longer crashes when no browser exists. The Spotify mobile app cannot do this for us: Spotify's login has to run in a browser.

### DEC-053 · Remote/pad navigation fixes · 2026-11-19 · Active
When nothing was focused, the navigator picked the `data-pad-first` element even if it was disabled (Start game with no players, Quickstart before a playlist is chosen), so focusing silently failed and every arrow key did nothing: the lobby looked dead. It now picks the first enabled one. Left/right inside a row of option buttons (the `.seg` groups, e.g. the Hints toggles) step through the row before leaving it, and focus scrolling is instant instead of smooth so quick key repeats are not measured mid-animation.

### DEC-054 · Back button in the Android app · 2026-11-19 · Active
The Android Back button closed the app at once. The web view treats Back as history navigation, so the app keeps one extra history entry and handles the `popstate` itself (`BackHandler`): close the open dialog/panel, otherwise use the screen's quit/exit button (confirmation during a game), otherwise ask to exit the app. Web-only, so no new APK was needed.

### DEC-055 · Voice answers in the Android app use the native recognizer · 2026-11-19 · Active · extends DEC-048
Android's WebView has no Web Speech API, so the 🎤 button never appeared and no permission was asked. The app now exposes `SpeechRecognizer` to the page (`TuneGuesserApp.startListening` / `window.__tgSpeech`) and requests `RECORD_AUDIO` at first use; `Mic.tsx` wraps it in the same interface as the browser API. Needs the new APK (older installs have no mic).

### DEC-056 · New main screen with Solo Play; "Next song" relabelled · 2026-11-19 · Active
The home page is now a menu (logo, two-line explanation incl. the Spotify requirement, **Solo Play / Host a game / Join a game**) instead of tabs; Host and Join have a "← Menu" link. Solo uses the host setup without *Play order* (forced to buzzer), asks for a name, and *Start the game* creates the room, joins this screen as the player and starts immediately (no lobby; flag `tg_solo` in sessionStorage so a reload resumes). *Next song* options are now **Automatic** / **Song end / Manually skip** in every mode.

### DEC-057 · Spotify logins persist across restarts · 2026-11-19 · Active
Sessions were only in server memory, so every restart/deploy logged everyone out (the app showed the login button again). Refresh tokens are now written to `DATA_DIR/sessions.json` (mode 600, a new `/data` volume in the stack), keyed by the 30-day session cookie, and reloaded at start. Needs `deploy-nas.mjs --stack` once. Anyone with the file could use the tokens, so it stays on the NAS and out of git.

### DEC-058 · One floating status bar on every game screen · 2026-11-19 · Active
Host, solo and player screens had a mix of fixed corner buttons and static controls that did not line up with the round/score text. They now share one sticky `.statusbar`: pause, skip, round (+ seconds on phones), scores on the left; sound, mic, device, settings, quit on the right (player: exit, name + round, theme, mic, pause, skip, score, same order as before). All buttons are the same circle (44 px, 32 px on phones); vote counts are badges. The host's round screen fills the bar's left part through a portal, so the body grid lost its header row.

### DEC-059 · Song start setting: random or from the beginning · 2026-11-19 · Active
New gameplay option `start`: `random` (default) picks any point at least 20 s before the end of the song (before: 15-65% of the song, which could clip the end); `beginning` starts at 0:00. The 20 s margin is not shown to players. Tests use `beginning` so they stay deterministic.

### DEC-060 · YouTube as a second music source · 2026-11-19 · In progress (branch `youtube-playback`)
Spotify needs Premium, a login and an open device. YouTube mode needs none of that: the host pastes **public or unlisted playlist links**, and the music plays in YouTube's **IFrame player on the host screen**. The server stays the game clock and sends `{t:"player", cmd}` (play / pause / resume / stop) to the host sockets; `YouTubeProvider` implements the same `MusicProvider`, so `Room` is unchanged. Playlists are read with the YouTube Data API using a server-side `YOUTUBE_API_KEY` (no Google login). Title and artist come from "Artist - Topic" channels (clean) or by splitting "Artist - Title" and stripping "(Official Video)"-style noise; videos that cannot be embedded, live streams and clips under 45 s or over 15 min are dropped; the thumbnail is the artwork (year = upload year, so approximate).
Players can opt in to hear the music on their own phone too (🎧 button in their status bar, off by default; the tap also satisfies the browser's autoplay rule). The server sends the same player commands to opted-in sockets (`{t:"listen"}`), and `YouTubeProvider.snapshot()` lets a late listener join mid-song. Sync is approximate (network delay, a few hundred ms). The host (and solo) screen always plays.
With the **Artwork** hint on, the host screen shows the **video itself, pixelated** (a mosaic of backdrop-blur tiles laid over the player, then a blur, sharpening in stages like the artwork; SVG filters do not reach YouTube's cross-origin frame; captions are switched off; scaled up and cropped so YouTube's title bar is out of frame) instead of the thumbnail. Players' phones still get the pixelated thumbnail.
YouTube playlist cards are **toggles** (a tapped playlist is deselected, not deleted; the switch-off state is remembered per device). The **default playlists are permanent**: always shown, never removable (a missing one is fetched again), only the playlists the host adds can be removed (✕).
Known gaps / risks: (1) the player is invisible (its picture would give the answer away), which YouTube's terms discourage, so a visible-but-masked design may be needed; (2) autoplay needs a user gesture on the host page (Create room counts; the Android WebView may need `mediaPlaybackRequiresUserGesture` off); (3) a host reload drops the current song until the next round; (4) YouTube metadata is messier than Spotify's, so some answers will be odd; (5) no way yet to skip a video that fails to play.

### DEC-061 · Language selector (English / Spanish); YouTube is the default music source · 2026-11-19 · Active
`⚙ Settings → Language`. The UI text is translated client-side with `t("English text")` (the English text is the key; a missing translation falls back to English) and `apps/web/src/es.ts`; the choice is saved per device (first visit: the browser language). A test fails if any `t("…")` or option label has no Spanish entry or loses a `{placeholder}`. Voice answers use `es-ES` when Spanish is selected. Not translated: messages that come from the server (e.g. "Music play failed"), song data and trivia (trivia comes from English sources). To add a language, add a dictionary and an entry in `LANGS`.
In the **Music from** menu YouTube is now first and the default (devices that never chose keep it; the saved choice moved to the key `tg_music`).

---

## Open questions
- Should the 5-second playing reveal apply to every round end (current) or only when everyone is out of attempts?
- Should a player be allowed more than 3 tries when playing solo?
- Video-clip mode (needs YouTube).
- Round robin: should others be able to steal after a failure? Multiple choice points: should they differ from typed answers?

### DEC-062 · Blue/green deploys with room-code routing · 2026-11-19 · Active
Rooms live in the server's memory, so restarting the server ended every game. Two identical servers (`-a`, `-b`) now run side by side. A deploy goes to the idle one; nginx's `active.conf` (a one-line `map`, written by the deploy script) says which server takes new rooms, and `nginx -s reload` switches without cutting open sockets. A room's code encodes its server (first letter A–M = a, N–Z = b, `SLOT` env var) and the client connects to `/ws?room=CODE`, so nginx needs no lookup table and a reload/reconnect lands on the right server even after a switch. The deploy script refuses to overwrite the idle server while it still has rooms (`/slot/a|b` → `/api/health`), unless `--force`. nginx.conf and active.conf are mounted as a directory (a replaced single-file mount would go stale). Static files are copied additively and pruned after 14 days so open pages keep their lazy chunks.
Trade-offs: a player who reloads mid-game gets the new client talking to the old server (needs a backwards-compatible protocol; no version check yet). Spotify logins are shared through `sessions.json` (a session missing in memory is looked up in the file; saves merge with the file); if Spotify ever rotates refresh tokens, a login used on both servers could need a re-login. In-flight Spotify logins (PKCE, in memory) can fail if a switch happens during the few seconds of the login. The one-time migration (`--stack`) still ends running games.

### DEC-063 · Demo mode removed · 2026-11-19 · Active
The silent "Try demo mode" button and the `demo` flag of `POST /api/rooms` are gone: with YouTube as the default source nobody needs a music-less game, and its fixed placeholder fields were confusing. `DemoProvider` stays as test infrastructure only.

### DEC-064 · Black-screen hardening for iPhone browsers · 2026-11-19 · Active
A reported black screen on iPhone could not be reproduced. Likeliest cause: browsers that throw when `localStorage`/`sessionStorage` is touched (Safari with "Block All Cookies", some in-app browsers), while several screens read them unguarded during render, so React crashed and left the dark page background. Fixes: `storage.ts` swaps in an in-memory store when storage throws; an `ErrorBoundary` shows the error message and a Reload button instead of an empty page; `index.html` shows a "could not start" message (with the last script error or the user agent) if nothing has drawn after 6 s; Vite targets `safari13` so `?.`, `??` and `??=` are transpiled for older iPhones. If it happens again, the on-screen message is the clue to ask for.

### DEC-065 · Ambiguous YouTube titles: unspaced hyphen, overrides · 2026-11-19 · Active
"x-y" titles with no spaces around the hyphen ("somebody to love-jefferson airplane") are parsed as Artist-Title and marked *loose*; `fixLoose` swaps them when only the second part is an artist seen in confident titles of the loaded playlists. When the order cannot be inferred, `OVERRIDES` in `youtube.ts` (video id → title/artists) holds hand corrections; all four loose titles in the default playlists were checked (only "Somebody to Love" was wrong). A trailing bare "Lyrics" is stripped.

### DEC-066 · Song voting (👍/👎) and blacklist · 2026-11-19 · Active
The host screen (also the solo screen) shows 👍/👎 under the video/artwork while a round runs and on the reveal screen; phones have no vote buttons. A 👎 **skips the song at once and does not count as a round** (`Room.discardCurrent`: the song leaves the queue and pool, another unplayed song takes its place, the round number is not advanced; points already scored stay). Each vote is recorded in `DATA_DIR/votes.json` (shared by both blue/green servers, re-read on every use) under an anonymous per-browser id, so one browser counts once per song; **more than 3 different 👎 voters blacklist a song**: it is filtered out of every later game (`loadTracks` wrapper) and dropped from running games. The server decides which song a vote is about (the current one), so clients cannot vote on arbitrary ids. To bring a blacklisted song back, delete its entry in `votes.json` (entries keep "Artist — Title" for reference).

### DEC-067 · Thumbs down only ("This song has issues"); doubtful and live videos are never played · 2026-11-19 · Active
Supersedes the 👍 and the 4-vote threshold of DEC-066: the host/solo screen has a single 👎 button (tooltip "This song has issues."); **one vote is enough** to blacklist the song (and skip it without counting a round). Also, a YouTube video is not loaded at all when (a) it is a **live recording** (title says live; "Unplugged" versions are kept / concert / fan cam / front row / a date such as 7/10/10 / "festival" / "tour" / bootleg / audience or soundboard recording / rehearsal / interview). The purpose is to drop low-quality concert recordings whose audio is mostly non-song content (e.g. the singer talking to fans); the song titles "Live Forever" or "Live and Let Die" are not matched) or (b) the parse is **low confidence**: the artist is only the uploader's channel (not VEVO / Official / Topic, and not an artist seen in 3+ tracks), the order of an unspaced "x-y" title is a guess, the title keeps leftovers ("Official", "Lyrics", "HD", quotes) or is implausibly long. Across the default playlists this removed 21 live videos and 22 doubtful ones (of about 1,300); some of those were right (e.g. "Babydoll" by Dominic Fike) but lost; fix by adding an override (DEC-065) if one is wanted back.

### DEC-068 · Game clock for score-limit games, high-score tables, reset-to-defaults button · 2026-11-19 · Active
When playing **to a target score**, the host screen shows a game clock (starts with the first round, excludes manual pauses, stops at the winning answer). When a game ends by itself (not when the host quits), results are stored in `DATA_DIR/highscores.json` (shared by both blue/green servers) and a top-10 table is shown after the game on the host screen and on phones. Tables are separated by playlists (and source), rounds count / target, hints, timer, type/choice, song start, attempts and multipliers as requested, and also by guess type and play order, which change the game just as much. Rounds: most points wins; target score: fastest time wins, and only players who reached the target are saved. Rounds games save players with points above 0. The options card on the setup page got a "Reset settings to defaults" button (game options only; theme/language are separate).

### DEC-069 · Playlist pages: song check, corrections, bans, "one artist only" · 2026-11-19 · Active
YouTube playlist cards have a ⚙ linking to `/playlist/<id>` (same tab; the setup options are saved to localStorage on every change so nothing is lost on return). The page lists what the game would use for that playlist (after the live/doubtful filters, which are now applied **per playlist** instead of on the combined list, so the page and the game agree). Corrections (title/artists per video) and per-playlist "one artist only" are kept in `DATA_DIR/edits.json` and apply to everyone, like bans (bans use the existing votes store, voter id `playlist-page`; bringing back deletes all thumbs-down of that song). One-artist filtering keeps songs where any listed artist equals the chosen one. When every selected playlist is one-artist for the same artist, `guess` is forced to `title` (UI shows only "Song"; `/api/rooms` enforces it). Not done: Spotify playlists, and any protection against someone vandalising edits (the site is open, as with thumbs-down).
