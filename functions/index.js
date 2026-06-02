const crypto = require("crypto");
const admin = require("firebase-admin");
const { onRequest } = require("firebase-functions/v2/https");

admin.initializeApp();

const corsOrigins = [
  "https://zaspdragon.github.io",
  "http://localhost:5000",
  "http://localhost:5173"
];

function setCors(req, res) {
  const origin = req.headers.origin || "";
  if (corsOrigins.includes(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
  }
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
}

function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .replaceAll(" ", "_");
}

function hashWorkerPin(pin, scope) {
  return crypto
    .createHash("sha256")
    .update(`${String(scope || "").trim()}::${String(pin || "").trim()}`)
    .digest("hex");
}

function formatDateKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getMondayDate(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function jsonError(res, status, error) {
  res.status(status).json({ error });
}

function normalizePunchAction(action) {
  const value = String(action || "").trim();
  const map = {
    clock_in: "clockIn",
    start_lunch: "startLunch",
    end_lunch: "endLunch",
    clock_out: "clockOut",
    lunchStart: "startLunch",
    lunchEnd: "endLunch"
  };
  return map[value] || value || "";
}

function isAllowedAction(action) {
  return ["clockIn", "startLunch", "endLunch", "clockOut"].includes(normalizePunchAction(action));
}

function actionToPunchType(action) {
  const map = {
    clockIn: "clockIn",
    startLunch: "lunchStart",
    endLunch: "lunchEnd",
    clockOut: "clockOut"
  };
  const normalized = normalizePunchAction(action);
  return map[normalized] || normalized || "";
}

function isActiveRecord(record) {
  if (!record || typeof record !== "object") return false;
  if (record.active === false) return false;
  const status = String(record.status || "").trim().toLowerCase();
  return !status || !["inactive", "disabled", "terminated", "archived"].includes(status);
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry || "").trim()).filter(Boolean);
}

function buildWorkerScope(payload, routeContext = null) {
  const workerName = String(payload.workerName || "").trim();
  const pin = String(payload.pin || "").trim();
  const agencyId = String(payload.agencyId || "").trim();
  const clientId = String(payload.clientId || routeContext?.client?.id || "").trim();
  const siteId = String(payload.siteId || "").trim();

  if (!workerName || !pin || !agencyId || !siteId) {
    throw new Error("Worker name, PIN, agency, and site are required.");
  }

  return {
    workerName,
    pin,
    agencyId,
    clientId,
    siteId
  };
}

function buildWorkerPinScope(worker) {
  return worker.agencyId || worker.clientId || worker.companyId || "default";
}

async function loadAgencySiteContext(agencyId, siteId) {
  if (!agencyId || !siteId) {
    throw new Error("Agency and site are required.");
  }

  const [agencySnap, siteSnap] = await Promise.all([
    admin.firestore().collection("agencies").doc(agencyId).get(),
    admin.firestore().collection("sites").doc(siteId).get()
  ]);

  if (!agencySnap.exists) {
    throw new Error("That agency was not found.");
  }
  if (!siteSnap.exists) {
    throw new Error("That site was not found.");
  }

  const agency = { id: agencySnap.id, ...agencySnap.data() };
  const site = { id: siteSnap.id, ...siteSnap.data() };

  if (!isActiveRecord(site)) {
    throw new Error("That site is not active.");
  }
  if (String(site.agencyId || "") !== agencyId) {
    throw new Error("That site does not belong to this agency.");
  }

  const clientId = String(site.clientId || site.companyId || "").trim();
  if (!clientId) {
    throw new Error("That site is missing a client assignment.");
  }

  const clientSnap = await admin.firestore().collection("clients").doc(clientId).get();
  if (!clientSnap.exists) {
    throw new Error("That site's client was not found.");
  }

  const client = { id: clientSnap.id, ...clientSnap.data() };
  if (!isActiveRecord(client)) {
    throw new Error("That client is not active.");
  }

  return { agency, client, site };
}

