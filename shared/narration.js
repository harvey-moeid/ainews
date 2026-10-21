export function splitNarration(text) {
  const sentences = String(text || "").match(/[^.!?]+(?:[.!?]+|$)/g) || [];
  return sentences.flatMap((sentence) => {
    const words = sentence.trim().split(/\s+/);
    const parts = [];
    let part = "";
    for (const word of words) {
      if (part.length + word.length > 350) {
        parts.push(part);
        part = "";
      }
      part += (part ? " " : "") + word;
    }
    if (part) parts.push(part);
    return parts;
  });
}
