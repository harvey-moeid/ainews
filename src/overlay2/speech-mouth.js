// Browser speech exposes word boundaries, not audio samples or phoneme timings.
// Re-anchor this estimated letter timeline at each real word boundary.
export const CLOSED_MOUTH = Object.freeze({ vowel: null, level: 0, width: 1 });
const VOWELS = {
  a: { vowel: "A", level: 0.9, width: 1.05 },
  i: { vowel: "I", level: 0.3, width: 1.25 },
  u: { vowel: "U", level: 0.4, width: 0.55 },
  e: { vowel: "E", level: 0.5, width: 1.15 },
  o: { vowel: "O", level: 0.7, width: 0.7 },
};
const CONSONANT = { vowel: null, level: 0.15, width: 0.95 };

export function createSpeechMouth(text, rate, onFrame) {
  const speed = Math.max(0.5, Math.min(2, Number(rate) || 1));
  const words = [...text.matchAll(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)];
  const frames = [],
    starts = [];
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    starts.push(frames.length);
    const letters = [
      ...word[0].normalize("NFD").replace(/\p{M}/gu, "").toLowerCase(),
    ];
    for (const letter of letters)
      frames.push({
        pose:
          VOWELS[letter] || (/[mbp]/.test(letter) ? CLOSED_MOUTH : CONSONANT),
        duration: 65 / speed,
      });
    const gap = text.slice(
      word.index + word[0].length,
      words[i + 1]?.index ?? text.length,
    );
    frames.push({
      pose: CLOSED_MOUTH,
      duration:
        (/[.!?\n]/.test(gap) ? 320 : /[,;:]/.test(gap) ? 200 : 70) / speed,
    });
  }
  let timer,
    cursor = 0,
    due = 0,
    remaining = 0,
    paused = false,
    stopped = false,
    wordEnd = frames.length;
  function show(duration = frames[cursor]?.duration) {
    clearTimeout(timer);
    if (stopped || paused) return;
    const frame = cursor < wordEnd ? frames[cursor] : null;
    onFrame(frame?.pose || CLOSED_MOUTH);
    if (!frame) return;
    remaining = duration;
    due = Date.now() + duration;
    timer = setTimeout(() => {
      cursor++;
      show();
    }, duration);
  }
  return {
    start() {
      show();
    },
    boundary(event) {
      if (stopped || paused || (event.name && event.name !== "word")) return;
      if (!Number.isInteger(event.charIndex) || event.charIndex < 0) return;
      const index = words.findIndex(
        (word) =>
          event.charIndex >= word.index &&
          event.charIndex < word.index + word[0].length,
      );
      if (index < 0) return;
      cursor = starts[index];
      // With word events, stay closed until the next real word starts.
      wordEnd = (starts[index + 1] ?? frames.length) - 1;
      show();
    },
    pause() {
      if (stopped || paused) return;
      paused = true;
      remaining = Math.max(0, due - Date.now());
      clearTimeout(timer);
      onFrame(CLOSED_MOUTH);
    },
    resume() {
      if (stopped || !paused) return;
      paused = false;
      show(remaining);
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
      onFrame(CLOSED_MOUTH);
    },
  };
}
