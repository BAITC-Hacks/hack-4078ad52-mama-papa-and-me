import { dataset } from "@/data";

// Only display labels change. IDs and numeric server evidence stay untouched.
export function readableEvidenceLabel(text: string): string {
  return text
    .replace(/\b(?:[TESBC][12]|M\d+|esil|almaty|saryarka|baikonur|nura)\b/g, (token) =>
      dataset.indicators.find((i) => i.id === token)?.name
      ?? dataset.measures.find((m) => m.id === token)?.name
      ?? dataset.districts.find((d) => d.id === token)?.name
      ?? token)
    .replaceAll("после лага", "с учётом срока реализации");
}
