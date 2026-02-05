const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

export function normalizePlayerName(input: string): string {
  const cleaned = input
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[\u2019']/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const parts = cleaned.split(" ").filter(Boolean);
  const withoutSuffix = parts.filter((p) => !SUFFIXES.has(p.replace(/\./g, "")));
  return withoutSuffix.join(" ").trim();
}

/**
 * CBS and other draft rooms often include punctuation/suffixes/extra columns.
 * This attempts to extract just the name portion for fuzzy matching.
 */
export function extractNameFromDraftRoomText(raw: string): string {
  const s = raw.trim();
  if (!s) return "";

  // Common formats:
  // "Ronald Acuna Jr., OF, ATL"
  // "Ronald Acuna Jr. (ATL - OF)"
  // "Acuna Jr., Ronald"
  let core = s;
  core = core.replace(/\(.*?\)/g, " ");
  core = core.split("|")[0] ?? core;
  core = core.split(" - ")[0] ?? core;
  core = core.split("\t")[0] ?? core;

  // If comma-separated and looks like "Last, First", reorder.
  const commaParts = core.split(",").map((p) => p.trim()).filter(Boolean);
  if (commaParts.length >= 2 && commaParts[0] && commaParts[1]) {
    const maybeLast = commaParts[0];
    const maybeFirst = commaParts[1];
    // Keep only if both look like name tokens (letters)
    if (/[a-zA-Z]/.test(maybeLast) && /[a-zA-Z]/.test(maybeFirst)) {
      core = `${maybeFirst} ${maybeLast}`;
    } else {
      core = commaParts[0] ?? core;
    }
  } else {
    // Otherwise, keep up to the first comma (name usually first)
    core = commaParts[0] ?? core;
  }

  return core.replace(/\s+/g, " ").trim();
}

