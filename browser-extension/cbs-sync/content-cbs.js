const HEARTBEAT_MS = 12000;
const SCAN_MS = 2500;

const POSITION_TOKEN_RE = /\b(C|1B|2B|3B|SS|OF|DH|SP|RP|P)\b/i;
const DRAFT_VERB_RE = /\b(selects|selected|drafts|drafted|picks|picked|pick\s+is\s+in)\b/i;
const BAD_FIRST_TOKENS = new Set([
  "round",
  "pick",
  "team",
  "time",
  "clock",
  "recent",
  "overall",
  "next",
  "auto",
  "queue",
  "watch",
  "player",
]);
const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

const recentSentByName = new Map();

function normalizePlayerName(input) {
  const cleaned = String(input || "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[\u2019']/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "";
  const parts = cleaned.split(" ").filter(Boolean);
  const withoutSuffix = parts.filter((p) => !SUFFIXES.has(p.replace(/\./g, "")));
  return withoutSuffix.join(" ").trim();
}

function cleanCandidateName(rawName) {
  if (!rawName) return "";
  let value = String(rawName)
    .replace(/\([^)]*\)/g, " ")
    .replace(/[|\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  value = value.replace(/^(selects|selected|drafts|drafted|picks|picked)\s+/i, "");

  const words = value.split(" ");
  if (words.length < 2 || words.length > 5) return "";

  if (BAD_FIRST_TOKENS.has(words[0].toLowerCase())) return "";
  if (words.some((w) => /\d/.test(w))) return "";

  if (!/^[A-Z]/.test(words[0]) || !/^[A-Z]/.test(words[1])) return "";

  return words.join(" ").trim();
}

function extractFromText(rawText) {
  const text = String(rawText || "").replace(/\s+/g, " ").trim();
  if (!text || text.length < 8 || text.length > 280) return [];

  const candidates = [];

  const verbPattern = /(?:selects|selected|drafts|drafted|picks|picked|pick\s+is\s+in)\s+([A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){1,4})/gi;
  for (const match of text.matchAll(verbPattern)) {
    const name = cleanCandidateName(match[1]);
    if (name) candidates.push(name);
  }

  const positionPattern = /([A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){1,4})\s*(?:,|\||-)\s*(?:C|1B|2B|3B|SS|OF|DH|SP|RP|P)\b/g;
  for (const match of text.matchAll(positionPattern)) {
    const name = cleanCandidateName(match[1]);
    if (name) candidates.push(name);
  }

  if (candidates.length === 0 && DRAFT_VERB_RE.test(text) && POSITION_TOKEN_RE.test(text)) {
    const looseNamePattern = /([A-Z][A-Za-z'.-]+\s+[A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){0,2})/g;
    for (const match of text.matchAll(looseNamePattern)) {
      const name = cleanCandidateName(match[1]);
      if (name) candidates.push(name);
    }
  }

  const unique = [];
  const seen = new Set();
  for (const name of candidates) {
    const normalized = normalizePlayerName(name);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push({ name, normalizedName: normalized });
  }

  return unique;
}

function emitPicks(rawText, extracted) {
  if (!Array.isArray(extracted) || extracted.length === 0) return;

  const now = Date.now();
  const picks = [];

  for (const item of extracted) {
    const key = item.normalizedName;
    const lastSentAt = recentSentByName.get(key) || 0;
    if (now - lastSentAt < 45000) continue;
    recentSentByName.set(key, now);

    picks.push({
      eventId: `${key}:${Math.floor(now / 1000)}`,
      name: item.name,
      normalizedName: key,
      detectedAt: now,
    });
  }

  if (picks.length === 0) return;

  chrome.runtime.sendMessage({
    type: "CDC_CBS_PICKS",
    picks,
    sourceUrl: location.href,
    context: String(rawText || "").slice(0, 260),
  });
}

function scanElementText(element) {
  if (!element) return;
  const text = element.textContent || "";
  const extracted = extractFromText(text);
  emitPicks(text, extracted);
}

function scanKnownContainers() {
  const selectors = [
    "[data-player-name]",
    "[class*='pick-history'] [class*='name']",
    "[class*='recent-picks'] [class*='name']",
    "[class*='draft-history'] [class*='name']",
    "[class*='draft-log'] [class*='name']",
    "[aria-live='polite']",
    "[aria-live='assertive']"
  ];

  for (const selector of selectors) {
    const nodes = document.querySelectorAll(selector);
    for (const node of nodes) {
      scanElementText(node);
    }
  }
}

function installMutationObserver() {
  if (!document.body) return;

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        scanElementText(node);
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

function sendHeartbeat() {
  chrome.runtime.sendMessage({
    type: "CDC_CBS_HEARTBEAT",
    sourceUrl: location.href,
    title: document.title,
    ts: Date.now(),
  });
}

installMutationObserver();
scanKnownContainers();
sendHeartbeat();

setInterval(scanKnownContainers, SCAN_MS);
setInterval(sendHeartbeat, HEARTBEAT_MS);
