import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DemoProvider } from "./music";
import { Room } from "./room";

const SONGS: Record<string, [string, string]> = {
  demo1: ["Bohemian Rhapsody", "Queen"], demo2: ["Get Lucky", "Daft Punk"], demo3: ["Billie Jean", "Michael Jackson"],
  demo4: ["Smells Like Teen Spirit", "Nirvana"], demo5: ["Rolling in the Deep", "Adele"], demo6: ["Hey Jude", "The Beatles"],
};

describe("Room (buzzer game)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const make = (rounds = 2, autoAdvance = true) => {
    const music = new DemoProvider();
    const room = new Room("ABCD", music, { rounds, roundMs: 40_000, guessMs: 25_000, maxAttempts: 3, revealMs: 5_000, autoAdvance });
    const song = () => SONGS[music.played.at(-1)!.id]!;
    return { music, room, song };
  };

  it("limits players to 4 and only joins in the lobby", () => {
    const { room } = make();
    for (let i = 0; i < 4; i++) expect(room.addPlayer(`p${i}`)).toBeTruthy();
    expect(room.addPlayer("p5")).toBeNull();
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
    expect(r).toEqual({ title: true, artist: false });
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
    expect(await room.answer(b, `${song()[0]} ${song()[1]}`)).toEqual({ title: false, artist: true });
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
    const room = new Room("ABCD", music, { rounds: 1, roundMs: 40_000, guessMs: 25_000, maxAttempts: 3, revealMs: 5_000, autoAdvance: true });
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

  it("with auto-advance off, other round endings still advance by themselves", async () => {
    const { room } = make(2, false);
    const a = room.addPlayer("Ana")!;
    await room.start();
    room.voteSkip(a);
    await vi.advanceTimersByTimeAsync(0);
    expect(room.state().phase).toBe("reveal");
    expect(room.state().awaitingNext).toBeUndefined();
    await vi.advanceTimersByTimeAsync(5_000);
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
});
