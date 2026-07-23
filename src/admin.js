const app = document.querySelector("#admin-app");
let currentUser = null;
let users = [];
let logs = [];
let message = "";
let recovery = null;
let recoveryMessage = "";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
    timeZoneName: "short",
  }).format(new Date(value));
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    credentials: "same-origin",
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "The request failed.");
  return data;
}

function render() {
  if (!currentUser) {
    app.innerHTML = `<main class="login-page"><section class="login-card"><h1>Checking access…</h1></section></main>`;
    return;
  }
  app.innerHTML = `
    <main class="shell admin-shell">
      <header class="app-header">
        <div class="brand-lockup">
          <img class="brand-mark" src="/import-profit-mark.png" alt="" />
          <div><p class="eyebrow">Import and Profit</p><strong class="sidebar-title">Workspace</strong></div>
        </div>
        <div class="header-actions">
          <span class="sidebar-section-label">Workspace</span>
          <a class="nav-link" href="/">Calculator</a>
          <a class="nav-link" href="/products.html">All Products</a>
          <a class="nav-link" href="/invoices.html">Invoices</a>
          <a class="nav-link" href="/master">Master Data</a>
          <a class="nav-link active" href="/admin">Users & Logs</a>
          <span class="sidebar-section-label account-section-label">Account</span>
          <span class="account-chip"><strong>${escapeHtml(currentUser.full_name)}</strong><small>${escapeHtml(currentUser.role)}</small></span>
        </div>
      </header>

      <section class="page-topbar">
        <div>
          <p class="page-kicker">Workspace / Administration</p>
          <h1>Users & Activity</h1>
        </div>
        <span class="page-status-pill">${users.length} user${users.length === 1 ? "" : "s"}</span>
      </section>

      <section class="admin-grid">
        <article class="admin-panel">
          <div class="section-title"><div><h2>Invite user</h2><p class="section-note">Registration is invitation-only.</p></div></div>
          <form class="invite-form" data-invite-form>
            <label class="form-field"><span>Name</span><div class="input-shell"><input name="fullName" required /></div></label>
            <label class="form-field"><span>Email</span><div class="input-shell"><input name="email" type="email" required /></div></label>
            <label class="form-field"><span>Role</span><div class="input-shell"><select name="role"><option value="admin">Admin</option><option value="editor">Editor</option><option value="viewer">Viewer</option></select></div></label>
            <button class="primary-button" type="submit">Send invitation</button>
          </form>
          <p class="admin-message" data-admin-message>${escapeHtml(message)}</p>
        </article>

        <article class="admin-panel">
          <div class="section-title"><div><h2>Users</h2><p class="section-note">Everyone belongs to the same shared workspace. Login times are shown in IST.</p></div></div>
          <div class="admin-table-wrap">
            <table class="admin-table"><thead><tr><th>User</th><th>Role</th><th>Status</th><th>Last login</th></tr></thead><tbody>
              ${users.map((user) => `<tr><td><strong>${escapeHtml(user.full_name)}</strong><small>${escapeHtml(user.email)}</small></td><td>${escapeHtml(user.role)}</td><td>${user.active ? "Active" : "Disabled"}</td><td>${escapeHtml(formatDate(user.last_login_at))}</td></tr>`).join("") || `<tr><td colspan="4">No invited users yet.</td></tr>`}
            </tbody></table>
          </div>
        </article>
      </section>

      ${renderRecoveryPanel()}

      <section class="admin-panel activity-panel">
        <div class="section-title"><div><h2>Activity log</h2><p class="section-note">Activity is retained for one month. Times are shown in IST.</p></div><button class="ghost-button compact" data-refresh-logs>Refresh</button></div>
        <div class="activity-list">
          ${logs.map((log) => `<article class="activity-item"><div><strong>${escapeHtml(log.summary)}</strong><small>${escapeHtml(log.user_email)} · ${escapeHtml(formatDate(log.created_at))}</small></div><span class="section-pill">${escapeHtml(log.action)}</span></article>`).join("") || `<p class="section-note">No activity recorded yet.</p>`}
        </div>
      </section>
    </main>
  `;
  document.querySelector("[data-invite-form]")?.addEventListener("submit", inviteUser);
  document.querySelector("[data-refresh-logs]")?.addEventListener("click", loadData);
  document.querySelector("[data-restore-workspace]")?.addEventListener("click", restoreWorkspace);
}

function renderRecoveryPanel() {
  if (!recovery?.available) return "";
  const products = recovery.sampleProducts
    .map((product) => [product.productName, product.design].filter(Boolean).join(" "))
    .filter(Boolean)
    .join(", ");
  return `
    <section class="admin-panel recovery-panel">
      <div>
        <p class="eyebrow">Reset recovery available</p>
        <h2>${recovery.productCount} products can be restored</h2>
        <p class="section-note">This will replace the current ${recovery.currentProductCount} products with the records saved immediately before Reset.</p>
        ${products ? `<p class="recovery-samples">Sample: ${escapeHtml(products)}</p>` : ""}
        ${recoveryMessage ? `<p class="admin-message">${escapeHtml(recoveryMessage)}</p>` : ""}
      </div>
      <button class="primary-button" data-restore-workspace type="button">Restore products</button>
    </section>
  `;
}

async function loadData() {
  try {
    const session = await request("/api/auth/session");
    if (session.user.role !== "admin") {
      window.location.replace("/");
      return;
    }
    currentUser = session.user;
    const [userData, logData, recoveryData] = await Promise.all([
      request("/api/users"),
      request("/api/logs"),
      request("/api/recovery"),
    ]);
    users = userData.users || [];
    logs = logData.logs || [];
    recovery = recoveryData;
    render();
  } catch {
    window.location.replace("/");
  }
}

async function restoreWorkspace() {
  if (!recovery?.available) return;
  const confirmed = window.confirm(
    `Restore ${recovery.productCount} products saved immediately before Reset? This will replace the current workspace products.`,
  );
  if (!confirmed) return;

  recoveryMessage = "Restoring products…";
  render();
  try {
    const result = await request("/api/recovery", {
      method: "POST",
      body: JSON.stringify({
        confirm: true,
        expectedProductCount: recovery.productCount,
        expectedVersion: recovery.currentVersion,
      }),
    });
    recoveryMessage = `${result.productCount} products restored.`;
    await loadData();
  } catch (error) {
    recoveryMessage = error.message;
    render();
  }
}

async function inviteUser(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button");
  button.disabled = true;
  message = "Sending invitation…";
  document.querySelector("[data-admin-message]").textContent = message;
  try {
    await request("/api/users", {
      method: "POST",
      body: JSON.stringify({ fullName: form.fullName.value, email: form.email.value, role: form.role.value }),
    });
    form.reset();
    message = "Invitation sent.";
    await loadData();
  } catch (error) {
    message = error.message;
    button.disabled = false;
    document.querySelector("[data-admin-message]").textContent = message;
  }
}

render();
loadData();
