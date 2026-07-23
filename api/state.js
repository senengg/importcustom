import { insertAuditLogs, readJsonBody, requireUser, sendJson, supabaseFetch } from "./_lib/supabase.js";

function isValidState(state) {
  return Boolean(
    state &&
      typeof state === "object" &&
      state.settings &&
      typeof state.settings === "object" &&
      Array.isArray(state.commissionMaster) &&
      Array.isArray(state.products) &&
      state.products.length <= 5_000,
  );
}

function productLabel(product) {
  return product?.productName || product?.sku || product?.asin || "Product";
}

function buildAuditEntries(previousState, nextState) {
  if (!previousState) {
    return [{ action: "initialize", entityType: "workspace", summary: "Initialized shared app data.", newData: nextState }];
  }
  const entries = [];
  const previousProducts = new Map(previousState.products.map((product) => [product.id, product]));
  const nextProducts = new Map(nextState.products.map((product) => [product.id, product]));

  nextProducts.forEach((product, id) => {
    const previous = previousProducts.get(id);
    if (!previous) {
      entries.push({ action: "create", entityType: "product", entityId: id, summary: `Created ${productLabel(product)}.`, newData: product });
    } else if (JSON.stringify(previous) !== JSON.stringify(product)) {
      entries.push({ action: "update", entityType: "product", entityId: id, summary: `Updated ${productLabel(product)}.`, oldData: previous, newData: product });
    }
  });
  previousProducts.forEach((product, id) => {
    if (!nextProducts.has(id)) {
      entries.push({ action: "delete", entityType: "product", entityId: id, summary: `Deleted ${productLabel(product)}.`, oldData: product });
    }
  });
  if (JSON.stringify(previousState.settings) !== JSON.stringify(nextState.settings)) {
    entries.push({ action: "update", entityType: "settings", summary: "Updated app settings.", oldData: previousState.settings, newData: nextState.settings });
  }
  if (JSON.stringify(previousState.commissionMaster) !== JSON.stringify(nextState.commissionMaster)) {
    entries.push({ action: "update", entityType: "commission_master", summary: "Updated commission master data.", oldData: previousState.commissionMaster, newData: nextState.commissionMaster });
  }
  return entries.length ? entries : [{ action: "save", entityType: "workspace", summary: "Saved shared app data." }];
}

async function getWorkspaceDocument(session) {
  const rows = await supabaseFetch(
    session.configuration,
    `/rest/v1/workspace_state?workspace_id=eq.${encodeURIComponent(session.profile.workspace_id)}&select=state,version,updated_at`,
    { service: true },
  );
  return rows?.[0] || null;
}

export default async function handler(request, response) {
  const session = await requireUser(request, response);
  if (!session) return;

  try {
    if (request.method === "GET") {
      const document = await getWorkspaceDocument(session);
      sendJson(response, 200, {
        state: document?.state || null,
        version: Number(document?.version || 0),
        updatedAt: document?.updated_at || null,
      });
      return;
    }

    if (request.method === "PUT") {
      if (!['admin', 'editor'].includes(session.profile.role)) {
        sendJson(response, 403, { error: "This account has read-only access." });
        return;
      }
      const body = await readJsonBody(request);
      if (!isValidState(body.state)) {
        sendJson(response, 400, { error: "The submitted app data is invalid." });
        return;
      }
      const current = await getWorkspaceDocument(session);
      const submittedVersion = Number(body.version || 0);
      const currentVersion = Number(current?.version || 0);
      if (submittedVersion !== currentVersion) {
        sendJson(response, 409, {
          error: "Another user updated the shared data. The latest version has been loaded.",
          code: "VERSION_CONFLICT",
          state: current?.state || null,
          version: currentVersion,
        });
        return;
      }

      const nextVersion = currentVersion + 1;
      const updatedAt = new Date().toISOString();
      if (current) {
        const updated = await supabaseFetch(
          session.configuration,
          `/rest/v1/workspace_state?workspace_id=eq.${encodeURIComponent(session.profile.workspace_id)}&version=eq.${currentVersion}`,
          {
            method: "PATCH",
            service: true,
            body: { state: body.state, version: nextVersion, updated_by: session.profile.id, updated_at: updatedAt },
            headers: { Prefer: "return=representation" },
          },
        );
        if (!updated?.length) {
          const latest = await getWorkspaceDocument(session);
          sendJson(response, 409, { error: "Another user updated the shared data.", code: "VERSION_CONFLICT", state: latest?.state || null, version: Number(latest?.version || 0) });
          return;
        }
      } else {
        await supabaseFetch(session.configuration, "/rest/v1/workspace_state", {
          method: "POST",
          service: true,
          body: { workspace_id: session.profile.workspace_id, state: body.state, version: nextVersion, updated_by: session.profile.id, updated_at: updatedAt },
          headers: { Prefer: "return=minimal" },
        });
      }

      await insertAuditLogs(
        session.configuration,
        session.profile,
        buildAuditEntries(current?.state || null, body.state),
      );
      sendJson(response, 200, { saved: true, version: nextVersion, updatedAt });
      return;
    }

    response.setHeader("Allow", "GET, PUT");
    sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    sendJson(response, 502, { error: "Shared data is temporarily unavailable.", detail: error.message });
  }
}
