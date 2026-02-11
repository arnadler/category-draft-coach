const EXTENSION_SOURCE = "cdc-extension";
const APP_READY_SOURCE = "cdc-app";

let appReady = false;
let pendingPicks = [];
let latestStatus = null;

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
    if (Array.isArray(response.picks) && response.picks.length > 0) {
      pendingPicks = pendingPicks.concat(response.picks);
    }
    flushToPage();
  });
}

function sayHello() {
  chrome.runtime.sendMessage({ type: "CDC_APP_HELLO" }, (response) => {
    if (chrome.runtime.lastError || !response || response.ok !== true) return;
    latestStatus = response.status || null;
    if (Array.isArray(response.picks) && response.picks.length > 0) {
      pendingPicks = pendingPicks.concat(response.picks);
    }
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
    pendingPicks = pendingPicks.concat(message.picks);
    flushToPage();
  }
});

window.addEventListener("message", (event) => {
  if (event.source !== window || !event.data || typeof event.data !== "object") return;
  if (event.data.source !== APP_READY_SOURCE || event.data.type !== "CDC_APP_READY") return;
  appReady = true;
  sayHello();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    requestSyncState();
  }
});

setInterval(requestSyncState, 12000);
sayHello();
