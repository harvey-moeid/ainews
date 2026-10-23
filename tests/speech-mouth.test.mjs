import test from "node:test";
import assert from "node:assert/strict";
import {
  createSpeechMouth,
  CLOSED_MOUTH,
} from "../src/overlay2/speech-mouth.js";
import { speakBrowser } from "../src/overlay2/audio.js";

function clock(t) {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
  // Advance in small steps so each newly scheduled frame receives its own time.
  return (ms) => {
    for (let i = 0; i < ms; i++) t.mock.timers.tick(1);
  };
}

test("real word boundaries select vowels, close between words and wait through silence", (t) => {
  const tick = clock(t),
    frames = [];
  const mouth = createSpeechMouth("A I U E O", 1, (pose) => frames.push(pose));
  mouth.start();
  const shapes = [];
  for (const [index, vowel] of ["A", "I", "U", "E", "O"].entries()) {
    mouth.boundary({ name: "word", charIndex: index * 2 });
    assert.equal(frames.at(-1).vowel, vowel);
    shapes.push([frames.at(-1).level, frames.at(-1).width]);
    tick(65);
    assert.deepEqual(frames.at(-1), CLOSED_MOUTH);
    const count = frames.length;
    tick(500);
    assert.equal(
      frames.length,
      count,
      "No estimated next word during an actual speech gap",
    );
  }
  assert.equal(new Set(shapes.map(JSON.stringify)).size, 5);
  mouth.stop();
});

test("no boundary events use a finite text timeline with punctuation pauses and rate", (t) => {
  const tick = clock(t),
    frames = [];
  const mouth = createSpeechMouth("A, O", 2, (pose) => frames.push(pose));
  mouth.start();
  assert.equal(frames.at(-1).vowel, "A");
  tick(33);
  assert.equal(frames.at(-1).level, 0);
  tick(99);
  assert.equal(frames.at(-1).level, 0);
  tick(1);
  assert.equal(frames.at(-1).vowel, "O");
  tick(1000);
  assert.deepEqual(frames.at(-1), CLOSED_MOUTH);
  const count = frames.length;
  tick(1000);
  assert.equal(frames.length, count);
  mouth.stop();
});

test("pause closes immediately, resume preserves the current letter, stop ignores late events", (t) => {
  const tick = clock(t),
    frames = [];
  const mouth = createSpeechMouth("ai", 1, (pose) => frames.push(pose));
  mouth.start();
  tick(20);
  mouth.pause();
  assert.deepEqual(frames.at(-1), CLOSED_MOUTH);
  tick(2000);
  mouth.boundary({ name: "word", charIndex: 0 });
  assert.deepEqual(frames.at(-1), CLOSED_MOUTH);
  mouth.resume();
  assert.equal(frames.at(-1).vowel, "A");
  tick(45);
  assert.equal(frames.at(-1).vowel, "I");
  mouth.stop();
  const count = frames.length;
  mouth.start();
  mouth.resume();
  mouth.boundary({ name: "word", charIndex: 0 });
  tick(1000);
  assert.equal(frames.length, count);
  assert.deepEqual(frames.at(-1), CLOSED_MOUTH);
});

function browser(t) {
  clock(t);
  let utterance,
    cancelled = 0;
  const originalWindow = globalThis.window;
  const originalSpeech = globalThis.speechSynthesis;
  const originalUtterance = globalThis.SpeechSynthesisUtterance;
  const speech = {
    getVoices: () => [],
    speak: (value) => {
      utterance = value;
    },
    cancel: () => {
      cancelled++;
    },
  };
  globalThis.window = { speechSynthesis: speech };
  globalThis.speechSynthesis = speech;
  globalThis.SpeechSynthesisUtterance = class {
    constructor(text) {
      this.text = text;
    }
  };
  t.after(() => {
    for (const [name, value] of [
      ["window", originalWindow],
      ["speechSynthesis", originalSpeech],
      ["SpeechSynthesisUtterance", originalUtterance],
    ]) {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    }
  });
  return {
    speech,
    get utterance() {
      return utterance;
    },
    get cancelled() {
      return cancelled;
    },
  };
}

test("browser events drive the mouth and completion closes it; late start cannot reopen it", async (t) => {
  const env = browser(t),
    frames = [];
  const result = speakBrowser(
    "A O",
    {},
    new AbortController().signal,
    (level, pose) => frames.push(pose),
  );
  assert.equal(frames.length, 0, "No motion while speech is queued");
  env.utterance.onstart();
  env.utterance.onboundary({ name: "word", charIndex: 2 });
  assert.equal(frames.at(-1).vowel, "O");
  env.utterance.onpause();
  assert.equal(frames.at(-1).level, 0);
  env.utterance.onresume();
  assert.equal(frames.at(-1).vowel, "O");
  env.utterance.onend();
  await result;
  assert.equal(frames.at(-1).level, 0);
  const count = frames.length;
  env.utterance.onstart();
  env.utterance.onboundary({ name: "word", charIndex: 0 });
  t.mock.timers.tick(5000);
  assert.equal(frames.length, count);
});

for (const mode of [
  "abort",
  "error",
  "timeout",
  "throw",
  "abort-before-start",
]) {
  test(`browser ${mode} closes the mouth and clears pending animation`, async (t) => {
    const env = browser(t),
      frames = [],
      controller = new AbortController();
    if (mode === "throw")
      env.speech.speak = () => {
        throw Error("Unavailable");
      };
    const result = speakBrowser(
      "A I U E O",
      {},
      controller.signal,
      (level, pose) => frames.push(pose),
    );
    const rejection = assert.rejects(
      result,
      mode.startsWith("abort")
        ? { name: "AbortError" }
        : /gagal|tidak selesai|Unavailable/,
    );
    if (mode !== "throw") {
      if (mode !== "abort-before-start") env.utterance.onstart();
      if (mode.startsWith("abort")) controller.abort();
      else if (mode === "error")
        env.utterance.onerror({ error: "synthesis-failed" });
      else t.mock.timers.tick(120000);
    }
    await rejection;
    assert.equal(frames.at(-1).level, 0);
    const count = frames.length;
    env.utterance?.onstart();
    env.utterance?.onboundary({ name: "word", charIndex: 0 });
    t.mock.timers.tick(5000);
    assert.equal(frames.length, count);
    if (mode.startsWith("abort") || mode === "timeout")
      assert.equal(env.cancelled, 1);
  });
}
