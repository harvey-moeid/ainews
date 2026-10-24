import provinces from "./regions.json" with { type: "json" };

export const NATIONAL_REGION = "Indonesia";
export const REGION_GROUPS = provinces;
const regions = new Set(provinces.flatMap((group) => group.regions));

export function isRegion(value) {
  return value === NATIONAL_REGION || regions.has(value);
}

// RSS feeds do not consistently expose structured location metadata.
// Local coverage matches the place name in the headline or source text.
export function matchesCoverage(text, region) {
  if (!isRegion(region)) return false;
  if (region === NATIONAL_REGION) return true;
  const place = region
    .replace(/^(?:Kota|Kabupaten)(?: Administrasi)? /, "")
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
  return new RegExp(
    `(?:^|[^\\p{L}\\p{N}])${place}(?:$|[^\\p{L}\\p{N}])`,
    "iu",
  ).test(text);
}
