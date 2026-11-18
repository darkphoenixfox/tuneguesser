# TuneGuesser

A web game where 1 to 4 players guess the song and artist from a few seconds of music playing on Spotify.
The host screen (TV or laptop) plays the music and shows the scoreboard; players answer from their phones.

Live: <https://your.public.host> · LAN: <http://nas.local:8087>

Why things are the way they are: see [DECISIONS.md](DECISIONS.md).

---

## Game rules

### Setup
1. The host opens the **Host a game** tab, logs in with Spotify and chooses the game type (below).
2. The host creates a room. The screen shows a 4-letter **room code** and a QR code.
3. Players open the **Join a game** tab on their phones (or scan the QR code), enter the code and a name. **1 to 4 players** per room. Nobody can join after the game starts, but a player who drops can reconnect.
4. Optional: the host can also play on the host screen (name field in the lobby). The host then counts as one of the 4 players.

### Game types (Host a game page)
The last chosen playlists and options are remembered on the host's device. The **⚡ Quickstart** button at the top starts a game at once with those last settings.

| Option | Choices | Meaning |
| :--- | :--- | :--- |
| Playlist | one or more | Songs from all selected playlists are mixed (duplicates removed). |
| Play on | device | The Spotify device that plays the music. |
| Play to | **Rounds** (1-100) / **Score** (target 500-100000) | Fixed number of songs, or play until someone reaches the target score (the round in progress is finished). |
| Play order | **Buzzer** / **Round robin** | *Buzzer:* anyone can press ANSWER, the first wins. *Round robin:* players take turns; each song belongs to one player, who must guess it or skip (only they can press ANSWER or skip; the round ends when they have used their attempts). |
| Guess | **Both** / **Song** / **Artist** | What has to be guessed. *Song* or *Artist* only is handy for single-artist playlists. The round ends when the wanted part(s) are found; an artist-only guess is worth the full 1000 points; with *Reveal* hints the part you don't guess is shown in full; multiple choice offers only that part. The *at once* multiplier needs *Both*. |
| Answers | **Type** / **Multiple choice** | *Multiple choice:* the guesser gets 4 options (title - artist); the 3 wrong ones are other songs from the selected playlists. A wrong pick uses an attempt and that option disappears. The right pick scores title and artist together. |
| Hints | **None** / **Reveal** / **Trivia** | *Reveal:* underscores for each letter of title and artist, filling in as the timer runs (evenly, every letter visible just before time is up; frozen while someone is answering). *Trivia:* facts about the artist and song appear over time (genre, origin, formed/born, release year, a Wikipedia sentence with the name hidden), from MusicBrainz and Wikipedia; when nothing is found, no facts show. |
| Timer | **seconds per song** (10-120) / **Unlimited** | Unlimited: the round lasts until the song ends; points fade over 40 s and hints unfold over 60 s. |
| Attempts | 1-5 | Wrong answers a player may use per round. |
| Score multipliers | Yes / No | See Scoring. |

### A round
1. A song starts playing at a random point (not the intro). The round clock starts (default **40 seconds**).
2. Every player has a big **ANSWER** button (in round robin only the player whose song it is). The **first** press wins the turn:
   - the **music pauses** and the **round clock freezes**,
   - everyone else sees "<Player> is guessing…",
   - only that player gets the answer box (or the 4 options).
3. The guesser has **25 seconds** to send an answer. If they run out of time, it counts as a wrong answer.
4. **One answer box.** Type the song, the artist, or both, in any order ("Billie Jean", "Michael Jackson", "Billie Jean - Michael Jackson", "billie jean by michael jackson"…).
5. After the answer:
   - **Song and/or artist correct:** that part is **shown to everyone** (with the name of whoever found it) and the guesser scores points. It does **not** use up an attempt, so they can press ANSWER again for the missing part.
   - **Nothing correct:** it uses up one of the player's attempts for this round.
   - If something is still missing, the music **resumes where it stopped** and the clock continues.
