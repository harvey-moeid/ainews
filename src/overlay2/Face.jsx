import React, { useEffect, useRef, useState } from "react";
import { VirtualFace } from "./face.js";
import { CHARACTER_DEFAULTS } from "../../shared/character.js";
export default function Face({
  speaking = false,
  level = 0,
  mouth = null,
  preview = false,
  appearance = CHARACTER_DEFAULTS,
}) {
  const canvas = useRef(null),
    instance = useRef(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    try {
      instance.current = new VirtualFace(canvas.current, { preview });
    } catch {
      setError(true);
    }
    return () => instance.current?.dispose();
  }, [preview]);
  useEffect(() => {
    instance.current?.setAudio(level, speaking, mouth);
  }, [level, speaking, mouth]);
  useEffect(() => {
    instance.current?.setAppearance(appearance);
  }, [
    preview,
    appearance.hairStyle,
    appearance.accessory,
    appearance.hairColor,
    appearance.faceColor,
    appearance.eyeColor,
  ]);
  return (
    <>
      <canvas ref={canvas} aria-label="Karakter presenter Overlay 2" />
      {error && (
        <p className="o2-webgl-error">
          Aktifkan akselerasi hardware/WebGL untuk menampilkan wajah.
        </p>
      )}
    </>
  );
}
