import {
  insertAuditLog,
  logServerError,
  readJsonBody,
  requireJsonRequest,
  requireTrustedOrigin,
  requireUser,
  sendJson,
  supabaseFetch,
} from "./_lib/supabase.js";
import { validateState } from "./_lib/state-validation.js";

const RECOVERY_WINDOW_MS = 10 * 60 * 1000;
const MAX_RECOVERY_LOGS = 5_000;

function timestamp(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function uniqueDeletedProducts(logs) {
  const products = new Map();
  for (const log of logs) {
    const product = log?.old_data;
    if (!product || typeof product !== "object" || !product.id) continue;
    if (!products.has(product.id)) products.set(product.id, product);
  }
  return [...products.values()];
}

async function getWorkspaceDocument(session) {
  const rows = await supabaseFetch(
    session.configuration,
    `/rest/v1/workspace_state?workspace_id=eq.${encodeURIComponent(session.profile.workspace_id)}&select=state,version,updated_at`,
    { service: true },
  );
  return rows?.[0] || null;
}

async function getLatestMasterLog(session, entityType) {
  const rows = await supabaseFetch(
    session.configuration,
    `/rest/v1/audit_logs?workspace_id=eq.${encodeURIComponent(session.profile.workspace_id)}&action=eq.update&entity_type=eq.${encodeURIComponent(entityType)}&select=id,old_data,new_data,created_at&order=created_at.desc,id.desc&limit=1`,
    { service: true },
  );
  return rows?.[0] || null;
}

async function getRecoveryCandidate(session) {
  const [document, settingsLog, commissionLog, deleteLogs] = await Promise.all([
    getWorkspaceDocument(session),
    getLatestMasterLog(session, "settings"),
    getLatestMasterLog(session, "commission_master"),
    supabaseFetch(
      session.configuration,
      `/rest/v1/audit_logs?workspace_id=eq.${encodeURIComponent(session.profile.workspace_id)}&action=eq.delete&entity_type=eq.product&select=id,user_email,old_data,created_at&order=created_at.desc,id.desc&limit=${MAX_RECOVERY_LOGS}`,
      { service: true },
    ),
  ]);

  const anchorTime = Math.max(timestamp(settingsLog?.created_at), timestamp(commissionLog?.created_at));
  const windowStart = anchorTime - RECOVERY_WINDOW_MS;
  const windowEnd = anchorTime + 60_000;
  const resetDeleteLogs = (deleteLogs || []).filter((log) => {
    const time = timestamp(log.created_at);
    return anchorTime && time >= windowStart && time <= windowEnd;
  });
  const products = uniqueDeletedProducts(resetDeleteLogs);
  const times = resetDeleteLogs.map((log) => timestamp(log.created_at)).filter(Boolean);
  const currentProducts = Array.isArray(document?.state?.products)
    ? document.state.products
    : [];
  const currentProductIds = new Set(currentProducts.map((product) => product?.id).filter(Boolean));
  const alreadyRestored =
    products.length > 0 &&
    currentProducts.length === products.length &&
    products.every((product) => currentProductIds.has(product.id));

  return {
    document,
    settingsLog,
    commissionLog,
    products,
    preview: {
      available: Boolean(
        document &&
        settingsLog?.old_data &&
        commissionLog?.old_data &&
        products.length &&
        !alreadyRestored,
      ),
      productCount: products.length,
      currentProductCount: currentProducts.length,
      alreadyRestored,
      currentVersion: Number(document?.version || 0),
      startedAt: times.length ? new Date(Math.min(...times)).toISOString() : null,
      completedAt: anchorTime ? new Date(anchorTime).toISOString() : null,
      recordedDeleteCount: resetDeleteLogs.length,
      logLimitReached: (deleteLogs || []).length >= MAX_RECOVERY_LOGS,
      sampleProducts: products.slice(0, 8).map((product) => ({
        productName: product.productName || "",
        design: product.design || "",
        sku: product.sku || "",
        asin: product.asin || "",
      })),
    },
  };
}

export default async function handler(request, response) {
  if (request.method === "POST" && (!requireTrustedOrigin(request, response) || !requireJsonRequest(request, response))) {
    return;
  }
  const session = await requireUser(request, response);
  if (!session) return;
  if (session.profile.role !== "admin") {
    sendJson(response, 403, { error: "Administrator access is required." });
    return;
  }

  try {
    const candidate = await getRecoveryCandidate(session);

    if (request.method === "GET") {
      sendJson(response, 200, candidate.preview);
      return;
    }

    if (request.method !== "POST") {
      response.setHeader("Allow", "GET, POST");
      sendJson(response, 405, { error: "Method not allowed." });
      return;
    }

    const body = await readJsonBody(request);
    if (body.confirm !== true) {
      sendJson(response, 400, { error: "Recovery confirmation is required." });
      return;
    }
    if (!candidate.preview.available) {
      sendJson(response, 409, { error: "No complete Reset recovery snapshot is available." });
      return;
    }
    if (
      Number(body.expectedProductCount) !== candidate.products.length ||
      Number(body.expectedVersion) !== Number(candidate.document.version)
    ) {
      sendJson(response, 409, {
        error: "The recovery preview changed. Refresh the page and review it again.",
      });
      return;
    }

    const recoveredState = {
      settings: candidate.settingsLog.old_data,
      commissionMaster: candidate.commissionLog.old_data,
      products: candidate.products,
    };
    const validation = validateState(recoveredState);
    if (!validation.valid) {
      sendJson(response, 409, {
        error: "The recovery snapshot contains invalid legacy data and cannot be restored safely.",
      });
      return;
    }
    const currentVersion = Number(candidate.document.version || 0);
    const nextVersion = currentVersion + 1;
    const updatedAt = new Date().toISOString();
    const updated = await supabaseFetch(
      session.configuration,
      `/rest/v1/workspace_state?workspace_id=eq.${encodeURIComponent(session.profile.workspace_id)}&version=eq.${currentVersion}`,
      {
        method: "PATCH",
        service: true,
        body: {
          state: recoveredState,
          version: nextVersion,
          updated_by: session.profile.id,
          updated_at: updatedAt,
        },
        headers: { Prefer: "return=representation" },
      },
    );
    if (!updated?.length) {
      sendJson(response, 409, {
        error: "The workspace changed before recovery. Refresh and review the preview again.",
      });
      return;
    }

    await insertAuditLog(session.configuration, session.profile, {
      action: "restore",
      entityType: "workspace",
      summary: `Restored ${candidate.products.length} products after Reset.`,
      oldData: { productCount: candidate.preview.currentProductCount, version: currentVersion },
      newData: { productCount: candidate.products.length, version: nextVersion },
    });

    sendJson(response, 200, {
      restored: true,
      productCount: candidate.products.length,
      version: nextVersion,
      updatedAt,
    });
  } catch (error) {
    logServerError("recovery", error);
    const status = [400, 413].includes(error.status) ? error.status : 502;
    sendJson(response, status, {
      error: status === 413
        ? "The recovery request is too large."
        : (status === 400 ? "The recovery request is invalid." : "Workspace recovery is temporarily unavailable."),
    });
  }
}
