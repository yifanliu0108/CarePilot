/**
 * Section title for link lists from browserSession.actions — avoids labeling
 * NIH/CDC/Harvard as "stores".
 */
export function titleForResourceLinks(urls: string[]): string {
  if (urls.length === 0) return "Resources";

  const hosts = urls.map(hostFromUrl).filter(Boolean);
  const anyMaps = hosts.some(
    (h) =>
      h.includes("maps.google") ||
      h.includes("google.com/maps") ||
      h.includes("openstreetmap") ||
      h.includes("goo.gl/maps"),
  );
  const anyRetail = hosts.some((h) =>
    /walmart|vons|ralphs|target|costco|kroger|safeway|wholefoods|traderjoes|instacart|amazon\.com/i.test(h),
  );
  const anyGovEduHealth = hosts.some(
    (h) =>
      /\.gov$/i.test(h) ||
      /\.edu$/i.test(h) ||
      /nih\.|cdc\.|medline|hsph\.harvard|health\.harvard|who\.int/i.test(h),
  );

  if (anyRetail && !anyGovEduHealth) return "Stores & shopping";
  if (anyMaps) return "Maps & local";
  if (anyGovEduHealth) return "Trusted resources";
  return "Read next";
}

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