6. The round ends when **both parts are found**, **time runs out**, **every player (in round robin: the player whose song it is) is out of attempts**, or the song is skipped.
7. **Reveal:** the full title, artist, year and album art are shown with the points each player earned and the multipliers. The song **keeps playing**. With *automatic next song* **on** (default) the next song starts after **5 seconds**. With it **off**, the screen is **held at every round end** so the song can be heard in full; the next round starts when the song ends, or when the host presses *Next song*. After the last round, the final results (podium) are shown.

### Skipping
- Buzzer: everyone has a *Skip song* button, **the host included**, and every voter gets **one vote**. The song is skipped only when **all voters** have voted: every connected player, plus the host (unless the host is also playing, in which case they have one vote, as a player). The button shows the count, e.g. `(2/4)`. A vote can be withdrawn. Players who left or lost connection are not counted; if the host screen is closed the host is not counted either.
- Round robin: the player whose song it is decides alone to skip (and the host's skip is not counted).
- A skipped round still shows the answer and follows the reveal rules above.

### Settings during the game
| Setting | Where | Effect |
| :--- | :--- | :--- |
| Next song automatically | ⚙ on the host screen (default **Yes**) | Yes: next song 5 s after the reveal. No: hold every round end until the song ends or the host continues. Changeable live. |
| Theme | ⚙ on the host screen, ☀️/🌙 on phones | Dark or light, saved **per device**. |

### Keyboard and gamepad
| Action | Keyboard | Gamepad (Xbox / PlayStation) |
| :--- | :--- | :--- |
| ANSWER (buzz) | Enter | A / ✕ |
| Next song (at the reveal) | Enter | A / ✕ |
| Multiple choice option 1-4 | 1 2 3 4 | A B X Y / ✕ ○ □ △ |
| Skip vote | Alt+S | Select / Share |
| Pause / continue | Alt+P | Start / Options |
| Cancel answering (no attempt used) | Esc | Start / Options |

- **Menus with a gamepad** (main screen, host setup, lobby): the d-pad moves the highlight, A presses, left/right change a number or drop-down, LB/RB switch between the *Join* and *Host* tabs, **Y = Quickstart** from anywhere on the host setup page. A glyph on a menu button only shows while that button is highlighted. Pressing A on a text box (room code, name) opens the **on-screen keyboard** (Y = done, Start = cancel).
- **Pause** stops the music and the round clock for everybody (host or any player can press it; not while someone is answering). Buzzing is blocked until it continues.
- When a gamepad is connected, the person answering by typing gets an **on-screen keyboard** with **auto-completion** (a row of suggested words, from the playlist first and then a dictionary of common English words; press up from the letters to reach it): d-pad moves, A types the key, B deletes, X adds a space, Y sends. Button glyphs (Xbox or PlayStation style, detected from the pad) are drawn on the buttons they trigger.
- **Play on** (🔈 top right on the host screen): move the music to another Spotify device during a game; the song carries on there.
- **Quit** (✕ on the host screen) stops the music and ends the game for everyone.

### Scoring
| Part | Max points |
| :--- | ---: |
| Song title | 1000 |
| Artist | 500 |

Points shrink linearly with the time elapsed on the round clock **at the moment the player pressed ANSWER** (so slow typing costs nothing), from the maximum at 0 s down to **20 %** of the maximum at the end of the round. Wrong answers lose nothing. Each part can only score once per round: whoever finds it first gets the points.

Example, 40-second round, title found 10 s in: `1000 × (0.2 + 0.8 × 0.75) = 800`.

**Multipliers** (when *Score multipliers* is on; shown on screen when points are scored):
- **Title + artist at once** (typed in one answer): **×1.5**.
- **Streak:** scoring in consecutive rounds adds **×0.25 per round in a row**, up to ×2 (4 rounds). A round without points resets it.
- They multiply together, e.g. both at once on a 2-round streak = 1.5 × 1.5 = ×2.25. Multiple choice scores title + artist together without the "at once" bonus.

### What counts as a correct answer
- Upper/lower case, accents and punctuation are ignored (`Beyoncé` = `beyonce`, `&` = `and`).
- **Small typos are accepted**, scaled to the length: words up to 3 letters must be exact, up to 7 letters one typo, up to 14 letters two typos, longer up to 15 % (max 4). **Numbers must match exactly.**
- **Titles:** text in `( )` or `[ ]` is optional; a suffix like `- Remastered 2011`, `- Live`, `- Radio Edit` is optional; `feat. X` is optional; a leading *The / A / An* is optional.
- **Artists:** any **one** credited artist is enough; several can be typed together (`A & B`, `A ft. B`, `A, B`); a leading *The* is optional.
- The two parts can be typed in any order, with or without a separator (`-`, `by`, `,`, `|`).

### Players, attempts, leaving
- **Attempts per round** (default 3, host chooses 1-5); they reset every round.
- A player can press **✕ Exit** on their phone to return to the main screen. In the lobby this frees their slot. Mid-game they drop out; a guess in progress ends.

---

## Requirements
- A **Spotify Premium** account for the host (Spotify only allows playback control for Premium).
- Spotify must be open on a device (phone, PC, speaker…) on that account, so it appears as a playback device.
- Spotify **development mode** limits apply (the app owner needs Premium, and only allow-listed users can log in; see DECISIONS.md).
- Only playlists the host **owns or collaborates on** can be used (a Spotify rule since February 2026). To use someone else's playlist, copy its songs into one of yours.

## Running it locally
```bash
cp .env.example .env        # then set SPOTIFY_CLIENT_ID
npm install
npm run dev:server          # game server on :3000
npm run dev:web             # web app on http://127.0.0.1:5173  (use 127.0.0.1, not localhost)
npm test                    # unit tests (matching, scoring, game engine, Spotify calls)
npm run typecheck
```
In the Spotify dashboard add the redirect URI `http://127.0.0.1:5173/callback` for local development.
The host screen has a **demo mode** (no Spotify, silent) for trying the flow.

## Deploying to the NAS
`npm run deploy:nas` builds everything, copies it to `NAS_DIR` (the Synology share of `/volume1/docker/tuneguesser`) and creates or updates the Portainer stack `tuneguesser` (separate from the another project stack). It restarts `tuneguesser-server` on later runs.

| Flag | Effect |
| :--- | :--- |
| *(none)* | build, copy files, create the stack (first time) or restart the server |
| `-- --stack` | also push `deploy/docker-compose.yml` to the stack (use when the compose file changes) |
| `-- --files` | copy files only, no Portainer |

Needs `PORTAINER_TOKEN` in the environment. The Spotify Client ID is read from `.env` and sent to the stack's environment variables, never stored in the repo. The server loses Spotify logins on restart, so the host logs in again after a deploy.

Production setup: containers `tuneguesser-web` (nginx, port **8087**) and `tuneguesser-server` (Node); DSM reverse proxy `https://your.public.host` → `localhost:8087` with the WebSocket header enabled; redirect URI `https://your.public.host/callback`.

## Project layout
```
apps/server     Node game server: rooms, game engine (room.ts), Spotify (spotify.ts), WebSocket + HTTP
apps/web        React + Vite: host screen (Host.tsx), phone controller (Player.tsx), tabs (Home.tsx)
packages/shared answer matching, scoring and the message types shared by both
deploy/         docker-compose.yml and nginx.conf for the NAS
tools/          deploy-nas.mjs
```
The music source sits behind a `MusicProvider` interface (`apps/server/src/music.ts`) so YouTube can be added later.

## Not done yet
- YouTube as a music source and a video-clip mode.
- Persistent sessions (Spotify logins are kept in memory).
- Sound effects are simple synthesized tones; music/visual polish is ongoing.
