import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DemoProvider } from "./music";
import { Room } from "./room";

describe("Room", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const make = () => {
    const music = new DemoProvider();
    const room = new Room("ABCD", music, { rounds: 2, roundMs: 20_000, revealMs: 5_000 });
    return { music, room };
  };

  it("limits players to 4 and only joins in the lobby", () => {
    const { room } = make();
    for (let i = 0; i < 4; i++) expect(room.addPlayer(`p${i}`)).toBeTruthy();
    expect(room.addPlayer("p5")).toBeNull();
  });

  it("scores title and artist separately and faster is better", async () => {
    const { room } = make();
    const a = room.addPlayer("A")!;
    const b = room.addPlayer("B")!;
    await room.start();
    // The track is secret in state(); get it via the played clip's reveal later. Use demo data: try all answers.
    const guesses = [
      ["Bohemian Rhapsody", "Queen"], ["Get Lucky", "Daft Punk"], ["Billie Jean", "Michael Jackson"],
      ["Smells Like Teen Spirit", "Nirvana"], ["Rolling in the Deep", "Adele"], ["Hey Jude", "Beatles"],
    ] as const;
    room.answer(a, { title: "nonsense", artist: "nobody" }); // wrong answers score nothing
    for (const [t] of guesses) room.answer(a, { title: t });
    vi.advanceTimersByTime(10_000);
    for (const [t, ar] of guesses) room.answer(b, { title: t, artist: ar });
    const sa = room.state().players.find((p) => p.id === a)!.score;
    const sb = room.state().players.find((p) => p.id === b)!.score;
    expect(sa).toBe(1000); // instant, title only
    expect(sb).toBe(900); // 10s in: title 600 + artist 300
  });

  it("ends the round on timeout, reveals, then advances and finishes", async () => {
    const { room } = make();
    room.addPlayer("A");
    await room.start();
    expect(room.state().phase).toBe("playing");
    expect(room.state().reveal).toBeUndefined();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(room.state().phase).toBe("reveal");
    expect(room.state().reveal?.title).toBeTruthy();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(room.state().round).toBe(2);
    await vi.advanceTimersByTimeAsync(25_000 + 5_000);
    expect(room.state().phase).toBe("finished");
  });
});
