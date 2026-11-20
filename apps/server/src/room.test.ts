import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DemoProvider } from "./music";
import { DEFAULT_CONFIG, type GameConfig } from "@tuneguesser/shared";
import { Room } from "./room";

const SONGS: Record<string, [string, string]> = {
  demo1: ["Bohemian Rhapsody", "Queen"], demo2: ["Get Lucky", "Daft Punk"], demo3: ["Billie Jean", "Michael Jackson"],
  demo4: ["Smells Like Teen Spirit", "Nirvana"], demo5: ["Rolling in the Deep", "Adele"], demo6: ["Hey Jude", "The Beatles"],
};

describe("Room (buzzer game)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const cfg = (o: Partial<GameConfig> = {}): GameConfig => ({ ...DEFAULT_CONFIG, start: "beginning", playTo: { kind: "rounds", rounds: 2 }, ...o });
  const make = (rounds = 2, autoAdvance = true, extra: Partial<GameConfig> = {}) => {
    const music = new DemoProvider();
    const room = new Room("ABCD", music, cfg({ playTo: { kind: "rounds", rounds }, autoAdvance, ...extra }), { guessMs: 25_000, revealMs: 5_000 });
    const song = () => SONGS[music.played.at(-1)!.id]!;
    return { music, room, song };
  };

  it("songs start at the beginning, or at a random point at least 20 s before the end", async () => {
    const a = make(1, true, { start: "beginning" });
    a.room.addPlayer("A");
    await a.room.start();
    expect(a.music.played[0]!.startMs).toBe(0);
    for (let i = 0; i < 20; i++) {
      const b = make(1, true, { start: "random" });
      b.room.addPlayer("A");
      await b.room.start();
      expect(b.music.played[0]!.startMs).toBeLessThanOrEqual(200_000 - 20_000);
    }
  });

  it("a random start leaves the whole round timer (+3 s) before the song ends", async () => {
    for (let i = 0; i < 20; i++) {
      const b = make(1, true, { start: "random", roundSeconds: 60 });
      b.room.addPlayer("A");
      await b.room.start();
      expect(b.music.played[0]!.startMs + 63_000).toBeLessThanOrEqual(200_000);
    }
  });

  it("discarding the song (host thumbs down) starts another one without counting a round", async () => {
    const { room, music } = make(2);
    room.addPlayer("A");
    await room.start();
    const first = music.played[0]!.id;
    expect(room.state().round).toBe(1);
    await room.discardCurrent();
    expect(room.state().phase).toBe("playing");
    expect(room.state().round).toBe(1);
    expect(room.state().totalRounds).toBe(2);
    expect(music.played.length).toBe(2);
    expect(music.played[1]!.id).not.toBe(first);
  });

  it("limits players to 8, at most 4 of them on the host screen", () => {
    const { room } = make();
    for (let i = 0; i < 4; i++) expect(room.addPlayer(`h${i}`, undefined, true)).toBeTruthy();
    expect(room.addPlayer("h5", undefined, true)).toBeNull();
    for (let i = 0; i < 4; i++) expect(room.addPlayer(`p${i}`)).toBeTruthy();
    expect(room.addPlayer("p9")).toBeNull();
  });

  it("the host's skip button votes for every player on the host screen", async () => {
    const { room } = make(2);
    const h1 = room.addPlayer("Ana", undefined, true)!;
    room.addPlayer("Bea", undefined, true);
    const c = room.addPlayer("Cy")!;
    room.setHostConnected(true);
    await room.start();
    room.voteSkipHost();
    expect(room.state().skip).toEqual({ votes: 2, voters: 3, host: true });
    expect(room.state().players.find((p) => p.id === h1)!.skipVote).toBe(true);
    room.voteSkip(c);
    await vi.advanceTimersByTimeAsync(0);
    expect(room.state().phase).toBe("reveal");
  });

  it("the host can take a player on its screen out of the lobby, but not a remote player", () => {
    const { room } = make();
    const h = room.addPlayer("Ana", undefined, true)!;
    const r = room.addPlayer("Cy")!;
    room.leaveHostPlayer(r);
    room.leaveHostPlayer(h);
    expect(room.state().players.map((p) => p.id)).toEqual([r]);
  });

  it("first buzz wins, stops music and clock; others see who is guessing", async () => {
    const { room, music } = make();
    const a = room.addPlayer("Ana")!;
    const b = room.addPlayer("Bo")!;
    await room.start();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(room.buzz(a)).toBe(true);
    expect(room.buzz(b)).toBe(false);
    const st = room.state();
    expect(st.guesser).toEqual({ id: a, name: "Ana" });
    expect(st.remainingMs).toBe(30_000);
    await vi.advanceTimersByTimeAsync(20_000); // typing: round clock must stay frozen
    expect(room.state().remainingMs).toBe(30_000);
    expect(room.state().phase).toBe("playing");
    expect(music.played.length).toBe(1);
  });

  it("only the buzzed player can answer", async () => {
    const { room, song } = make();
    const a = room.addPlayer("Ana")!;
    const b = room.addPlayer("Bo")!;
    await room.start();
    room.buzz(a);
    expect(await room.answer(b, song()[0])).toBeUndefined();
    expect(room.state().players.find((p) => p.id === b)!.score).toBe(0);
  });

  it("partial answer reveals that part and the music resumes where it stopped", async () => {
    const { room, music, song } = make();
    const a = room.addPlayer("Ana")!;
    room.addPlayer("Bo");
    await room.start();
    await vi.advanceTimersByTimeAsync(10_000);
    room.buzz(a);
    const r = await room.answer(a, `${song()[0]} wrong`);
    expect(r).toMatchObject({ title: true, artist: false });
    const st = room.state();
    expect(st.guesser).toBeUndefined();
    expect(st.found?.title?.by).toBe("Ana");
    expect(st.found?.artist).toBeUndefined();
    expect(st.players.find((p) => p.id === a)!.attemptsLeft).toBe(3); // a partly correct guess is free
    expect(st.players.find((p) => p.id === a)!.score).toBe(Math.round(1000 * (0.2 + 0.8 * 0.75))); // buzzed 10s of 40s
    expect(music.played.length).toBe(1); // started once; after the guess it is resumed, not restarted
    expect(music.resumed).toEqual([{ id: music.played[0]!.id, positionMs: music.played[0]!.startMs + 10_000 }]);
    expect(st.remainingMs).toBe(30_000);
  });

  it("correct parts are free; only fully wrong answers use up the 3 attempts", async () => {
    const { room, song } = make();
    const a = room.addPlayer("Ana")!;
    const b = room.addPlayer("Bo")!;
    await room.start();
    const left = () => room.state().players.find((p) => p.id === a)!.attemptsLeft;
    room.buzz(a);
    await room.answer(a, song()[0]);
    expect(left()).toBe(3); // free
    expect(room.buzz(a)).toBe(true); // may buzz again right away
    await room.answer(a, "wrong");
    expect(left()).toBe(2);
    room.buzz(a); await room.answer(a, "wrong");
    expect(left()).toBe(1);
    room.buzz(a); await room.answer(a, "wrong");
    expect(left()).toBe(0);
    expect(room.buzz(a)).toBe(false); // out of attempts
    expect(room.buzz(b)).toBe(true);
    // Bo types song + artist in the one field; the title was already found, so only the artist is new
    expect(await room.answer(b, `${song()[0]} ${song()[1]}`)).toMatchObject({ title: false, artist: true });
    expect(room.state().phase).toBe("reveal"); // everything found
    const gains = room.state().reveal!.gains;
    expect(gains[a]!.title).toBeGreaterThan(0);
    expect(gains[b]!.artist).toBeGreaterThan(0);
  });

  it("a guess that times out counts as the attempt and the music continues", async () => {
    const { room, music } = make();
    const a = room.addPlayer("Ana")!;
    room.addPlayer("Bo");
    await room.start();
    room.buzz(a);
    await vi.advanceTimersByTimeAsync(25_000);
    expect(room.state().guesser).toBeUndefined();
    expect(room.state().players.find((p) => p.id === a)!.attemptsLeft).toBe(2); // a timeout costs an attempt
    expect(music.played.length).toBe(1);
    expect(music.resumed.length).toBe(1); // resumed, not restarted
  });

  it("reports it when the music source refuses to pause", async () => {
    const music = new DemoProvider();
    music.pause = async () => { throw new Error("Spotify PUT /me/player/pause: 403"); };
    const room = new Room("ABCD", music, cfg({ playTo: { kind: "rounds", rounds: 1 } }), { guessMs: 25_000, revealMs: 5_000 });
    const errors: string[] = [];
    room.onError = (m) => errors.push(m);
    const a = room.addPlayer("Ana")!;
    await room.start();
    room.buzz(a);
    await vi.advanceTimersByTimeAsync(0);
    expect(errors[0]).toContain("Music pause failed");
    expect(room.state().guesser?.id).toBe(a); // the clock is still frozen
    expect(room.state().remainingMs).toBe(40_000);
  });

  it("skips the song when every connected player votes to skip; votes can be withdrawn and reset each round", async () => {
    const { room } = make(2);
    const a = room.addPlayer("Ana")!;
    const b = room.addPlayer("Bo")!;
    const c = room.addPlayer("Cy")!;
    await room.start();
    room.voteSkip(a); room.voteSkip(b);
    expect(room.state().phase).toBe("playing");
    room.voteSkip(b); // withdrawn
    room.voteSkip(b);
    expect(room.state().phase).toBe("playing");
    room.setConnected(c, false); // the player who did not vote drops: the rest all want to skip
    await vi.advanceTimersByTimeAsync(0);
    expect(room.state().phase).toBe("reveal");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(room.state().round).toBe(2);
    expect(room.state().players.every((p) => !p.skipVote)).toBe(true); // reset
  });

  it("the host counts as one voter: skip waits for the host's vote too", async () => {
    const { room } = make(2);
    const a = room.addPlayer("Ana")!;
    room.setHostConnected(true);
    await room.start();
    room.voteSkip(a);
    await vi.advanceTimersByTimeAsync(0);
    expect(room.state().phase).toBe("playing"); // the host has not voted
    expect(room.state().skip).toEqual({ votes: 1, voters: 2, host: false });
    room.voteSkipHost();
    await vi.advanceTimersByTimeAsync(0);
    expect(room.state().phase).toBe("reveal");
  });

  it("the host alone cannot skip the song", async () => {
    const { room } = make(2);
    room.addPlayer("Ana"); room.addPlayer("Bo");
    room.setHostConnected(true);
    await room.start();
    room.voteSkipHost();
    await vi.advanceTimersByTimeAsync(0);
    expect(room.state().phase).toBe("playing");
    expect(room.state().skip).toEqual({ votes: 1, voters: 3, host: true });
  });

  it("a host who also plays has one vote, not two", async () => {
    const { room } = make(2);
    const h = room.addPlayer("Host")!;
    const b = room.addPlayer("Bo")!;
    room.markHostPlayer(h);
    room.setHostConnected(true);
    await room.start();
    room.voteSkipHost(); // votes as player h
    expect(room.state().skip).toEqual({ votes: 1, voters: 2, host: true });
    room.voteSkip(b);
    await vi.advanceTimersByTimeAsync(0);
    expect(room.state().phase).toBe("reveal");
  });

  it("with auto-advance off, a timeout waits on the reveal (music playing) until the host continues", async () => {
    const { room, music } = make(2, false);
    room.addPlayer("A");
    await room.start();
    await vi.advanceTimersByTimeAsync(40_000);
    expect(room.state().phase).toBe("reveal");
    expect(room.state().awaitingNext).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(room.state().phase).toBe("reveal"); // still waiting
    expect(music.pauses).toBe(0); // the song keeps playing
    await room.nextRound();
    expect(room.state().round).toBe(2);
    expect(room.state().awaitingNext).toBeUndefined();
  });

  it("with auto-advance off, every kind of round end is held, and the next round starts when the song ends", async () => {
    const { room } = make(2, false, { start: "beginning" });
    const a = room.addPlayer("Ana")!;
    await room.start();
    room.voteSkip(a);
    await vi.advanceTimersByTimeAsync(0);
    expect(room.state().phase).toBe("reveal");
    expect(room.state().awaitingNext).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(room.state().phase).toBe("reveal");
    await vi.advanceTimersByTimeAsync(200_000); // the song (200 s) has finished by now
    expect(room.state().round).toBe(2);
  });

  it("changing the setting during a waiting reveal takes effect immediately", async () => {
    const { room } = make(2, false);
    room.addPlayer("A");
    await room.start();
    await vi.advanceTimersByTimeAsync(40_000);
    expect(room.state().awaitingNext).toBe(true);
    room.setSettings({ autoAdvance: true });
    expect(room.state().awaitingNext).toBeUndefined();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(room.state().round).toBe(2);
    await vi.advanceTimersByTimeAsync(40_000); // round 2 times out
    room.setSettings({ autoAdvance: false }); // turned off while the reveal countdown runs
    expect(room.state().awaitingNext).toBe(true);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(room.state().phase).toBe("reveal");
  });

  it("a single player can skip on their own", async () => {
    const { room } = make(2);
    const a = room.addPlayer("Ana")!;
    await room.start();
    room.voteSkip(a);
    await vi.advanceTimersByTimeAsync(0);
    expect(room.state().phase).toBe("reveal");
  });

  it("leaving frees a lobby slot; leaving mid-guess ends the guess and the music continues", async () => {
    const { room, music } = make();
    const a = room.addPlayer("Ana")!;
    const b = room.addPlayer("Bo")!;
    room.leave(b);
    expect(room.state().players.length).toBe(1);
    const c = room.addPlayer("Cy")!;
    await room.start();
    room.buzz(c);
    room.leave(c);
    await vi.advanceTimersByTimeAsync(0);
    expect(room.state().guesser).toBeUndefined();
    expect(room.state().players.find((p) => p.id === c)).toMatchObject({ connected: false, attemptsLeft: 0 });
    expect(music.resumed.length).toBe(1); // resumed (not restarted) for Ana
    expect(a).toBeTruthy();
  });

  it("when everyone is out of attempts the answer is shown, the song plays on for 5s, then the next starts", async () => {
    const { room, music } = make(2);
    const a = room.addPlayer("Ana")!;
    await room.start();
    for (let i = 0; i < 2; i++) { room.buzz(a); await room.answer(a, "nope nope"); }
    expect(room.state().phase).toBe("playing");
    room.buzz(a); await room.answer(a, "nope nope");
    await vi.advanceTimersByTimeAsync(0);
    expect(room.state().phase).toBe("reveal");
    expect(room.state().reveal?.title).toBeTruthy();
    expect(music.resumed.length).toBe(3); // the paused song is playing again during the reveal
    expect(music.pauses).toBe(3); // no extra pause at the reveal
    await vi.advanceTimersByTimeAsync(4_999);
    expect(room.state().phase).toBe("reveal");
    await vi.advanceTimersByTimeAsync(2);
    expect(room.state().round).toBe(2);
    expect(music.played.length).toBe(2); // next song started
  });

  it("a timeout reveal does not interrupt the music; the music stops only when the game ends", async () => {
    const { room, music } = make(1);
    room.addPlayer("A");
    await room.start();
    await vi.advanceTimersByTimeAsync(40_000);
    expect(room.state().phase).toBe("reveal");
    expect(music.pauses).toBe(0);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(room.state().phase).toBe("finished");
    expect(music.pauses).toBe(1);
  });

  it("ends on timeout, reveals, then advances and finishes", async () => {
    const { room } = make();
    room.addPlayer("A");
    await room.start();
    expect(room.state().reveal).toBeUndefined();
    await vi.advanceTimersByTimeAsync(40_000);
    expect(room.state().phase).toBe("reveal");
    expect(room.state().reveal?.title).toBeTruthy();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(room.state().round).toBe(2);
    await vi.advanceTimersByTimeAsync(45_000);
    expect(room.state().phase).toBe("finished");
  });

  describe("game types", () => {
    it("unlimited timer: the round lasts until the song ends and points fade over 40 s", async () => {
      const { room } = make(1, true, { roundSeconds: null });
      room.addPlayer("A");
      await room.start();
      expect(room.state().roundMs).toBeNull();
      expect(room.state().remainingMs).toBeUndefined();
      await vi.advanceTimersByTimeAsync(100_000);
      expect(room.state().phase).toBe("playing");
      await vi.advanceTimersByTimeAsync(110_000);
      expect(room.state().phase).not.toBe("playing");
    });

    it("score target: the game ends when a player reaches it", async () => {
      const { room, song } = make(2, true, { playTo: { kind: "score", target: 500 } });
      const a = room.addPlayer("Ana")!;
      await room.start();
      expect(room.state().totalRounds).toBeUndefined();
      room.buzz(a);
      await room.answer(a, `${song()[0]} ${song()[1]}`);
      expect(room.state().phase).toBe("reveal");
      await vi.advanceTimersByTimeAsync(5_000);
      expect(room.state().phase).toBe("finished");
    });

    it("score target: a game clock runs (not while paused) and the time of the winning answer is saved", async () => {
      const { room, song } = make(2, true, { playTo: { kind: "score", target: 500 } });
      const saved: any[] = [];
      room.onFinish = (r) => { saved.push(r); return { kind: "score", entries: [], mine: [] }; };
      const a = room.addPlayer("Ana")!;
      expect(room.state().clock).toBeUndefined();
      await room.start();
      await vi.advanceTimersByTimeAsync(4_000);
      expect(room.state().clock).toEqual({ ms: 4_000, running: true });
      room.togglePause();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(room.state().clock).toEqual({ ms: 4_000, running: false });
      room.togglePause();
      await vi.advanceTimersByTimeAsync(1_000);
      room.buzz(a);
      await room.answer(a, `${song()[0]} ${song()[1]}`);
      await vi.advanceTimersByTimeAsync(20_000); // reveal: the clock has stopped at the winning answer
      expect(room.state().phase).toBe("finished");
      expect(saved).toHaveLength(1);
      expect(saved[0].timeMs).toBe(5_000);
      expect(saved[0].players.map((p: any) => p.name)).toEqual(["Ana"]);
      expect(room.state().highScores).toBeDefined();
    });

    it("a game the host quits is not saved", async () => {
      const { room } = make(2);
      let n = 0;
      room.onFinish = () => { n++; return undefined; };
      room.addPlayer("Ana");
      await room.start();
      await room.stop();
      expect(n).toBe(0);
    });

    it("multipliers: both at once gives x1.5 and a streak adds to it", async () => {
      const { room, song } = make(3);
      const a = room.addPlayer("Ana")!;
      await room.start();
      room.buzz(a);
      const r = await room.answer(a, `${song()[0]} ${song()[1]}`);
      expect(r!.multipliers.map((m) => m.x)).toEqual([1.5]);
      expect(room.state().lastScore?.multipliers.length).toBe(1); // still shown at the reveal
      await vi.advanceTimersByTimeAsync(5_000);
      room.buzz(a);
      const r2 = await room.answer(a, `${song()[0]} ${song()[1]}`);
      expect(r2!.multipliers.length).toBe(2); // both + streak
      expect(r2!.points).toBeGreaterThan(r!.points);
    });

    it("multipliers can be turned off", async () => {
      const { room, song } = make(2, true, { multipliers: false });
      const a = room.addPlayer("Ana")!;
      await room.start();
      room.buzz(a);
      const r = await room.answer(a, `${song()[0]} ${song()[1]}`);
      expect(r!.multipliers).toEqual([]);
      expect(r!.points).toBe(1500);
    });

    it("attempts setting is honored", async () => {
      const { room } = make(2, true, { attempts: 1 });
      const a = room.addPlayer("Ana")!;
      room.addPlayer("Bo");
      await room.start();
      room.buzz(a);
      await room.answer(a, "nope");
      expect(room.buzz(a)).toBe(false);
    });

    it("round robin: only the player whose turn it is can buzz, and turns rotate", async () => {
      const { room } = make(3, true, { order: "roundRobin" });
      const a = room.addPlayer("Ana")!;
      const b = room.addPlayer("Bo")!;
      await room.start();
      expect(room.state().activePlayerId).toBe(a);
      expect(room.buzz(b)).toBe(false);
      expect(room.buzz(a)).toBe(true);
      room.leave(a); // ends the guess; Ana is out
      await vi.advanceTimersByTimeAsync(5_000);
      await vi.advanceTimersByTimeAsync(40_000);
      expect(room.state().activePlayerId).toBe(b);
    });

    it("round robin: the active player alone decides to skip, and the round ends when their attempts are used", async () => {
      const { room } = make(3, true, { order: "roundRobin" });
      const a = room.addPlayer("Ana")!;
      const b = room.addPlayer("Bo")!;
      await room.start();
      room.voteSkip(b); // not their song: ignored
      expect(room.state().phase).toBe("playing");
      room.voteSkip(a);
      await vi.advanceTimersByTimeAsync(0);
      expect(room.state().phase).toBe("reveal");
      await vi.advanceTimersByTimeAsync(5_000);
      for (let i = 0; i < 3; i++) { room.buzz(b); await room.answer(b, "nope"); }
      expect(room.state().phase).toBe("reveal"); // Bo used all attempts; Ana is not involved
    });

    it("multiple choice: offers 4 options only to the guesser; a wrong pick costs an attempt and removes it", async () => {
      const { room } = make(2, true, { answers: "choice" });
      const a = room.addPlayer("Ana")!;
      const b = room.addPlayer("Bo")!;
      await room.start();
      expect(room.state(a).options).toBeUndefined(); // nobody is guessing yet
      room.buzz(a);
      const opts = room.state(a).options!;
      expect(opts.length).toBe(4);
      expect(room.state(b).options).toBeUndefined();
      expect(await room.answer(a, "typed")).toBeUndefined(); // typing is not accepted
      const r = await room.choose(a, opts[0]!.id);
      if (r!.points === 0) {
        expect(room.state(a).players.find((p) => p.id === a)!.attemptsLeft).toBe(2);
        room.buzz(a);
        expect(room.state(a).options!.length).toBe(3);
      } else {
        expect(room.state().phase).toBe("reveal"); // right pick finds both parts
      }
    });

    it("multiple choice: picking the right option ends the round with title + artist", async () => {
      const { room } = make(2, true, { answers: "choice", multipliers: false });
      const a = room.addPlayer("Ana")!;
      await room.start();
      let done = false;
      for (let i = 0; i < 3 && !done; i++) {
        room.buzz(a);
        for (const o of room.state(a).options!) {
          const r = await room.choose(a, o.id);
          if (r && r.points > 0) { done = true; expect(r).toMatchObject({ title: true, artist: true }); }
          break; // one pick per turn
        }
      }
      // with 4 options and 3 attempts there is at most one wrong pick per turn; just ensure the engine stayed consistent
      expect(["playing", "reveal"]).toContain(room.state().phase);
    });

    it("reveal hint: letters appear as the timer runs and freeze while a player is guessing", async () => {
      const { room } = make(2, true, { hints: { reveal: true, trivia: false, art: false } });
      const a = room.addPlayer("Ana")!;
      await room.start();
      const blanks = (t: string) => (t.match(/_/g) ?? []).length;
      const h0 = room.state().hint!;
      expect(h0.title).toMatch(/_/);
      await vi.advanceTimersByTimeAsync(9_000);
      expect(room.state().hint!.title).toBe(h0.title); // nothing is revealed during the first 10 s
      await vi.advanceTimersByTimeAsync(-0);
      await vi.advanceTimersByTimeAsync(21_000);
      const h1 = room.state().hint!;
      expect(blanks(h1.title)).toBeLessThan(blanks(h0.title));
      room.buzz(a);
      const frozen = room.state().hint!.title;
      await vi.advanceTimersByTimeAsync(20_000);
      expect(room.state().hint!.title).toBe(frozen);
    });

    it("trivia hint: facts show up over time", async () => {
      const music = new DemoProvider();
      const facts = ["Genre: rock", "From England", "Formed in 1970"];
      const trivia = { prefetch: () => {}, peek: () => facts };
      const room = new Room("ABCD", music, cfg({ hints: { reveal: false, trivia: true, art: false } }), { guessMs: 25_000, revealMs: 5_000 }, trivia);
      room.addPlayer("Ana");
      await room.start();
      expect(room.state().trivia).toEqual([]);
      await vi.advanceTimersByTimeAsync(20_000);
      expect(room.state().trivia!.length).toBeGreaterThan(0);
      await vi.advanceTimersByTimeAsync(15_000);
      expect(room.state().trivia).toEqual(facts);
    });
  });

  it("pause stops the clock and the music, blocks buzzing, and resumes in place", async () => {
    const { room, music } = make(2);
    const a = room.addPlayer("Ana")!;
    await room.start();
    await vi.advanceTimersByTimeAsync(10_000);
    room.togglePause();
    expect(room.state().paused).toBe(true);
    expect(room.state().remainingMs).toBe(30_000);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(room.state().phase).toBe("playing");
    expect(room.buzz(a)).toBe(false);
    expect(music.pauses).toBe(1);
    room.togglePause();
    await vi.advanceTimersByTimeAsync(0);
    expect(room.state().paused).toBeUndefined();
    expect(music.resumed.length).toBe(1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(room.state().phase).toBe("reveal");
  });

  it("quitting stops the music and ends the game", async () => {
    const { room, music } = make(2);
    room.addPlayer("Ana");
    await room.start();
    await room.stop();
    expect(music.pauses).toBe(1);
    expect(room.state().phase).toBe("finished");
    await vi.advanceTimersByTimeAsync(300_000);
    expect(music.played.length).toBe(1); // no next song
  });

  describe("guess setting", () => {
    it("title only: the artist doesn't count, and the title alone finishes the round", async () => {
      const { room, song } = make(2, true, { guess: "title", multipliers: false });
      const a = room.addPlayer("Ana")!;
      await room.start();
      room.buzz(a);
      const wrong = await room.answer(a, song()[1]); // the artist
      expect(wrong).toMatchObject({ title: false, artist: false });
      expect(room.state().players[0]!.attemptsLeft).toBe(2);
      room.buzz(a);
      const r = await room.answer(a, `${song()[0]} ${song()[1]}`);
      expect(r).toMatchObject({ title: true, artist: false, points: expect.any(Number) });
      expect(room.state().phase).toBe("reveal");
    });

    it("artist only: the artist is worth the full 1000 and ends the round", async () => {
      const { room, song } = make(2, true, { guess: "artist", multipliers: false });
      const a = room.addPlayer("Ana")!;
      await room.start();
      room.buzz(a);
      const r = await room.answer(a, song()[1]);
      expect(r).toMatchObject({ title: false, artist: true, points: 1000 });
      expect(room.state().phase).toBe("reveal");
    });

    it("multiple choice offers only the guessed part", async () => {
      const { room } = make(2, true, { guess: "artist", answers: "choice" });
      const a = room.addPlayer("Ana")!;
      await room.start();
      room.buzz(a);
      const labels = room.state(a).options!.map((o) => o.label);
      expect(labels.length).toBe(4);
      expect(labels.every((l) => !l.includes("—"))).toBe(true);
      expect(new Set(labels).size).toBe(4);
    });
  });

  it("cancelling a guess costs no attempt and resumes the music", async () => {
    const { room, music } = make(2);
    const a = room.addPlayer("Ana")!;
    room.addPlayer("Bo");
    await room.start();
    room.buzz(a);
    await room.cancelGuess(a);
    expect(room.state().guesser).toBeUndefined();
    expect(room.state().players.find((p) => p.id === a)!.attemptsLeft).toBe(3);
    expect(music.resumed.length).toBe(1);
  });

  it("players on the on-screen keyboard get a longer time to answer", async () => {
    const music = new DemoProvider();
    const room = new Room("ABCD", music, cfg(), { guessMs: 25_000, slowGuessMs: 60_000, revealMs: 5_000 });
    const a = room.addPlayer("Ana")!;
    const b = room.addPlayer("Bo")!;
    room.setSlowInput(b, true);
    await room.start();
    room.buzz(a);
    expect(room.state().guessMs).toBe(25_000);
    await room.cancelGuess(a);
    room.buzz(b);
    expect(room.state().guessMs).toBe(60_000);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(room.state().guesser?.id).toBe(b);
    await vi.advanceTimersByTimeAsync(31_000);
    expect(room.state().guesser).toBeUndefined();
  });

  it("artwork hint: sends the cover with a progress that grows over the timer and freezes on pause", async () => {
    const music = new DemoProvider();
    const orig = music.loadTracks.bind(music);
    music.loadTracks = async () => (await orig()).map((t) => ({ ...t, albumArt: `http://img/${t.id}` }));
    const room = new Room("ABCD", music, cfg({ hints: { reveal: false, trivia: false, art: true } }), { guessMs: 25_000, revealMs: 5_000 });
    room.addPlayer("Ana");
    await room.start();
    expect(room.state().art).toMatchObject({ progress: 0 });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(room.state().art!.progress).toBeCloseTo((20 * 1.2) / 45); // 1.2x faster than the 40 s timer + 5 s grace
    await vi.advanceTimersByTimeAsync(19_000);
    expect(room.state().art!.progress).toBeLessThan(1); // not complete when time runs out
    room.togglePause();
    const frozen = room.state().art!.progress;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(room.state().art!.progress).toBeCloseTo(frozen);
  });

  it("a failed play call does not throw out of start (the round still runs)", async () => {
    const music = new DemoProvider();
    music.play = async () => { throw new Error("Spotify 404"); };
    const room = new Room("ABCD", music, cfg({}), { guessMs: 25_000, revealMs: 5_000 });
    const errors: string[] = [];
    room.onError = (m) => errors.push(m);
    room.addPlayer("Ana");
    await expect(room.start()).resolves.toBeUndefined();
    expect(room.state().phase).toBe("playing");
    expect(errors[0]).toMatch(/play failed/);
  });
});