function workerMatchesAssignment(worker, routeContext, assignmentRows) {
  const siteId = String(routeContext.site.id || "").trim();
  const clientId = String(routeContext.client.id || "").trim();
  const allowCrossSitePunching = worker.allowCrossSitePunching === true;
  const workerSiteIds = new Set([
    ...normalizeStringArray(worker.assignedSiteIds),
    ...normalizeStringArray(worker.siteIds),
    String(worker.assignedSiteId || "").trim(),
    String(worker.siteId || "").trim()
  ].filter(Boolean));
  const workerClientIds = new Set([
    ...normalizeStringArray(worker.assignedClientIds),
    String(worker.assignedClientId || "").trim(),
    String(worker.clientId || worker.companyId || "").trim()
  ].filter(Boolean));

  if (workerSiteIds.has(siteId)) {
    return true;
  }

  if (assignmentRows.some((assignment) => {
    if (!isActiveRecord(assignment)) return false;
    return String(assignment.siteId || "").trim() === siteId
      && String(assignment.clientId || "").trim() === clientId
      && String(assignment.workerId || "").trim() === String(worker.workerId || worker.employeeId || worker.id || "").trim();
  })) {
    return true;
  }

  return allowCrossSitePunching && workerClientIds.has(clientId);
}

function pinMatchesWorker(worker, pin) {
  const expectedHash = hashWorkerPin(pin, buildWorkerPinScope(worker));
  return [
    String(worker.pinHash || "").trim(),
    String(worker.pin || "").trim(),
    String(worker.pinCode || "").trim()
  ].includes(expectedHash) || [
    String(worker.pin || "").trim(),
    String(worker.pinCode || "").trim()
  ].includes(String(pin || "").trim());
}

async function findWorkerFromPayload(payload, options = {}) {
  const routeContext = await loadAgencySiteContext(
    String(payload.agencyId || "").trim(),
    String(payload.siteId || "").trim()
  );
  const scope = buildWorkerScope(payload, routeContext);
  const workerName = String(payload.workerName || "").trim();

  const workerSnap = await admin
    .firestore()
    .collection("workers")
    .where("nameKey", "==", normalizeName(workerName))
    .where("agencyId", "==", scope.agencyId)
    .get();

  const assignmentSnap = await admin
    .firestore()
    .collection("assignments")
    .where("agencyId", "==", scope.agencyId)
    .where("siteId", "==", scope.siteId)
    .get();
  const assignments = assignmentSnap.docs.map((record) => ({ id: record.id, ...record.data() }));

  const scopeMatches = workerSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((worker) => {
      if (!isActiveRecord(worker)) return false;
      if (String(worker.agencyId || "") !== scope.agencyId) return false;
      const workerClientId = String(worker.assignedClientId || worker.clientId || worker.companyId || "").trim();
      if (workerClientId && workerClientId !== scope.clientId && !worker.allowCrossSitePunching) return false;
      return workerMatchesAssignment(worker, routeContext, assignments);
    });

  if (!scopeMatches.length) {
    throw new Error("No active worker was found for that name.");
  }

  const pinMatches = scopeMatches.filter((worker) => pinMatchesWorker(worker, scope.pin));

  if (!pinMatches.length) {
    throw new Error("PIN did not match an active assigned worker for this site.");
  }

  return {
    worker: pinMatches[0],
    routeContext
  };
}

async function loadWorkerPunches(workerId) {
  const snap = await admin.firestore().collection("punches").where("workerId", "==", workerId).get();
  return snap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => Number(a.timestampMs || 0) - Number(b.timestampMs || 0));
}

