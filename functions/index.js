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

function isAllowedAction(action) {
  return ["clock_in", "start_lunch", "end_lunch", "clock_out"].includes(action);
}

async function findWorkerFromPayload(payload) {
  const workerName = String(payload.workerName || "").trim();
  const pin = String(payload.pin || "").trim();
  const agencyId = String(payload.agencyId || "").trim();
  const clientId = String(payload.clientId || "").trim();
  const siteId = String(payload.siteId || "").trim();

  if (!workerName || !pin || !agencyId || !clientId || !siteId) {
    throw new Error("Worker name, PIN, staffing company, company/client, and site are required.");
  }

  const workerSnap = await admin
    .firestore()
    .collection("workers")
    .where("nameKey", "==", normalizeName(workerName))
    .where("status", "==", "active")
    .get();

  if (workerSnap.empty) {
    throw new Error("No active worker was found for that name.");
  }

  const matches = workerSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((worker) => {
      if ((worker.agencyId || "") !== agencyId) return false;
      if (clientId && (worker.clientId || worker.companyId) !== clientId) return false;
      if (siteId && (worker.siteId || worker.assignedSiteId) !== siteId) return false;
      const scope = worker.agencyId || worker.clientId || worker.companyId || "default";
      return worker.pinHash === hashWorkerPin(pin, scope);
    });

  if (!matches.length) {
    throw new Error("PIN did not match an active worker for this company/site.");
  }

  return matches[0];
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
    lastAction = punch.action || lastAction;
    lastTimestamp = ts || lastTimestamp;

    if (punch.action === "clock_in") {
      currentClockIn = ts;
      lunchStart = null;
      continue;
    }
    if (punch.action === "start_lunch" && currentClockIn) {
      lunchStart = ts;
      continue;
    }
    if (punch.action === "end_lunch" && lunchStart) {
      lunchMinutes += Math.max(0, Math.round((ts - lunchStart) / 60000));
      lunchStart = null;
      continue;
    }
    if (punch.action === "clock_out" && currentClockIn) {
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
  if (lastAction === "clock_out") approvalStatus = "Pending";
  else if (lastAction === "start_lunch") approvalStatus = "On Lunch";
  else if (lastAction === "clock_in" || lastAction === "end_lunch") approvalStatus = "Clocked In";

  return {
    todayHours: Number((todayMinutes / 60).toFixed(2)),
    weekHours: Number((weekMinutes / 60).toFixed(2)),
    lunchMinutes,
    approvalStatus,
    lastAction,
    lastTimestamp
  };
}

function validateNextAction(latestAction, nextAction) {
  if (!latestAction && nextAction !== "clock_in") {
    throw new Error("You must clock in first.");
  }
  if (latestAction === "clock_out" && nextAction !== "clock_in") {
    throw new Error("You are currently clocked out. Use Clock In first.");
  }
  if ((latestAction === "clock_in" || latestAction === "end_lunch") && nextAction === "clock_in") {
    throw new Error("You are already clocked in.");
  }
  if ((latestAction === "clock_in" || latestAction === "end_lunch") && !["start_lunch", "clock_out"].includes(nextAction)) {
    throw new Error("Choose Start Lunch or Clock Out next.");
  }
  if (latestAction === "start_lunch" && nextAction !== "end_lunch") {
    throw new Error("You are on lunch. Use End Lunch next.");
  }
}

async function upsertTimesheetForWorker(worker, punches) {
  const weekKey = formatDateKey(getMondayDate(new Date()));
  const weekPunches = punches.filter((row) => row.weekKey === weekKey);
  const dailyTotals = {};
  for (const punch of weekPunches) {
    const dateKey = punch.dateKey || formatDateKey(new Date(punch.timestampMs));
    if (!dailyTotals[dateKey]) {
      dailyTotals[dateKey] = {
        clock_in: "",
        start_lunch: "",
        end_lunch: "",
        clock_out: "",
        hours: 0
      };
    }
    dailyTotals[dateKey][punch.action] = new Date(punch.timestampMs).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit"
    });
  }

  const summary = deriveSummary(weekPunches);
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
    weeklyHours: summary.weekHours,
    daysWorked: Object.keys(dailyTotals).length,
    lastPunchAction: summary.lastAction || "",
    lastPunchAtMs: summary.lastTimestamp || 0,
    status: existingData.status || "open",
    managerSignedBy: existingData.managerSignedBy || "",
    managerSignedAt: existingData.managerSignedAt || null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
}

