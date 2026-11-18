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

  const make = (rounds = 2) => {
    const music = new DemoProvider();
    const room = new Room("ABCD", music, { rounds, roundMs: 40_000, guessMs: 25_000, maxAttempts: 3, revealMs: 5_000 });
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
    expect(await room.answer(b, { title: song()[0] })).toBeUndefined();
    expect(room.state().players.find((p) => p.id === b)!.score).toBe(0);
  });

  it("partial answer reveals that part and the music resumes where it stopped", async () => {
    const { room, music, song } = make();
    const a = room.addPlayer("Ana")!;
    room.addPlayer("Bo");
    await room.start();
    await vi.advanceTimersByTimeAsync(10_000);
    room.buzz(a);
    const r = await room.answer(a, { title: song()[0], artist: "wrong" });
    expect(r).toEqual({ title: true, artist: false });
    const st = room.state();
    expect(st.guesser).toBeUndefined();
    expect(st.found?.title?.by).toBe("Ana");
    expect(st.found?.artist).toBeUndefined();
    expect(st.players.find((p) => p.id === a)!.attemptsLeft).toBe(3); // a partly correct guess is free
    expect(st.players.find((p) => p.id === a)!.score).toBe(Math.round(1000 * (0.2 + 0.8 * 0.75))); // buzzed 10s of 40s
    expect(music.played.length).toBe(2);
    expect(music.played[1]!.startMs - music.played[0]!.startMs).toBe(10_000);
    expect(st.remainingMs).toBe(30_000);
  });

  it("correct parts are free; only fully wrong answers use up the 3 attempts", async () => {
    const { room, song } = make();
    const a = room.addPlayer("Ana")!;
    const b = room.addPlayer("Bo")!;
    await room.start();
    const left = () => room.state().players.find((p) => p.id === a)!.attemptsLeft;
    room.buzz(a);
    await room.answer(a, { title: song()[0] });
    expect(left()).toBe(3); // free
    expect(room.buzz(a)).toBe(true); // may buzz again right away
    await room.answer(a, { artist: "wrong" });
    expect(left()).toBe(2);
    room.buzz(a); await room.answer(a, { artist: "wrong" });
    expect(left()).toBe(1);
    room.buzz(a); await room.answer(a, { artist: "wrong" });
    expect(left()).toBe(0);
    expect(room.buzz(a)).toBe(false); // out of attempts
    expect(room.buzz(b)).toBe(true);
    // Bo only needs the artist; sending the title again is ignored
    expect(await room.answer(b, { title: "x", artist: song()[1] })).toEqual({ title: false, artist: true });
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
    expect(music.played.length).toBe(2);
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
    expect(room.state().guesser).toBeUndefined();
    expect(room.state().players.find((p) => p.id === c)).toMatchObject({ connected: false, attemptsLeft: 0 });
    expect(music.played.length).toBe(2); // resumed for Ana
    expect(a).toBeTruthy();
  });

  it("round ends when every player is out of attempts", async () => {
    const { room } = make();
    const a = room.addPlayer("Ana")!;
    await room.start();
    for (let i = 0; i < 2; i++) { room.buzz(a); await room.answer(a, { title: "nope", artist: "nope" }); }
    expect(room.state().phase).toBe("playing");
    room.buzz(a); await room.answer(a, { title: "nope", artist: "nope" });
    expect(room.state().phase).toBe("reveal");
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
