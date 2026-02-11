const statusEl = document.getElementById("status");
const countsEl = document.getElementById("counts");
const toggleBtn = document.getElementById("toggle");
const refreshBtn = document.getElementById("refresh");

let currentEnabled = true;

function render(status) {
  if (!status) {
    statusEl.textContent = "Unable to load extension status.";
    return;
  }

  currentEnabled = Boolean(status.enabled);
  const hasHeartbeat = typeof status.lastCbsHeartbeatAt === "number" && status.lastCbsHeartbeatAt > 0;
  const recentlySeen = hasHeartbeat && Date.now() - status.lastCbsHeartbeatAt < 30000;

  if (!currentEnabled) {
    statusEl.textContent = "Sync is paused.";
    toggleBtn.textContent = "Enable Sync";
    toggleBtn.className = "primary";
  } else if (recentlySeen) {
    statusEl.textContent = "CBS draft room detected. Sync is live.";
    toggleBtn.textContent = "Pause Sync";
    toggleBtn.className = "muted";
  } else {
    statusEl.textContent = "Waiting for an open CBS draft room tab.";
    toggleBtn.textContent = "Pause Sync";
    toggleBtn.className = "muted";
  }

  const pending = typeof status.pendingPickCount === "number" ? status.pendingPickCount : 0;
  countsEl.textContent = `Buffered picks: ${pending}`;
}

function refreshStatus() {
  chrome.runtime.sendMessage({ type: "CDC_GET_STATUS" }, (response) => {
    if (chrome.runtime.lastError || !response || response.ok !== true) {
      render(null);
      return;
    }
    render(response.status);
  });
}

toggleBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage(
    { type: "CDC_SET_ENABLED", enabled: !currentEnabled },
    (response) => {
      if (chrome.runtime.lastError || !response || response.ok !== true) return;
      render(response.status);
    }
  );
});

refreshBtn.addEventListener("click", refreshStatus);
refreshStatus();
