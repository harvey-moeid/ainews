// One speech job at a time. Cancellation settles the promise even when a browser
// does not dispatch speechSynthesis.onend after cancel().
export function speakBrowser(text, settings, signal, onLevel) {
  return new Promise((resolve, reject) => {
    if (!window.speechSynthesis)
      return reject(
        Error(
          "Browser ini tidak mendukung suara. Pilih suara OpenAI di Pengaturan.",
        ),
      );
    if (signal.aborted)
      return reject(new DOMException("Stopped", "AbortError"));
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = speechSynthesis.getVoices();
    utterance.voice =
      voices.find((v) => v.voiceURI === settings.voice) ||
      voices.find((v) => v.lang.startsWith("id")) ||
      null;
    utterance.lang = "id-ID";
    utterance.rate = settings.rate || 1;
    utterance.pitch = settings.pitch || 1;
    let done = false,
      pulse;
    const finish = (error) => {
      if (done) return;
      done = true;
      clearInterval(pulse);
      clearTimeout(timeout);
      signal.removeEventListener("abort", cancel);
      onLevel(0);
      error ? reject(error) : resolve();
    };
    const cancel = () => {
      finish(new DOMException("Stopped", "AbortError"));
      speechSynthesis.cancel();
    };
    const timeout = setTimeout(() => {
      finish(Error("Suara browser tidak selesai. Periksa pilihan suara."));
      speechSynthesis.cancel();
    }, 120000);
    signal.addEventListener("abort", cancel, { once: true });
    utterance.onstart = () => {
      pulse = setInterval(() => onLevel(0.15 + Math.random() * 0.55), 110);
    };
    utterance.onend = () => finish();
    utterance.onerror = (event) =>
      finish(Error("Suara browser gagal: " + event.error));
    speechSynthesis.speak(utterance);
  });
}

export async function speakAI(payload, context, signal, onLevel) {
  const response = await fetch("/api/overlay2/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  if (!response.ok) {
    const error = await response.json();
    throw Error(error.error || "Suara AI tidak tersedia.");
  }
  const buffer = await context.decodeAudioData(await response.arrayBuffer());
  if (signal.aborted) throw new DOMException("Stopped", "AbortError");
  await context.resume();
  return new Promise((resolve, reject) => {
    const source = context.createBufferSource(),
      analyser = context.createAnalyser();
    source.buffer = buffer;
    analyser.fftSize = 256;
    source.connect(analyser);
    analyser.connect(context.destination);
    const values = new Uint8Array(analyser.frequencyBinCount);
    let done = false;
    const timer = setInterval(() => {
      analyser.getByteFrequencyData(values);
      onLevel(
        Math.min(1, values.reduce((a, b) => a + b, 0) / values.length / 95),
      );
    }, 60);
    const finish = (error) => {
      if (done) return;
      done = true;
      clearInterval(timer);
      signal.removeEventListener("abort", cancel);
      source.disconnect();
      analyser.disconnect();
      onLevel(0);
      error ? reject(error) : resolve();
    };
    const cancel = () => {
      source.stop();
      finish(new DOMException("Stopped", "AbortError"));
    };
    source.onended = () => finish();
    signal.addEventListener("abort", cancel, { once: true });
    source.start();
  });
}
