# TuneGuesser

A web game where 1 to 4 players guess the song and artist from a few seconds of music playing on Spotify.
The host screen (TV or laptop) plays the music and shows the scoreboard; players answer from their phones.

Live: <https://your.public.host> · LAN: <http://nas.local:8087>

Why things are the way they are: see [DECISIONS.md](DECISIONS.md).

---

## Game rules

### Setup
1. The host opens the **Host a game** tab, logs in with Spotify and picks a **playlist**, a **playback device** and the number of **rounds** (songs) and **seconds per song** (default 40).
2. The host creates a room. The screen shows a 4-letter **room code** and a QR code.
3. Players open the **Join a game** tab on their phones (or scan the QR code), enter the code and a name. **1 to 4 players** per room. Nobody can join after the game starts, but a player who drops can reconnect.
4. Optional: the host can also play on the host screen (name field in the lobby). The host then counts as one of the 4 players.

### A round
1. A song starts playing at a random point (not the intro). The round clock starts: **40 seconds**.
2. Every player has a big **ANSWER** button. The **first** player to press it wins the turn:
   - the **music pauses** and the **round clock freezes**,
   - everyone else sees "<Player> is guessing…",
   - only that player gets the answer box.
3. The guesser has **25 seconds** to type and send an answer. If they run out of time, it counts as a wrong answer.
4. **One answer box.** Type the song, the artist, or both, in any order ("Billie Jean", "Michael Jackson", "Billie Jean - Michael Jackson", "billie jean by michael jackson"…).
5. After the answer:
   - **Song and/or artist correct:** that part is **shown to everyone** (with the name of whoever found it) and the guesser scores points. It does **not** use up an attempt, so they can press ANSWER again for the missing part.
   - **Nothing correct:** it uses up one of the player's **3 attempts** for this round.
   - If something is still missing, the music **resumes where it stopped** and the clock continues, until someone presses ANSWER again, the time runs out, or everyone is out of attempts.
6. The round ends when **both parts are found**, **time runs out**, **every player is out of attempts**, the host skips, or every connected player votes to skip.
7. **Reveal:** the full title, artist, year and album art are shown with the points each player earned. The song **keeps playing for 5 seconds**, then the next song starts. After the last song, the final results (podium) are shown.

### Skipping
- **Host:** the *Skip song* button ends the round immediately.
- **Players:** each player has a *Skip song* button. The song is skipped when **every connected player** has voted. A vote can be withdrawn by pressing again. Players who left or lost connection are not counted.
- A skipped round still shows the answer and plays on for 5 seconds before the next song.

### Scoring
| Part | Max points |
| :--- | ---: |
| Song title | 1000 |
| Artist | 500 |

Points shrink linearly with the time elapsed on the round clock **at the moment the player pressed ANSWER** (so slow typing costs nothing), from the maximum at 0 s down to **20 %** of the maximum at the end of the round. Wrong answers lose nothing. Each part can only score once per round: whoever finds it first gets the points.

Example, 40-second round, title found 10 s in: `1000 × (0.2 + 0.8 × 0.75) = 800`.

### What counts as a correct answer
- Upper/lower case, accents and punctuation are ignored (`Beyoncé` = `beyonce`, `&` = `and`).
- **Small typos are accepted**, scaled to the length: words up to 3 letters must be exact, up to 7 letters one typo, up to 14 letters two typos, longer up to 15 % (max 4). **Numbers must match exactly.**
- **Titles:** text in `( )` or `[ ]` is optional; a suffix like `- Remastered 2011`, `- Live`, `- Radio Edit` is optional; `feat. X` is optional; a leading *The / A / An* is optional.
- **Artists:** any **one** credited artist is enough; several can be typed together (`A & B`, `A ft. B`, `A, B`); a leading *The* is optional.
- The two parts can be typed in any order, with or without a separator (`-`, `by`, `,`, `|`).

### Players, attempts, leaving
- **3 attempts** per player per round; they reset every round.
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
- Game modes: multiple choice, hints (year, artist trivia), more.
- YouTube as a music source and a video-clip mode.
- Persistent sessions (Spotify logins are kept in memory).
- Sound effects are simple synthesized tones; music/visual polish is ongoing.
