import { expect, it } from "vitest";
import { pointsFor } from "./scoring";

it("awards max for an instant answer, floor at the deadline, 0 after", () => {
  expect(pointsFor(1000, 0, 20000)).toBe(1000);
  expect(pointsFor(1000, 20000, 20000)).toBe(200);
  expect(pointsFor(1000, 20001, 20000)).toBe(0);
  expect(pointsFor(1000, 10000, 20000)).toBe(600);
});
