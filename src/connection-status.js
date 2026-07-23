const HEALTH_ENDPOINT = "/api/health";
const DEFAULT_INTERVAL_MS = 30_000;

let connectionState = "checking";
let monitorStarted = false;
let refreshTimer = null;

export function renderWorkspaceConnectionStatus() {
  const tone = connectionState === "online"
    ? "synced"
    : connectionState === "offline"
      ? "error"
      : "syncing";
  const label = connectionState === "online"
    ? "Online"
    : connectionState === "offline"
      ? "Offline"
      : "Checking…";

  return `
    <span
      class="sync-control connection-status ${tone}"
      data-workspace-connection
      title="Connection to the shared workspace"
    >
      <span class="sync-dot" aria-hidden="true"></span>
      <span data-workspace-connection-label>${label}</span>
    </span>
  `;
}

function updateIndicators(connected) {
  connectionState = connected ? "online" : "offline";
  document.querySelectorAll("[data-workspace-connection]").forEach((indicator) => {
    indicator.className = `sync-control connection-status ${connected ? "synced" : "error"}`;
    indicator.title = connected
      ? "Connected to the shared workspace."
      : "The shared workspace is unavailable.";
  });
  document.querySelectorAll("[data-workspace-connection-label]").forEach((label) => {
    label.textContent = connected ? "Online" : "Offline";
  });
}

export async function checkWorkspaceConnection() {
  if (!navigator.onLine) {
    updateIndicators(false);
    return false;
  }

  try {
    const response = await fetch(HEALTH_ENDPOINT, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    const data = await response.json().catch(() => null);
    const connected = response.ok && data?.online === true;
    updateIndicators(connected);
    return connected;
  } catch {
    updateIndicators(false);
    return false;
  }
}

export function startWorkspaceConnectionMonitor(intervalMs = DEFAULT_INTERVAL_MS) {
  if (monitorStarted) {
    checkWorkspaceConnection();
    return;
  }

  monitorStarted = true;
  const scheduleNextCheck = async () => {
    clearTimeout(refreshTimer);
    await checkWorkspaceConnection();
    refreshTimer = setTimeout(scheduleNextCheck, intervalMs);
  };

  window.addEventListener("offline", () => {
    clearTimeout(refreshTimer);
    updateIndicators(false);
  });
  window.addEventListener("online", scheduleNextCheck);
  scheduleNextCheck();
}
