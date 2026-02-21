const EXTENSION_SOURCE = "cdc-extension";
const APP_READY_SOURCE = "cdc-app";

let appReady = false;
let pendingPicks = [];
let latestStatus = null;
const forwardedEventIds = new Set();

function normalizePick(rawPick) {
  if (!rawPick || typeof rawPick !== "object") return null;
  const name = typeof rawPick.name === "string" ? rawPick.name.trim() : "";
  if (!name) return null;
  const detectedAt =
    typeof rawPick.detectedAt === "number" && Number.isFinite(rawPick.detectedAt)
      ? rawPick.detectedAt
      : Date.now();
  const normalizedName =
    typeof rawPick.normalizedName === "string" ? rawPick.normalizedName.trim() : "";
  const eventId =
    typeof rawPick.eventId === "string" && rawPick.eventId.trim().length > 0
      ? rawPick.eventId.trim()
      : `${normalizedName || name.toLowerCase()}:${Math.floor(detectedAt / 5000)}`;
  return {
    eventId,
    name,
    normalizedName,
    detectedAt,
  };
}

function queuePicks(incomingPicks) {
  if (!Array.isArray(incomingPicks) || incomingPicks.length === 0) return;
  for (const rawPick of incomingPicks) {
    const pick = normalizePick(rawPick);
    if (!pick) continue;
    if (forwardedEventIds.has(pick.eventId)) continue;
    forwardedEventIds.add(pick.eventId);
    if (forwardedEventIds.size > 3000) {
      forwardedEventIds.clear();
      forwardedEventIds.add(pick.eventId);
    }
    pendingPicks.push(pick);
  }
}

function postToPage(type, payload) {
  window.postMessage(
    {
      source: EXTENSION_SOURCE,
      type,
      ...payload,
    },
    window.location.origin
  );
}

function flushToPage() {
  if (!appReady) return;

  if (latestStatus) {
    postToPage("CBS_SYNC_STATUS", latestStatus);
  }

  if (pendingPicks.length > 0) {
    const picks = pendingPicks;
    pendingPicks = [];
    postToPage("CBS_DRAFT_PICKS", { picks });
  }
}

function requestSyncState() {
  chrome.runtime.sendMessage({ type: "CDC_GET_STATUS" }, (response) => {
    if (chrome.runtime.lastError || !response || response.ok !== true) return;
    latestStatus = response.status || null;
    queuePicks(response.picks);
    flushToPage();
  });
}

function sayHello() {
  chrome.runtime.sendMessage({ type: "CDC_APP_HELLO" }, (response) => {
    if (chrome.runtime.lastError || !response || response.ok !== true) return;
    latestStatus = response.status || null;
    queuePicks(response.picks);
    flushToPage();
  });
}

chrome.runtime.onMessage.addListener((message) => {
  if (!message || typeof message !== "object" || typeof message.type !== "string") return;

  if (message.type === "CDC_SYNC_STATUS") {
    latestStatus = message.status || null;
    flushToPage();
    return;
  }

  if (message.type === "CDC_SYNC_PICKS" && Array.isArray(message.picks)) {
    queuePicks(message.picks);
    flushToPage();
  }
});

window.addEventListener("message", (event) => {
  if (event.source !== window || !event.data || typeof event.data !== "object") return;
  if (event.data.source !== APP_READY_SOURCE) return;

  if (event.data.type === "CDC_ACK_PICKS") {
    const eventIds = Array.isArray(event.data.eventIds)
      ? event.data.eventIds.filter((id) => typeof id === "string")
      : [];
    if (eventIds.length > 0) {
      chrome.runtime.sendMessage({ type: "CDC_ACK_PICKS", eventIds }, () => {
        void chrome.runtime.lastError;
      });
    }
    return;
  }

  if (event.data.type === "CDC_APP_READY") {
    appReady = true;
    sayHello();
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    requestSyncState();
  }
});

setInterval(requestSyncState, 12000);
sayHello();
