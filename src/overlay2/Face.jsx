import React, { useEffect, useRef, useState } from "react";
import { VirtualFace } from "./face.js";
export default function Face({ speaking = false, level = 0, preview = false }) {
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
    instance.current?.setAudio(level, speaking);
  }, [level, speaking]);
  return (
    <>
      <canvas
        ref={canvas}
        aria-label="Wajah wireframe biru dengan mata oranye"
      />
      {error && (
        <p className="o2-webgl-error">
          Aktifkan akselerasi hardware/WebGL untuk menampilkan wajah.
        </p>
      )}
    </>
  );
}