function deriveSummary(punches) {
  const sorted = [...punches].sort((a, b) => Number(a.timestampMs || 0) - Number(b.timestampMs || 0));
  let todayMinutes = 0;
  let weekMinutes = 0;
  let lunchMinutes = 0;
  let currentClockIn = null;
  let lunchStart = null;
  let lastAction = "";
  let lastTimestamp = 0;

  const todayKey = formatDateKey(new Date());
  const weekKey = formatDateKey(getMondayDate(new Date()));

  for (const punch of sorted) {
    const ts = Number(punch.timestampMs || 0);
    if (!ts) continue;
    const action = normalizePunchAction(punch.action || punch.punchType || punch.type || "");
    lastAction = action || lastAction;
    lastTimestamp = ts || lastTimestamp;

    if (action === "clockIn") {
      currentClockIn = ts;
      lunchStart = null;
      continue;
    }
    if (action === "startLunch" && currentClockIn) {
      lunchStart = ts;
      continue;
    }
    if (action === "endLunch" && lunchStart) {
      lunchMinutes += Math.max(0, Math.round((ts - lunchStart) / 60000));
      lunchStart = null;
      continue;
    }
    if (action === "clockOut" && currentClockIn) {
      let workedMinutes = Math.max(0, Math.round((ts - currentClockIn) / 60000));
      if (lunchStart) {
        const unresolvedLunch = Math.max(0, Math.round((ts - lunchStart) / 60000));
        lunchMinutes += unresolvedLunch;
        workedMinutes -= unresolvedLunch;
        lunchStart = null;
      }
      if (punch.dateKey === todayKey) todayMinutes += Math.max(0, workedMinutes);
      if (punch.weekKey === weekKey) weekMinutes += Math.max(0, workedMinutes);
      currentClockIn = null;
    }
  }

  let approvalStatus = "Pending";
  if (lastAction === "clockOut") approvalStatus = "Pending";
  else if (lastAction === "startLunch") approvalStatus = "On Lunch";
  else if (lastAction === "clockIn" || lastAction === "endLunch") approvalStatus = "Clocked In";

  return {
    todayHours: Number((todayMinutes / 60).toFixed(2)),
    weekHours: Number((weekMinutes / 60).toFixed(2)),
    lunchMinutes,
    approvalStatus,
    lastAction,
    lastTimestamp
  };
}

