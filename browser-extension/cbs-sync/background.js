const STORAGE_ENABLED_KEY = "cdc_sync_enabled";
const MAX_PENDING_PICKS = 300;

const state = {
  enabled: true,
  lastCbsHeartbeatAt: 0,
  pendingPicks: [],
  seenEventIds: new Set(),
};

function isAppUrl(url) {
  if (!url) return false;
  return /^http:\/\/localhost:3000\//i.test(url) || /\.vercel\.app\//i.test(url);
}

function sanitizePick(rawPick) {
  if (!rawPick || typeof rawPick !== "object") return null;
  const name = typeof rawPick.name === "string" ? rawPick.name.trim() : "";
  if (!name) return null;

  const normalizedName =
    typeof rawPick.normalizedName === "string" ? rawPick.normalizedName.trim() : "";
  const detectedAt =
    typeof rawPick.detectedAt === "number" && Number.isFinite(rawPick.detectedAt)
      ? rawPick.detectedAt
      : Date.now();
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

function buildStatus() {
  return {
    enabled: state.enabled,
    lastCbsHeartbeatAt: state.lastCbsHeartbeatAt,
    pendingPickCount: state.pendingPicks.length,
  };
}

function addPendingPicks(picks) {
  const accepted = [];

  for (const rawPick of picks) {
    const pick = sanitizePick(rawPick);
    if (!pick) continue;
    if (state.seenEventIds.has(pick.eventId)) continue;

    state.seenEventIds.add(pick.eventId);
    if (state.seenEventIds.size > 4000) {
      state.seenEventIds.clear();
      state.seenEventIds.add(pick.eventId);
    }

    accepted.push(pick);
    state.pendingPicks.push(pick);
  }

  if (state.pendingPicks.length > MAX_PENDING_PICKS) {
    state.pendingPicks = state.pendingPicks.slice(-MAX_PENDING_PICKS);
  }

  return accepted;
}

async function sendToAppTabs(message) {
  const tabs = await chrome.tabs.query({});
  const sendTasks = [];

  for (const tab of tabs) {
    if (!tab.id || !isAppUrl(tab.url)) continue;
    sendTasks.push(
      chrome.tabs.sendMessage(tab.id, message).catch(() => {
        return null;
      })
    );
  }

  await Promise.all(sendTasks);
}

async function sendStatusToApps() {
  await sendToAppTabs({
    type: "CDC_SYNC_STATUS",
    status: buildStatus(),
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get(STORAGE_ENABLED_KEY);
  if (typeof stored[STORAGE_ENABLED_KEY] === "boolean") {
    state.enabled = stored[STORAGE_ENABLED_KEY];
  } else {
    await chrome.storage.local.set({ [STORAGE_ENABLED_KEY]: true });
    state.enabled = true;
  }
});

chrome.runtime.onStartup.addListener(async () => {
  const stored = await chrome.storage.local.get(STORAGE_ENABLED_KEY);
  if (typeof stored[STORAGE_ENABLED_KEY] === "boolean") {
    state.enabled = stored[STORAGE_ENABLED_KEY];
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== "object" || typeof message.type !== "string") {
    return false;
  }

  if (message.type === "CDC_SET_ENABLED") {
    const enabled = Boolean(message.enabled);
    state.enabled = enabled;
    chrome.storage.local
      .set({ [STORAGE_ENABLED_KEY]: enabled })
      .then(() => sendStatusToApps())
      .catch(() => null)
      .finally(() => sendResponse({ ok: true, status: buildStatus() }));
    return true;
  }

  if (message.type === "CDC_GET_STATUS") {
    sendResponse({ ok: true, status: buildStatus(), picks: state.pendingPicks.slice(-120) });
    return false;
  }

  if (message.type === "CDC_APP_HELLO") {
    sendResponse({ ok: true, status: buildStatus(), picks: state.pendingPicks.slice(-120) });
    return false;
  }

  if (message.type === "CDC_CBS_HEARTBEAT") {
    state.lastCbsHeartbeatAt = Date.now();
    sendStatusToApps().catch(() => null);
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === "CDC_CBS_PICKS") {
    if (!state.enabled) {
      sendResponse({ ok: false, reason: "disabled" });
      return false;
    }

    const picks = Array.isArray(message.picks) ? message.picks : [];
    const accepted = addPendingPicks(picks);

    if (accepted.length > 0) {
      sendToAppTabs({
        type: "CDC_SYNC_PICKS",
        picks: accepted,
        sentAt: Date.now(),
      }).catch(() => null);
    }

    sendStatusToApps().catch(() => null);
    sendResponse({ ok: true, accepted: accepted.length });
    return false;
  }

  return false;
});
