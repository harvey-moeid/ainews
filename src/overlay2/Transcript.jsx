import React from "react";

const safeLink = (value) => {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
};

export default function Transcript({
  config,
  topic,
  caption,
  preview = false,
}) {
  return (
    <div
      className="o2-transcript"
      aria-live={preview ? "off" : "polite"}
      style={{
        "--o2-transcript-x": `${config.transcriptX}%`,
        "--o2-transcript-y": `${config.transcriptY}%`,
        "--o2-transcript-width": `${config.transcriptWidth}%`,
      }}
    >
      {topic && (
        <>
          <small>
            {
              {
                news: topic.demo ? "BERITA DEMO" : "BERITA",
                rag: "JAWABAN DARI ARSIP BERITA",
                general: "JAWABAN AI UMUM · GIFT",
                no_context: "KONTEKS BELUM TERSEDIA",
                comment: "KOMENTAR MASUK",
              }[topic.kind]
            }
          </small>
          <h2>{topic.title}</h2>
          {topic.question && <p className="o2-question">“{topic.question}”</p>}
          <p>{caption}</p>
          {topic.source && (
            <span>
              {topic.source} ·{" "}
              {new Date(topic.date).toLocaleDateString("id-ID")}
            </span>
          )}
          {topic.citations?.map((c) => (
            <a
              href={safeLink(c.url)}
              key={c.id}
              target="_blank"
              rel="noreferrer"
            >
              {c.source} · {c.title}
            </a>
          ))}
        </>
      )}
    </div>
  );
}