function buildWeekPunchDetails(punches, referenceDate = new Date()) {
  const sorted = [...punches].sort((a, b) => Number(a.timestampMs || 0) - Number(b.timestampMs || 0));
  const weekKey = formatDateKey(getMondayDate(referenceDate));
  const todayKey = formatDateKey(referenceDate);
  const daily = {};
  let lastAction = "";
  let lastTimestamp = 0;
  let currentClockIn = null;
  let currentDayKey = "";
  let lunchStart = null;
  let lunchDayKey = "";
  let todayMinutes = 0;
  let weekMinutes = 0;
  let lunchMinutes = 0;

  function ensureDay(dateKey) {
    if (!daily[dateKey]) {
      daily[dateKey] = {
        dateKey,
        clockIn: "",
        lunchStart: "",
        lunchEnd: "",
        clockOut: "",
        workedMinutes: 0,
        lunchMinutes: 0,
        warnings: []
      };
    }
    return daily[dateKey];
  }

  function addWorkedMinutes(dateKey, minutes) {
    const day = ensureDay(dateKey);
    const safeMinutes = Math.max(0, minutes);
    day.workedMinutes += safeMinutes;
    weekMinutes += safeMinutes;
    if (dateKey === todayKey) {
      todayMinutes += safeMinutes;
    }
  }

  function addLunchMinutes(dateKey, minutes) {
    const day = ensureDay(dateKey);
    const safeMinutes = Math.max(0, minutes);
    day.lunchMinutes += safeMinutes;
    lunchMinutes += safeMinutes;
  }

  for (const punch of sorted) {
    const ts = Number(punch.timestampMs || 0);
    if (!ts) continue;
    const dateKey = punch.dateKey || formatDateKey(new Date(ts));
    const day = ensureDay(dateKey);
    const action = normalizePunchAction(punch.action || punch.punchType || punch.type || "");
    lastAction = action || lastAction;
    lastTimestamp = ts || lastTimestamp;

    if (punch.weekKey !== weekKey && dateKey < weekKey) {
      continue;
    }

    if (action === "clockIn") {
      if (currentClockIn) {
        ensureDay(currentDayKey || dateKey).warnings.push("Missing Clock Out");
      }
      currentClockIn = ts;
      currentDayKey = dateKey;
      day.clockIn = day.clockIn || new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      lunchStart = null;
      lunchDayKey = "";
      continue;
    }

    if (action === "startLunch") {
      day.lunchStart = day.lunchStart || new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      if (!currentClockIn) {
        day.warnings.push("Lunch started before Clock In");
        continue;
      }
      addWorkedMinutes(dateKey, Math.round((ts - currentClockIn) / 60000));
      currentClockIn = null;
      lunchStart = ts;
      lunchDayKey = dateKey;
      continue;
    }

    if (action === "endLunch") {
      day.lunchEnd = day.lunchEnd || new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      if (!lunchStart) {
        day.warnings.push("Lunch ended before start");
        currentClockIn = ts;
        currentDayKey = dateKey;
        continue;
      }
      addLunchMinutes(lunchDayKey || dateKey, Math.round((ts - lunchStart) / 60000));
      lunchStart = null;
      lunchDayKey = "";
      currentClockIn = ts;
      currentDayKey = dateKey;
      continue;
    }

    if (action === "clockOut") {
      day.clockOut = day.clockOut || new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      if (!currentClockIn) {
        day.warnings.push("Clock Out without Clock In");
        continue;
      }
      addWorkedMinutes(dateKey, Math.round((ts - currentClockIn) / 60000));
      currentClockIn = null;
      currentDayKey = "";
      lunchStart = null;
      lunchDayKey = "";
    }
  }

  if (currentClockIn) {
    ensureDay(currentDayKey || todayKey).warnings.push("Missing Clock Out");
  }
  if (lunchStart) {
    ensureDay(lunchDayKey || todayKey).warnings.push("Missing Lunch End");
  }

  const dailyRows = Object.values(daily)
    .filter((row) => row.dateKey >= weekKey)
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
    .map((row) => ({
      dateKey: row.dateKey,
      clockIn: row.clockIn || "-",
      lunchStart: row.lunchStart || "-",
      lunchEnd: row.lunchEnd || "-",
      clockOut: row.clockOut || "-",
      workedHours: Number((row.workedMinutes / 60).toFixed(2)),
      lunchMinutes: row.lunchMinutes,
      warnings: row.warnings
    }));

  const missingPunchCount = dailyRows.reduce((sum, row) => sum + row.warnings.length, 0);
  const currentStatus = lastAction === "startLunch"
    ? "On Lunch"
    : (lastAction === "clockIn" || lastAction === "endLunch")
      ? "Clocked In"
      : "Not Clocked In";

  return {
    dailyRows,
    todayHours: Number((todayMinutes / 60).toFixed(2)),
    weekHours: Number((weekMinutes / 60).toFixed(2)),
    lunchMinutes,
    regularHours: Number((Math.min(weekMinutes / 60, 40)).toFixed(2)),
    overtimeHours: Number((Math.max((weekMinutes / 60) - 40, 0)).toFixed(2)),
    missingPunchCount,
    currentStatus,
    lastAction,
    lastTimestamp
  };
}

