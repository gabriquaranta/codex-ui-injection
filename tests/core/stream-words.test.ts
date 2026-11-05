import { afterEach, expect, it, vi } from "vitest";
import { observeStreamWords } from "../../src/core/stream-words.js";

afterEach(() => vi.useRealTimers());

it("reports completed and trailing words and stops after cleanup", async () => {
  vi.useFakeTimers();
  const root = document.createElement("div");
  const text = document.createTextNode("");
  root.append(text);
  const batches: string[][] = [];
  const stop = observeStreamWords(root, (words) => {
    batches.push(words.map(({ word, range }) => {
      expect(range.toString()).toBe(word);
      return word;
    }));
  });

  text.data = "A longer";
  await vi.advanceTimersByTimeAsync(0);
  expect(batches).toEqual([["A"]]);
  text.data += " word";
  await vi.advanceTimersByTimeAsync(0);
  expect(batches).toEqual([["A"], ["longer"]]);
  await vi.advanceTimersByTimeAsync(180);
  expect(batches).toEqual([["A"], ["longer"], ["word"]]);
  stop();
  text.data += " ignored ";
  await vi.advanceTimersByTimeAsync(180);
  expect(batches).toHaveLength(3);
});