exports.verifyWorkerPinAndGetTime = onRequest(async (req, res) => {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST") return jsonError(res, 405, "Method not allowed.");

  try {
    const worker = await findWorkerFromPayload(req.body || {});
    const punches = await loadWorkerPunches(worker.workerId || worker.employeeId || worker.id);
    const recentPunches = punches.slice(-25).reverse();
    const summary = deriveSummary(punches);
    return res.json({
      worker: {
        id: worker.workerId || worker.employeeId || worker.id,
        displayName: worker.displayName || worker.name || "",
        agencyId: worker.agencyId || "",
        agencyName: worker.agencyName || worker.agencyId || "",
        clientId: worker.clientId || worker.companyId || "",
        siteId: worker.siteId || worker.assignedSiteId || ""
      },
      recentPunches,
      summary
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
    if (!isAllowedAction(payload.action)) {
      throw new Error("Invalid punch action.");
    }

    const worker = await findWorkerFromPayload(payload);
    const workerId = worker.workerId || worker.employeeId || worker.id;
    const punches = await loadWorkerPunches(workerId);
    const latestPunch = punches[punches.length - 1] || null;
    validateNextAction(latestPunch?.action || "", payload.action);

    const now = Date.now();
    const nowDate = new Date(now);
    const punchDoc = {
      workerId,
      employeeId: worker.employeeId || workerId,
      employeeNumber: worker.employeeNumber || "",
      name: worker.displayName || worker.name || payload.workerName,
      workerName: worker.displayName || worker.name || payload.workerName,
      nameKey: worker.nameKey || normalizeName(payload.workerName),
      action: payload.action,
      timestampMs: now,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      dateKey: formatDateKey(nowDate),
      weekKey: formatDateKey(getMondayDate(nowDate)),
      companyId: worker.companyId || worker.clientId || payload.clientId || "",
      clientId: worker.clientId || worker.companyId || payload.clientId || "",
      siteId: worker.siteId || worker.assignedSiteId || payload.siteId || "",
      agencyId: worker.agencyId || payload.agencyId || "",
      agencyName: worker.agencyName || worker.agencyId || payload.agencyId || "",
      source: "workerSelfService",
      status: "pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      deviceInfo: String(payload.deviceInfo || "")
    };

    const punchRef = await admin.firestore().collection("punches").add(punchDoc);
    const updatedPunches = punches.concat([{ id: punchRef.id, ...punchDoc }]);
    await upsertTimesheetForWorker(worker, updatedPunches);

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
    if (!isAllowedAction(payload.requestedAction)) {
      throw new Error("Invalid requested punch action.");
    }
    const worker = await findWorkerFromPayload(payload);
    const requestedTimestamp = Number(payload.requestedTimestampMs || 0);
    if (!requestedTimestamp) {
      throw new Error("Requested date and time are required.");
    }

    const requestDoc = {
      agencyId: worker.agencyId || payload.agencyId || "",
      agencyName: worker.agencyName || worker.agencyId || payload.agencyId || "",
      clientId: worker.clientId || worker.companyId || payload.clientId || "",
      siteId: worker.siteId || worker.assignedSiteId || payload.siteId || "",
      workerId: worker.workerId || worker.employeeId || worker.id,
      employeeId: worker.employeeId || worker.workerId || worker.id,
      workerName: worker.displayName || worker.name || payload.workerName || "",
      name: worker.displayName || worker.name || payload.workerName || "",
      requestedAction: payload.requestedAction,
      originalPunchId: String(payload.originalPunchId || ""),
      requestedTimestampMs: requestedTimestamp,
      requestedTimestamp,
      requestedLocalDate: String(payload.requestedLocalDate || ""),
      requestedDate: formatDateKey(new Date(requestedTimestamp)),
      requestedTime: new Date(requestedTimestamp).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit"
      }),
      reason: String(payload.reason || ""),
      status: "pending",
      source: "workerSelfService",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      deviceInfo: String(payload.deviceInfo || "")
    };

    const docRef = await admin.firestore().collection("punchRequests").add(requestDoc);
    return res.json({ ok: true, requestId: docRef.id });
  } catch (error) {
    return jsonError(res, 400, error.message || "Could not create punch request.");
  }
});