async function loadPendingRequests(workerId) {
  if (!workerId) return [];
  const snap = await admin
    .firestore()
    .collection("correctionRequests")
    .where("workerId", "==", workerId)
    .where("status", "==", "pending")
    .get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

function validateNextAction(latestAction, nextAction) {
  const previous = normalizePunchAction(latestAction);
  const next = normalizePunchAction(nextAction);

  if (!previous && next !== "clockIn") {
    throw new Error("You must clock in first.");
  }
  if (previous === "clockOut" && next !== "clockIn") {
    throw new Error("You are currently clocked out. Use Clock In first.");
  }
  if ((previous === "clockIn" || previous === "endLunch") && next === "clockIn") {
    throw new Error("You are already clocked in.");
  }
  if ((previous === "clockIn" || previous === "endLunch") && !["startLunch", "clockOut"].includes(next)) {
    throw new Error("Choose Start Lunch or Clock Out next.");
  }
  if (previous === "startLunch" && next !== "endLunch") {
    throw new Error("You are on lunch. Use End Lunch next.");
  }
}

async function upsertTimesheetForWorker(worker, punches) {
  const weekKey = formatDateKey(getMondayDate(new Date()));
  const weekPunches = punches.filter((row) => row.weekKey === weekKey);
  const detail = buildWeekPunchDetails(weekPunches);
  const dailyTotals = Object.fromEntries(detail.dailyRows.map((row) => [row.dateKey, {
    clock_in: row.clockIn === "-" ? "" : row.clockIn,
    start_lunch: row.lunchStart === "-" ? "" : row.lunchStart,
    end_lunch: row.lunchEnd === "-" ? "" : row.lunchEnd,
    clock_out: row.clockOut === "-" ? "" : row.clockOut,
    hours: row.workedHours,
    lunchMinutes: row.lunchMinutes,
    warnings: row.warnings
  }]));
  const nameKey = worker.nameKey || normalizeName(worker.displayName || worker.name || "");
  const docId = `${weekKey}_${nameKey}`;
  const existing = await admin.firestore().collection("timesheets").doc(docId).get();
  const existingData = existing.exists ? existing.data() : {};

  await admin.firestore().collection("timesheets").doc(docId).set({
    workerId: worker.workerId || worker.employeeId || worker.id,
    employeeId: worker.employeeId || worker.workerId || worker.id,
    name: worker.displayName || worker.name || "",
    workerName: worker.displayName || worker.name || "",
    nameKey,
    weekKey,
    companyId: worker.companyId || worker.clientId || "",
    clientId: worker.clientId || worker.companyId || "",
    siteId: worker.siteId || worker.assignedSiteId || "",
    agencyId: worker.agencyId || "",
    agencyName: worker.agencyName || worker.agencyId || "",
    dailyTotals,
    weeklyHours: detail.weekHours,
    regularHours: detail.regularHours,
    overtimeHours: detail.overtimeHours,
    lunchMinutes: detail.lunchMinutes,
    missingPunches: detail.missingPunchCount,
    daysWorked: Object.keys(dailyTotals).length,
    lastPunchAction: detail.lastAction || "",
    lastPunchAtMs: detail.lastTimestamp || 0,
    status: existingData.status || "pending",
    approvalStatus: existingData.approvalStatus || "pending",
    clientApprovedBy: existingData.clientApprovedBy || "",
    clientApprovedAt: existingData.clientApprovedAt || null,
    lockedBy: existingData.lockedBy || "",
    lockedAt: existingData.lockedAt || null,
    managerSignedBy: existingData.managerSignedBy || "",
    managerSignedAt: existingData.managerSignedAt || null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
}

async function appendAuditLog(eventType, entityType, entityId, worker, routeContext, details = {}) {
  const nowIso = new Date().toISOString();
  await admin.firestore().collection("auditLogs").add({
    agencyId: worker.agencyId || routeContext?.agency?.id || "",
    clientId: worker.clientId || worker.companyId || routeContext?.client?.id || "",
    siteId: worker.siteId || worker.assignedSiteId || routeContext?.site?.id || "",
    userId: worker.workerId || worker.employeeId || worker.id || "",
    role: "worker",
    eventType,
    entityType,
    entityId,
    source: "qrtimeclock2",
    createdAt: nowIso,
    details
  });
}

exports.loadWorkerRouteContext = onRequest(async (req, res) => {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST") return jsonError(res, 405, "Method not allowed.");

  try {
    const agencyId = String(req.body?.agencyId || "").trim();
    const siteId = String(req.body?.siteId || "").trim();
    const routeContext = await loadAgencySiteContext(agencyId, siteId);
    return res.json({
      agency: {
        id: routeContext.agency.id,
        name: String(routeContext.agency.name || routeContext.agency.displayName || routeContext.agency.id)
      },
      client: {
        id: routeContext.client.id,
        name: String(routeContext.client.name || routeContext.client.displayName || routeContext.client.id)
      },
      site: {
        id: routeContext.site.id,
        name: String(routeContext.site.name || routeContext.site.displayName || routeContext.site.id),
        address: String(routeContext.site.address || "")
      }
    });
  } catch (error) {
    return jsonError(res, 400, error.message || "Could not load worker route context.");
  }
});

exports.verifyWorkerPinAndGetTime = onRequest(async (req, res) => {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST") return jsonError(res, 405, "Method not allowed.");

  try {
    const { worker, routeContext } = await findWorkerFromPayload(req.body || {});
    const punches = await loadWorkerPunches(worker.workerId || worker.employeeId || worker.id);
    const details = buildWeekPunchDetails(punches);
    const pendingRequests = await loadPendingRequests(worker.workerId || worker.employeeId || worker.id);
    const recentPunches = punches.slice(-25).reverse();
    return res.json({
      worker: {
        id: worker.workerId || worker.employeeId || worker.id,
        displayName: worker.displayName || worker.name || "",
        agencyId: worker.agencyId || "",
        agencyName: routeContext.agency.name || worker.agencyName || worker.agencyId || "",
        clientId: routeContext.client.id || worker.clientId || worker.companyId || "",
        clientName: routeContext.client.name || "",
        siteId: routeContext.site.id || worker.siteId || worker.assignedSiteId || "",
        siteName: routeContext.site.name || ""
      },
      recentPunches,
      summary: {
        todayHours: details.todayHours,
        weekHours: details.weekHours,
        regularHours: details.regularHours,
        overtimeHours: details.overtimeHours,
        lunchMinutes: details.lunchMinutes,
        approvalStatus: pendingRequests.length ? "Pending Corrections" : details.currentStatus,
        currentStatus: details.currentStatus,
        lastAction: details.lastAction,
        lastTimestamp: details.lastTimestamp,
        missingPunchCount: details.missingPunchCount,
        pendingRequestCount: pendingRequests.length
      },
      dailyRows: details.dailyRows,
      pendingRequests
    });
  } catch (error) {
    return jsonError(res, 400, error.message || "Could not verify worker PIN.");
  }
});

exports.createWorkerPunch = onRequest(async (req, res) => {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST") return jsonError(res, 405, "Method not allowed.");

  try {
    const payload = req.body || {};
    const normalizedAction = normalizePunchAction(payload.action);
    if (!isAllowedAction(normalizedAction)) {
      throw new Error("Invalid punch action.");
    }

    const { worker, routeContext } = await findWorkerFromPayload(payload);
    const workerId = worker.workerId || worker.employeeId || worker.id;
    const punches = await loadWorkerPunches(workerId);
    const latestPunch = punches[punches.length - 1] || null;
    validateNextAction(latestPunch?.action || latestPunch?.type || "", normalizedAction);

    const now = Date.now();
    const nowDate = new Date(now);
    const nowIso = new Date(now).toISOString();
    const punchDoc = {
      agencyId: routeContext.agency.id,
      clientId: routeContext.client.id,
      siteId: routeContext.site.id,
      workerId,
      workerName: worker.displayName || worker.name || payload.workerName,
      type: actionToPunchType(normalizedAction),
      action: normalizedAction,
      timestampMs: now,
      timestamp: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
      dateKey: formatDateKey(nowDate),
      weekKey: formatDateKey(getMondayDate(nowDate)),
      companyId: routeContext.client.id,
      companyName: routeContext.client.name,
      clientName: routeContext.client.name,
      siteName: routeContext.site.name,
      agencyName: routeContext.agency.name || worker.agencyName || worker.agencyId || "",
      source: "qrtimeclock2",
      status: "active",
      createdByRole: "worker",
      createdBy: workerId,
      deviceInfo: String(payload.deviceInfo || ""),
      employeeId: worker.employeeId || workerId,
      employeeNumber: worker.employeeNumber || "",
      name: worker.displayName || worker.name || payload.workerName,
      nameKey: worker.nameKey || normalizeName(payload.workerName)
    };

    const punchRef = await admin.firestore().collection("punches").add(punchDoc);
    const updatedPunches = punches.concat([{ id: punchRef.id, ...punchDoc }]);
    await upsertTimesheetForWorker(worker, updatedPunches);
    await appendAuditLog("worker_punch_created", "punches", punchRef.id, worker, routeContext, {
      action: normalizedAction,
      type: punchDoc.type,
      timestamp: punchDoc.timestamp
    });

    return res.json({
      ok: true,
      punch: { id: punchRef.id, ...punchDoc }
    });
  } catch (error) {
    return jsonError(res, 400, error.message || "Could not save worker punch.");
  }
});

exports.createPunchRequest = onRequest(async (req, res) => {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST") return jsonError(res, 405, "Method not allowed.");

  try {
    const payload = req.body || {};
    const normalizedAction = normalizePunchAction(payload.punchType || payload.requestedAction);
    if (!isAllowedAction(normalizedAction)) {
      throw new Error("Invalid requested punch action.");
    }
    const { worker, routeContext } = await findWorkerFromPayload(payload);
    const requestedTimestamp = Number(payload.requestedTimestampMs || 0);
    if (!requestedTimestamp) {
      throw new Error("Requested date and time are required.");
    }
    const requestedDate = String(payload.requestedDate || formatDateKey(new Date(requestedTimestamp)));
    const requestedTime = String(payload.requestedTime || new Date(requestedTimestamp).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit"
    }));
    const nowIso = new Date().toISOString();

    const requestDoc = {
      agencyId: routeContext.agency.id,
      agencyName: routeContext.agency.name || worker.agencyName || worker.agencyId || "",
      companyId: routeContext.client.id,
      companyName: routeContext.client.name,
      clientId: routeContext.client.id,
      clientName: routeContext.client.name,
      siteId: routeContext.site.id,
      siteName: routeContext.site.name,
      workerId: worker.workerId || worker.employeeId || worker.id,
      workerName: worker.displayName || worker.name || payload.workerName || "",
      requestedDate,
      punchType: actionToPunchType(normalizedAction),
      requestedAction: normalizedAction,
      requestedTime,
      requestedTimestampMs: requestedTimestamp,
      requestedTimestamp: new Date(requestedTimestamp).toISOString(),
      requestedLocalDate: String(payload.requestedLocalDate || requestedDate),
      reason: String(payload.reason || ""),
      note: String(payload.note || ""),
      status: "pending",
      source: "qrtimeclock2",
      createdAt: nowIso,
      updatedAt: nowIso,
      deviceInfo: String(payload.deviceInfo || "")
    };

    const docRef = await admin.firestore().collection("correctionRequests").add(requestDoc);
    await appendAuditLog("worker_correction_requested", "correctionRequests", docRef.id, worker, routeContext, {
      punchType: requestDoc.punchType,
      requestedDate,
      requestedTime,
      reason: requestDoc.reason
    });
    return res.json({ ok: true, requestId: docRef.id });
  } catch (error) {
    return jsonError(res, 400, error.message || "Could not create punch request.");
  }
});
