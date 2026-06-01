import { firebaseConfig, firebaseEnabled, functionsBaseUrl, appSettings } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  sendPasswordResetEmail
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  Timestamp
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

let app = null;
let auth = null;
let db = null;

if (firebaseEnabled) {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (error) {
    console.error('Firebase failed to initialize in QRTIMECLOCK2:', error);
  }
}

const state = {
  me: null,
  profile: null,
  companyId: null,        // from user profile
  agencyId: null,         // from user profile (null = direct company user)
  companyDoc: null,       // loaded from companies/{companyId}
  unsubscribers: [],
  selectedWeekStart: getMondayDate(new Date()),
  workerUnsub: null,
  workerEmployee: null,      // looked-up employee record for public punch
  publicEmployees: [],       // cached employee list for public QR autocomplete
  workerTimeSnapshot: null,
  allPunchRows: [],
  selectedWeekPunchRows: [],
  selectedWeekTimesheetDocs: {},
  allEmployees: [],
  allMissedRequests: [],
  approvalFilter: 'pending',
};

const els = {
  workerNameInput: document.getElementById('workerNameInput'),
  workerPinInput: document.getElementById('workerPinInput'),
  workerAgencyInput: document.getElementById('workerAgencyInput'),
  workerClientInput: document.getElementById('workerClientInput'),
  workerSiteInput: document.getElementById('workerSiteInput'),
  workerAutocompleteList: document.getElementById('workerAutocompleteList'),
  workerLookupStatus: document.getElementById('workerLookupStatus'),
  workerNameValue: document.getElementById('workerNameValue'),
  workerAgencyValue: document.getElementById('workerAgencyValue'),
  workerLastActionValue: document.getElementById('workerLastActionValue'),
  workerLastPunchValue: document.getElementById('workerLastPunchValue'),
  workerStatusValue: document.getElementById('workerStatusValue'),
  workerStatusMessage: document.getElementById('workerStatusMessage'),
  workerHistoryBody: document.getElementById('workerHistoryBody'),
  workerViewTimeBtn: document.getElementById('workerViewTimeBtn'),
  workerRequestFixBtn: document.getElementById('workerRequestFixBtn'),
  workerMyTimePanel: document.getElementById('workerMyTimePanel'),
  workerFixPanel: document.getElementById('workerFixPanel'),
  workerLoadTimeBtn: document.getElementById('workerLoadTimeBtn'),
  workerTodayHoursValue: document.getElementById('workerTodayHoursValue'),
  workerWeekHoursValue: document.getElementById('workerWeekHoursValue'),
  workerLunchMinutesValue: document.getElementById('workerLunchMinutesValue'),
  workerApprovalStatusValue: document.getElementById('workerApprovalStatusValue'),
  workerMyTimeBody: document.getElementById('workerMyTimeBody'),
  workerFixForm: document.getElementById('workerFixForm'),
  workerFixActionInput: document.getElementById('workerFixActionInput'),
  workerFixDateInput: document.getElementById('workerFixDateInput'),
  workerFixTimeInput: document.getElementById('workerFixTimeInput'),
  workerFixReasonInput: document.getElementById('workerFixReasonInput'),

  authCard: document.getElementById('authCard'),
  appShell: document.getElementById('appShell'),
  sessionChip: document.getElementById('sessionChip'),
  sessionName: document.getElementById('sessionName'),
  sessionRole: document.getElementById('sessionRole'),
  signOutBtn: document.getElementById('signOutBtn'),
  loginForm: document.getElementById('loginForm'),
  emailInput: document.getElementById('emailInput'),
  passwordInput: document.getElementById('passwordInput'),
  resetPasswordBtn: document.getElementById('resetPasswordBtn'),

  livePunchBody: document.getElementById('livePunchBody'),
  activeNowList: document.getElementById('activeNowList'),
  timesheetBody: document.getElementById('timesheetBody'),
  weekPicker: document.getElementById('weekPicker'),
  managerTabBtn: document.getElementById('managerTabBtn'),
  timesheetsTabBtn: document.getElementById('timesheetsTabBtn'),
  editPunchesTabBtn: document.getElementById('editPunchesTabBtn'),
  adminTabBtn: document.getElementById('adminTabBtn'),
  agencyTabBtn: document.getElementById('agencyTabBtn'),
  tabBar: document.getElementById('tabBar'),

  manualPunchForm: document.getElementById('manualPunchForm'),
  manualPunchNameInput: document.getElementById('manualPunchNameInput'),
  manualPunchActionInput: document.getElementById('manualPunchActionInput'),
  manualPunchDateInput: document.getElementById('manualPunchDateInput'),
  manualPunchTimeInput: document.getElementById('manualPunchTimeInput'),
  editFilterNameInput: document.getElementById('editFilterNameInput'),
  editPunchesBody: document.getElementById('editPunchesBody'),

  userProfileForm: document.getElementById('userProfileForm'),
  userUidInput: document.getElementById('userUidInput'),
  userNameInput: document.getElementById('userNameInput'),
  userEmailInput: document.getElementById('userEmailInput'),
  userRoleInput: document.getElementById('userRoleInput'),
  userActiveInput: document.getElementById('userActiveInput'),
  userListBody: document.getElementById('userListBody'),

  myTimecardTabBtn: document.getElementById('myTimecardTabBtn'),
  missedPunchTabBtn: document.getElementById('missedPunchTabBtn'),
  missedPunchForm: document.getElementById('missedPunchForm'),
  mpActionInput: document.getElementById('mpActionInput'),
  mpDateInput: document.getElementById('mpDateInput'),
  mpTimeInput: document.getElementById('mpTimeInput'),
  mpReasonInput: document.getElementById('mpReasonInput'),
  myMissedPunchBody: document.getElementById('myMissedPunchBody'),
  myTimecardWeekPicker: document.getElementById('myTimecardWeekPicker'),
  myTcTotalHours: document.getElementById('myTcTotalHours'),
  myTcDaysWorked: document.getElementById('myTcDaysWorked'),
  myTcLastPunch: document.getElementById('myTcLastPunch'),
  myTcStatus: document.getElementById('myTcStatus'),
  myTimecardBody: document.getElementById('myTimecardBody'),

  approvalsTabBtn: document.getElementById('approvalsTabBtn'),
  approvalFilterAll: document.getElementById('approvalFilterAll'),
  approvalFilterPending: document.getElementById('approvalFilterPending'),
  approvalFilterApproved: document.getElementById('approvalFilterApproved'),
  approvalFilterDenied: document.getElementById('approvalFilterDenied'),
  approvalListBody: document.getElementById('approvalListBody'),

  employeesTabBtn: document.getElementById('employeesTabBtn'),
  employeeForm: document.getElementById('employeeForm'),
  employeeDocId: document.getElementById('employeeDocId'),
  empNameInput: document.getElementById('empNameInput'),
  empNumberInput: document.getElementById('empNumberInput'),
  empAgencyInput: document.getElementById('empAgencyInput'),
  empClientInput: document.getElementById('empClientInput'),
  empSiteInput: document.getElementById('empSiteInput'),
  empPinInput: document.getElementById('empPinInput'),
  empStatusSelect: document.getElementById('empStatusSelect'),
  empCancelEditBtn: document.getElementById('empCancelEditBtn'),
  empFilterInput: document.getElementById('empFilterInput'),
  employeeListBody: document.getElementById('employeeListBody'),

  agencyWorkerSelect: document.getElementById('agencyWorkerSelect'),
  agencyPreviewBtn: document.getElementById('agencyPreviewBtn'),
  agencyPrintBtn: document.getElementById('agencyPrintBtn'),
  agencyPreview: document.getElementById('agencyPreview'),

  toast: document.getElementById('toast'),
};

init();

async function init() {
  wireEvents();
  prefillPublicPunchContext();

  if (!firebaseReady()) {
    showLoggedOut();
    renderFirebaseUnavailable();
    return;
  }

  // Load employees for public QR autocomplete
  loadPublicEmployees();

  // Restore last-used worker name
  const storedWorkerName = localStorage.getItem('workerPunchName') || '';
  if (storedWorkerName) {
    const pretty = prettifyHumanName(storedWorkerName);
    if (els.workerNameInput) els.workerNameInput.value = pretty;
    if (els.workerNameValue) els.workerNameValue.textContent = pretty;
    // Try to match to an existing employee
    restoreWorkerFromName(pretty);
  }

  if (els.weekPicker) {
    els.weekPicker.value = formatDateInput(state.selectedWeekStart);
  }

  if (els.manualPunchDateInput) {
    els.manualPunchDateInput.value = formatDateInput(new Date());
  }

  if (els.manualPunchTimeInput) {
    els.manualPunchTimeInput.value = formatTimeForInput(Date.now());
  }
  if (els.workerFixDateInput) {
    els.workerFixDateInput.value = formatDateInput(new Date());
  }
  if (els.workerFixTimeInput) {
    els.workerFixTimeInput.value = formatTimeForInput(Date.now());
  }

  applyWorkerAvailabilityState();

  onAuthStateChanged(auth, async (user) => {
    clearLiveListeners();

    if (!user) {
      state.me = null;
      state.profile = null;
      showLoggedOut();
      return;
    }

    try {
      state.me = user;
      const profileSnap = await getDoc(doc(db, 'users', user.uid));

      if (!profileSnap.exists()) {
        await signOut(auth);
        toast('No user profile found in Firestore. Add one in the users collection first.', true);
        return;
      }

      state.profile = profileSnap.data();
      state.companyId = state.profile.companyId || null;
      state.agencyId = state.profile.agencyId || null;

      // Load company doc if companyId exists
      if (state.companyId) {
        try {
          const compSnap = await getDoc(doc(db, 'companies', state.companyId));
          state.companyDoc = compSnap.exists() ? compSnap.data() : null;
        } catch (_) {
          state.companyDoc = null;
        }
      }

      showLoggedIn();
      attachRoleViews();
      attachManagerLiveViews();
      attachTimesheetView();
      attachUsersViewIfAdmin();
      populateAgencyWorkerSelect();
      renderAgencyPreview();
    } catch (error) {
      console.error(error);
      toast(error.message || 'Sign-in setup failed.', true);
    }
  });
}

function wireEvents() {
  document.querySelectorAll('.worker-action-btn').forEach((btn) => {
    btn.addEventListener('click', () => handleWorkerPunch(btn.dataset.action));
  });

  // Name input with autocomplete
  els.workerNameInput?.addEventListener('input', debounce(handleWorkerNameAutocomplete, 250));
  els.workerNameInput?.addEventListener('focus', () => handleWorkerNameAutocomplete());
  els.workerNameInput?.addEventListener('keydown', handleAutocompleteKeydown);
  els.workerViewTimeBtn?.addEventListener('click', () => toggleWorkerPanel('time'));
  els.workerRequestFixBtn?.addEventListener('click', () => toggleWorkerPanel('fix'));
  els.workerLoadTimeBtn?.addEventListener('click', loadWorkerTimeSnapshot);
  els.workerFixForm?.addEventListener('submit', handlePublicPunchRequestSubmit);

  // Close autocomplete on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.autocomplete-wrap')) {
      hideAutocomplete();
    }
  });

  els.loginForm?.addEventListener('submit', handleLogin);
  els.resetPasswordBtn?.addEventListener('click', handlePasswordReset);

  els.signOutBtn?.addEventListener('click', async () => {
    await signOut(auth);
  });

  els.weekPicker?.addEventListener('change', () => {
    state.selectedWeekStart = new Date(`${els.weekPicker.value}T00:00:00`);
    if (state.me && isManager()) {
      clearTimesheetListenerOnly();
      attachTimesheetView();
    }
  });

  els.tabBar?.addEventListener('click', (event) => {
    const btn = event.target.closest('.tab');
    if (!btn) return;
    switchTab(btn.dataset.tab);
  });

  els.manualPunchForm?.addEventListener('submit', handleManualPunchSubmit);

  els.editFilterNameInput?.addEventListener('input', () => {
    renderEditPunchesTable(state.allPunchRows);
  });

  els.userProfileForm?.addEventListener('submit', handleSaveProfile);

  els.missedPunchForm?.addEventListener('submit', handleMissedPunchSubmit);

  els.myTimecardWeekPicker?.addEventListener('change', () => {
    if (state.me && isEmployee()) {
      clearMyTimecardListener();
      attachMyTimecardView();
    }
  });

  [['approvalFilterAll', 'all'], ['approvalFilterPending', 'pending'],
   ['approvalFilterApproved', 'approved'], ['approvalFilterDenied', 'denied']].forEach(([id, val]) => {
    els[id]?.addEventListener('click', () => {
      state.approvalFilter = val;
      renderApprovalList(state.allMissedRequests);
    });
  });

  els.employeeForm?.addEventListener('submit', handleSaveEmployee);
  els.empCancelEditBtn?.addEventListener('click', cancelEmployeeEdit);
  els.empFilterInput?.addEventListener('input', () => renderEmployeeList(state.allEmployees || []));

  els.agencyPreviewBtn?.addEventListener('click', () => renderAgencyPreview());
  els.agencyPrintBtn?.addEventListener('click', () => printAgencyPreview());
  els.agencyWorkerSelect?.addEventListener('change', () => renderAgencyPreview());
}

// ─── Public employee loading & autocomplete ─────────────
async function loadPublicEmployees() {
  state.publicEmployees = [];
}

function restoreWorkerFromName(name) {
  const nameKey = normalizeName(name);
  const match = state.publicEmployees.find((e) => normalizeName(e.name) === nameKey);
  if (match) {
    state.workerEmployee = match;
    if (els.workerLookupStatus) {
      els.workerLookupStatus.textContent = `✓ Welcome back, ${match.name}. Ready to punch.`;
      els.workerLookupStatus.style.borderColor = 'rgba(43,213,118,0.4)';
    }
  }
}

let _acActiveIndex = -1;

function handleWorkerNameAutocomplete() {
  const raw = els.workerNameInput?.value.trim() || '';
  const typed = prettifyHumanName(raw);
  if (els.workerNameValue) els.workerNameValue.textContent = typed || '-';

  if (typed.length < 2) {
    state.workerEmployee = null;
    hideAutocomplete();
    if (els.workerLookupStatus) {
      els.workerLookupStatus.textContent = 'Type your name to begin.';
      els.workerLookupStatus.style.borderColor = '';
    }
    return;
  }

  const lower = typed.toLowerCase();
  const matches = state.publicEmployees.filter((e) =>
    (e.name || '').toLowerCase().includes(lower)
  ).slice(0, 8);

  // Check for exact match
  const exactMatch = state.publicEmployees.find(
    (e) => normalizeName(e.name) === normalizeName(typed)
  );

  if (exactMatch) {
    state.workerEmployee = exactMatch;
    if (els.workerLookupStatus) {
      els.workerLookupStatus.textContent = `✓ Found: ${exactMatch.name} (${exactMatch.employeeNumber || 'new'}). Ready to punch.`;
      els.workerLookupStatus.style.borderColor = 'rgba(43,213,118,0.4)';
    }
    hideAutocomplete();
    localStorage.setItem('workerPunchName', exactMatch.name);
    attachWorkerLiveView(exactMatch.name);
    return;
  }

  // No exact match — show suggestions + "new worker" option
  state.workerEmployee = null;
  if (els.workerLookupStatus) {
    els.workerLookupStatus.textContent = matches.length
      ? `${matches.length} match${matches.length > 1 ? 'es' : ''} found. Select or keep typing.`
      : `New worker — "${typed}" will be created on first punch.`;
    els.workerLookupStatus.style.borderColor = matches.length ? '' : 'rgba(59,213,118,0.4)';
  }

  renderAutocomplete(matches, typed);
}

function renderAutocomplete(matches, typed) {
  const list = els.workerAutocompleteList;
  if (!list) return;

  _acActiveIndex = -1;
  let html = '';

  matches.forEach((emp, i) => {
    html += `<li data-index="${i}" data-emp-id="${emp.id}">
      ${escapeHTML(emp.name)}<span class="emp-num">${escapeHTML(emp.employeeNumber || '')}</span>
    </li>`;
  });

  // Always show "new worker" option at the bottom if typed name doesn't match
  if (typed.length >= 2) {
    html += `<li class="new-worker" data-index="${matches.length}" data-new="true">
      + Create new: "${escapeHTML(typed)}"
    </li>`;
  }

  list.innerHTML = html;
  list.hidden = false;

  // Wire click handlers
  list.querySelectorAll('li').forEach((li) => {
    li.addEventListener('click', () => {
      if (li.dataset.new === 'true') {
        selectNewWorker(typed);
      } else {
        const emp = matches[parseInt(li.dataset.index)];
        selectAutocompleteEmployee(emp);
      }
    });
  });
}

function handleAutocompleteKeydown(e) {
  const list = els.workerAutocompleteList;
  if (!list || list.hidden) return;

  const items = list.querySelectorAll('li');
  if (!items.length) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    _acActiveIndex = Math.min(_acActiveIndex + 1, items.length - 1);
    updateActiveItem(items);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    _acActiveIndex = Math.max(_acActiveIndex - 1, 0);
    updateActiveItem(items);
  } else if (e.key === 'Enter' && _acActiveIndex >= 0) {
    e.preventDefault();
    items[_acActiveIndex]?.click();
  } else if (e.key === 'Escape') {
    hideAutocomplete();
  }
}

function updateActiveItem(items) {
  items.forEach((li, i) => li.classList.toggle('active', i === _acActiveIndex));
}

function selectAutocompleteEmployee(emp) {
  state.workerEmployee = emp;
  if (els.workerNameInput) els.workerNameInput.value = emp.name;
  if (els.workerNameValue) els.workerNameValue.textContent = emp.name;
  if (els.workerLookupStatus) {
    els.workerLookupStatus.textContent = `✓ Found: ${emp.name} (${emp.employeeNumber || ''}). Ready to punch.`;
    els.workerLookupStatus.style.borderColor = 'rgba(43,213,118,0.4)';
  }
  hideAutocomplete();
  localStorage.setItem('workerPunchName', emp.name);
  attachWorkerLiveView(emp.name);
}

function selectNewWorker(typed) {
  const pretty = prettifyHumanName(typed);
  // Set a placeholder worker employee — will be auto-created on punch
  state.workerEmployee = { _isNew: true, name: pretty, nameKey: normalizeName(pretty) };
  if (els.workerNameInput) els.workerNameInput.value = pretty;
  if (els.workerNameValue) els.workerNameValue.textContent = pretty;
  if (els.workerLookupStatus) {
    els.workerLookupStatus.textContent = `✓ New worker: "${pretty}". Punch to clock in and create profile.`;
    els.workerLookupStatus.style.borderColor = 'rgba(43,213,118,0.4)';
  }
  hideAutocomplete();
  localStorage.setItem('workerPunchName', pretty);
}

function hideAutocomplete() {
  if (els.workerAutocompleteList) {
    els.workerAutocompleteList.hidden = true;
    els.workerAutocompleteList.innerHTML = '';
  }
  _acActiveIndex = -1;
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function handleWorkerPunch(action) {
  if (!workerFunctionsReady()) {
    toast('Worker PIN punching is not connected yet.', true);
    return;
  }
  const workerContext = collectWorkerIdentity();
  if (!workerContext) return;

  try {
    const result = await callWorkerFunction('createWorkerPunch', {
      ...workerContext,
      action
    });
    const punch = result?.punch || {};
    const savedAt = Number(punch.timestampMs || Date.now());

    if (els.workerLastActionValue) els.workerLastActionValue.textContent = prettyAction(action);
    if (els.workerLastPunchValue) els.workerLastPunchValue.textContent = formatDateTime(savedAt);
    if (els.workerStatusValue) els.workerStatusValue.textContent = statusLabelForAction(action);
    if (els.workerStatusMessage) {
      els.workerStatusMessage.textContent = `${prettyAction(action)} saved for ${workerContext.workerName} at ${formatDateTime(savedAt)}.`;
    }

    localStorage.setItem('workerPunchName', workerContext.workerName);
    await loadWorkerTimeSnapshot();
    toast(`${prettyAction(action)} saved.`);
  } catch (error) {
    console.error(error);
    toast(error.message || "Punch didn't go through. Submit a time fix request.", true);
    toggleWorkerPanel('fix');
  }
}

async function handleManualPunchSubmit(event) {
  event.preventDefault();

  if (!isManager()) {
    toast('Only managers and admins can add manual punches.', true);
    return;
  }

  const name = prettifyHumanName(els.manualPunchNameInput?.value.trim());
  const nameKey = normalizeName(name);
  const action = els.manualPunchActionInput?.value;
  const dateValue = els.manualPunchDateInput?.value;
  const timeValue = els.manualPunchTimeInput?.value;

  if (!name || !nameKey) {
    toast('Enter a valid name.', true);
    return;
  }

  if (!action || !dateValue || !timeValue) {
    toast('Fill out all manual punch fields.', true);
    return;
  }

  const parsedMs = parseLocalDateAndTime(dateValue, timeValue);
  if (!parsedMs) {
    toast('Invalid date or time.', true);
    return;
  }

  const punchDate = new Date(parsedMs);
  const dateKey = formatDateKey(punchDate);
  const weekKey = formatDateKey(getMondayDate(punchDate));

  try {
    await addDoc(collection(db, 'punches'), {
      name,
      nameKey,
      action,
      timestamp: serverTimestamp(),
      timestampMs: parsedMs,
      dateKey,
      weekKey,
      source: 'manual_manager',
      createdAt: serverTimestamp(),
      createdBy: state.profile?.name || state.me?.email || 'Manager',
      companyId: state.companyId || '',
      clientId: state.companyId || '',
      agencyId: state.agencyId || '',
      employeeId: '',
    });

    await addDoc(collection(db, 'punch_edits'), {
      type: 'manual_add',
      name,
      nameKey,
      action,
      timestampMs: parsedMs,
      dateKey,
      weekKey,
      source: 'manual_manager',
      editedBy: state.profile?.name || state.me?.email || 'Manager',
      editedAt: serverTimestamp(),
      companyId: state.companyId || '',
      clientId: state.companyId || '',
      agencyId: state.agencyId || '',
    });

    els.manualPunchForm?.reset();
    if (els.manualPunchDateInput) els.manualPunchDateInput.value = formatDateInput(new Date());
    if (els.manualPunchTimeInput) els.manualPunchTimeInput.value = formatTimeForInput(Date.now());

    toast('Manual punch added.');
  } catch (error) {
    console.error(error);
    toast(error.message || 'Could not add manual punch.', true);
  }
}

function attachWorkerLiveView(name) {
  if (!firebaseReady() || !state.me) return;
  if (state.workerUnsub) {
    try { state.workerUnsub(); } catch (_) {}
    state.workerUnsub = null;
  }

  const nameKey = normalizeName(name);
  if (!nameKey) return;

  const todayKey = formatDateKey(new Date());

  const q = query(
    collection(db, 'punches'),
    where('nameKey', '==', nameKey),
    where('dateKey', '==', todayKey),
    orderBy('timestampMs', 'desc'),
    limit(20)
  );

  state.workerUnsub = onSnapshot(q, (snap) => {
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    if (!rows.length) {
      if (els.workerLastActionValue) els.workerLastActionValue.textContent = '-';
      if (els.workerLastPunchValue) els.workerLastPunchValue.textContent = '-';
      if (els.workerStatusValue) els.workerStatusValue.textContent = 'Ready';
      if (els.workerStatusMessage) els.workerStatusMessage.textContent = 'Enter your name and punch.';
      if (els.workerHistoryBody) {
        els.workerHistoryBody.innerHTML = '<tr><td colspan="2">No punches yet.</td></tr>';
      }
      return;
    }

    const last = rows[0];
    if (els.workerNameValue) els.workerNameValue.textContent = last.name || name;
    if (els.workerLastActionValue) els.workerLastActionValue.textContent = prettyAction(last.action);
    if (els.workerLastPunchValue) els.workerLastPunchValue.textContent = formatDateTime(last.timestampMs);
    if (els.workerStatusValue) els.workerStatusValue.textContent = statusLabelForAction(last.action);

    const clockedInAt = findLatestClockInTime(rows);
    if (els.workerStatusMessage) {
      els.workerStatusMessage.textContent = clockedInAt
        ? `${statusLabelForAction(last.action)}. Clocked in at ${formatDateTime(clockedInAt)}.`
        : `${statusLabelForAction(last.action)} at ${formatDateTime(last.timestampMs)}.`;
    }

    if (els.workerHistoryBody) {
      els.workerHistoryBody.innerHTML = rows.map((row) => `
        <tr>
          <td>${formatDateTime(row.timestampMs)}</td>
          <td>${prettyAction(row.action)}</td>
        </tr>
      `).join('');
    }
  }, (error) => {
    // Permission errors are expected for unauthenticated workers (original rules restrict reads to managers)
    if (error.code === 'permission-denied' || (error.message && error.message.includes('permissions'))) {
      console.info('Live punch view not available (read requires authentication). Punch data was saved.');
    } else {
      console.error('Live view error:', error);
      toast(error.message || 'Could not load worker punches.', true);
    }
  });
}

function findLatestClockInTime(rows) {
  const sorted = [...rows].sort((a, b) => (b.timestampMs || 0) - (a.timestampMs || 0));
  for (const row of sorted) {
    if (row.action === 'clock_in') return row.timestampMs || 0;
  }
  return 0;
}

async function handleLogin(event) {
  event.preventDefault();
  if (!requireFirebaseReady('sign in')) return;

  try {
    await signInWithEmailAndPassword(
      auth,
      els.emailInput?.value.trim(),
      els.passwordInput?.value
    );
    if (els.passwordInput) els.passwordInput.value = '';
  } catch (error) {
    console.error(error);
    toast(error.message || 'Could not sign in.', true);
  }
}

async function handlePasswordReset() {
  if (!requireFirebaseReady('send reset emails')) return;
  const email = els.emailInput?.value.trim();
  if (!email) {
    toast('Enter the email first, then tap reset.', true);
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email);
    toast('Password reset email sent.');
  } catch (error) {
    console.error(error);
    toast(error.message || 'Could not send reset email.', true);
  }
}

function showLoggedOut() {
  state.companyId = null;
  state.agencyId = null;
  state.companyDoc = null;
  els.authCard?.classList.remove('hidden');
  els.appShell?.classList.add('hidden');
  els.sessionChip?.classList.add('hidden');
  // Restore public worker card
  const workerCard = document.getElementById('workerCard');
  if (workerCard) workerCard.classList.remove('hidden');
  // Reset header
  const headerP = document.querySelector('.topbar p');
  if (headerP) headerP.textContent = 'Mobile punch tracking with live manager visibility and weekly signoff.';
  applyWorkerAvailabilityState();
}

function workerFunctionsReady() {
  return firebaseReady() && String(functionsBaseUrl || '').trim().length > 0;
}

function setWorkerControlsDisabled(disabled, title = '') {
  document.querySelectorAll('.worker-action-btn').forEach((btn) => {
    btn.disabled = disabled;
    btn.title = disabled ? title : '';
  });
  [els.workerViewTimeBtn, els.workerRequestFixBtn, els.workerLoadTimeBtn].forEach((btn) => {
    if (!btn) return;
    btn.disabled = disabled;
    btn.title = disabled ? title : '';
  });
  if (els.workerFixActionInput) els.workerFixActionInput.disabled = disabled;
  if (els.workerFixDateInput) els.workerFixDateInput.disabled = disabled;
  if (els.workerFixTimeInput) els.workerFixTimeInput.disabled = disabled;
  if (els.workerFixReasonInput) els.workerFixReasonInput.disabled = disabled;
}

function applyWorkerAvailabilityState() {
  if (!firebaseReady()) {
    setWorkerControlsDisabled(true, appSettings.setupMessage);
    return;
  }

  if (!workerFunctionsReady()) {
    const setupMessage = 'Worker PIN punching is not connected yet. Add this repo\'s Firebase Functions URL to enable staffing-company punch in, My Time, and time-fix requests.';
    if (els.workerLookupStatus) {
      els.workerLookupStatus.textContent = setupMessage;
      els.workerLookupStatus.style.borderColor = 'rgba(255,202,87,0.45)';
    }
    if (els.workerStatusMessage) {
      els.workerStatusMessage.textContent = setupMessage;
    }
    setWorkerControlsDisabled(true, setupMessage);
    return;
  }

  if (els.workerLookupStatus) {
    els.workerLookupStatus.textContent = 'Enter your name, PIN, staffing company, client, and job site to punch.';
    els.workerLookupStatus.style.borderColor = '';
  }
  if (els.workerStatusMessage) {
    els.workerStatusMessage.textContent = 'Enter your name and punch.';
  }
  setWorkerControlsDisabled(false, '');
}

function toggleWorkerPanel(panel) {
  const showTime = panel === 'time';
  const showFix = panel === 'fix';
  els.workerMyTimePanel?.classList.toggle('hidden', !showTime);
  els.workerFixPanel?.classList.toggle('hidden', !showFix);
}

function prefillPublicPunchContext() {
  const params = new URLSearchParams(window.location.search);
  const agencyValue = params.get('agencyId') || params.get('agency') || '';
  const clientValue = params.get('clientId') || params.get('company') || '';
  const siteValue = params.get('siteId') || params.get('site') || '';
  if (els.workerAgencyInput && agencyValue) {
    els.workerAgencyInput.value = agencyValue;
    els.workerAgencyInput.readOnly = true;
  }
  if (els.workerClientInput && clientValue) {
    els.workerClientInput.value = clientValue;
    els.workerClientInput.readOnly = true;
  }
  if (els.workerSiteInput && siteValue) {
    els.workerSiteInput.value = siteValue;
    els.workerSiteInput.readOnly = true;
  }
}

function collectWorkerIdentity() {
  const workerName = prettifyHumanName(els.workerNameInput?.value.trim() || '');
  const pin = String(els.workerPinInput?.value || '').trim();
  const agencyId = String(els.workerAgencyInput?.value || '').trim();
  const clientId = String(els.workerClientInput?.value || '').trim();
  const siteId = String(els.workerSiteInput?.value || '').trim();

  if (!workerName) {
    toast('Enter your name first.', true);
    return null;
  }
  if (!pin) {
    toast('Enter your worker PIN first.', true);
    return null;
  }
  if (!agencyId) {
    toast('Enter your staffing company first.', true);
    return null;
  }
  if (!clientId) {
    toast('Enter the company/client first.', true);
    return null;
  }
  if (!siteId) {
    toast('Enter the job site first.', true);
    return null;
  }

  return {
    agencyId,
    clientId,
    siteId,
    workerName,
    pin
  };
}

async function loadWorkerTimeSnapshot() {
  if (!workerFunctionsReady()) {
    toast('Worker self-service is not connected yet.', true);
    return;
  }
  const workerContext = collectWorkerIdentity();
  if (!workerContext) return;
  try {
    const snapshot = await callWorkerFunction('verifyWorkerPinAndGetTime', workerContext);
    state.workerTimeSnapshot = snapshot || null;
    renderWorkerTimeSnapshot(snapshot || {});
    toggleWorkerPanel('time');
  } catch (error) {
    console.error(error);
    toast(error.message || 'Could not load your time.', true);
  }
}

function renderWorkerTimeSnapshot(snapshot) {
  const worker = snapshot?.worker || {};
  const summary = snapshot?.summary || {};
  const punches = Array.isArray(snapshot?.recentPunches) ? snapshot.recentPunches : [];

  if (els.workerNameValue) els.workerNameValue.textContent = worker.displayName || els.workerNameInput?.value.trim() || '-';
  if (els.workerAgencyValue) els.workerAgencyValue.textContent = formatStaffingCompany(worker.agencyId || els.workerAgencyInput?.value || '-');
  if (els.workerTodayHoursValue) els.workerTodayHoursValue.textContent = Number(summary.todayHours || 0).toFixed(2);
  if (els.workerWeekHoursValue) els.workerWeekHoursValue.textContent = Number(summary.weekHours || 0).toFixed(2);
  if (els.workerLunchMinutesValue) els.workerLunchMinutesValue.textContent = `${Number(summary.lunchMinutes || 0)} min`;
  if (els.workerApprovalStatusValue) els.workerApprovalStatusValue.textContent = summary.approvalStatus || 'Pending';
  renderWorkerRecentPunches(punches);

  if (!els.workerMyTimeBody) return;
  if (!punches.length) {
    els.workerMyTimeBody.innerHTML = '<tr><td colspan="3">No punches found yet.</td></tr>';
    return;
  }

  els.workerMyTimeBody.innerHTML = punches.map((row) => `
    <tr>
      <td>${formatDateTime(row.timestampMs)}</td>
      <td>${prettyAction(row.action)}</td>
      <td>${escapeHtml(row.status || summary.approvalStatus || 'Pending')}</td>
    </tr>
  `).join('');
}

function renderWorkerRecentPunches(rows) {
  if (!els.workerHistoryBody) return;
  if (!rows.length) {
    els.workerHistoryBody.innerHTML = '<tr><td colspan="2">No punches yet.</td></tr>';
    return;
  }

  els.workerHistoryBody.innerHTML = rows.slice(0, 10).map((row) => `
    <tr>
      <td>${formatDateTime(row.timestampMs)}</td>
      <td>${prettyAction(row.action)}</td>
    </tr>
  `).join('');
}

async function handlePublicPunchRequestSubmit(event) {
  event.preventDefault();
  if (!workerFunctionsReady()) {
    toast('Worker self-service is not connected yet.', true);
    return;
  }
  const workerContext = collectWorkerIdentity();
  if (!workerContext) return;

  const requestedAction = els.workerFixActionInput?.value || '';
  const dateValue = els.workerFixDateInput?.value || '';
  const timeValue = els.workerFixTimeInput?.value || '';
  const reason = String(els.workerFixReasonInput?.value || '').trim();

  if (!requestedAction || !dateValue || !timeValue || !reason) {
    toast('Fill out every time fix field.', true);
    return;
  }

  try {
    await callWorkerFunction('createPunchRequest', {
      ...workerContext,
      requestedAction,
      requestedTimestampMs: parseLocalDateAndTime(dateValue, timeValue),
      requestedLocalDate: dateValue,
      reason
    });
    els.workerFixForm?.reset();
    if (els.workerFixDateInput) els.workerFixDateInput.value = formatDateInput(new Date());
    if (els.workerFixTimeInput) els.workerFixTimeInput.value = formatTimeForInput(Date.now());
    toast('Time fix request submitted.');
  } catch (error) {
    console.error(error);
    toast(error.message || 'Could not submit your request.', true);
  }
}

async function callWorkerFunction(functionName, payload) {
  const baseUrl = String(functionsBaseUrl || '').trim().replace(/\/$/, '');
  if (!baseUrl) {
    throw new Error(appSettings.setupMessage);
  }

  const response = await fetch(`${baseUrl}/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      ...payload,
      deviceInfo: navigator.userAgent || ''
    })
  });

  let data = {};
  try {
    data = await response.json();
  } catch (_) {
    data = {};
  }

  if (!response.ok || data.error) {
    throw new Error(data.error || `Worker action failed (${response.status}).`);
  }

  return data;
}

function firebaseReady() {
  return Boolean(firebaseEnabled && app && auth && db);
}

function requireFirebaseReady(actionLabel) {
  if (firebaseReady()) return true;
  toast(`Firebase is not configured for QRTIMECLOCK2 yet, so it cannot ${actionLabel}.`, true);
  return false;
}

function renderFirebaseUnavailable() {
  const workerCard = document.getElementById('workerCard');
  if (workerCard) workerCard.classList.remove('hidden');
  if (els.workerLookupStatus) {
    els.workerLookupStatus.textContent = appSettings.setupMessage;
    els.workerLookupStatus.style.borderColor = 'rgba(255,202,87,0.45)';
  }
  if (els.workerStatusMessage) {
    els.workerStatusMessage.textContent = appSettings.setupMessage;
  }
  setWorkerControlsDisabled(true, appSettings.setupMessage);
  if (els.emailInput) els.emailInput.placeholder = 'Manager email';
  if (els.passwordInput) els.passwordInput.placeholder = 'Password';
  if (els.resetPasswordBtn) {
    els.resetPasswordBtn.disabled = true;
    els.resetPasswordBtn.title = appSettings.setupMessage;
  }
  const headerP = document.querySelector('.topbar p');
  if (headerP) headerP.textContent = appSettings.setupMessage;
  toast(appSettings.setupMessage, true);
}

function showLoggedIn() {
  els.authCard?.classList.add('hidden');
  els.appShell?.classList.remove('hidden');
  els.sessionChip?.classList.remove('hidden');
  // Hide the public worker card for logged-in users
  const workerCard = document.getElementById('workerCard');
  if (workerCard) workerCard.classList.add('hidden');
  if (els.sessionName) els.sessionName.textContent = state.profile?.name || state.me?.email || 'Signed in';
  if (els.sessionRole) {
    const roleParts = [state.profile?.role || 'manager'];
    if (state.agencyId) roleParts.push('agency');
    els.sessionRole.textContent = roleParts.join(' · ');
  }

  // Show company name in header
  const companyDisplayName = state.companyDoc?.name || (state.companyId ? state.companyId : appSettings.companyName);
  const headerP = document.querySelector('.topbar p');
  if (headerP) headerP.textContent = companyDisplayName + ' — TimeClock Pro';
}

function getCompanyName() {
  return state.companyDoc?.name || state.companyId || appSettings.companyName;
}

/** Returns true if current user is scoped to an agency */
function isAgencyUser() {
  return !!state.agencyId;
}

const AGENCY_NAMES = {
  sterling_staffing: 'Sterling Staffing',
  excel_staffing: 'Excel Staffing',
};

function agencyLabel(agencyId) {
  if (!agencyId) return 'Direct';
  return AGENCY_NAMES[agencyId] || agencyId;
}

function formatStaffingCompany(value) {
  return agencyLabel(String(value || '').trim());
}

function attachRoleViews() {
  const emp = isEmployee();
  const mgr = isManager();

  // Employee-only tabs
  els.myTimecardTabBtn?.classList.toggle('hidden', !emp);
  els.missedPunchTabBtn?.classList.toggle('hidden', !emp);

  // Manager/admin tabs
  els.managerTabBtn?.classList.toggle('hidden', emp);
  els.timesheetsTabBtn?.classList.toggle('hidden', emp);
  els.editPunchesTabBtn?.classList.toggle('hidden', emp);
  els.approvalsTabBtn?.classList.toggle('hidden', !mgr);
  els.employeesTabBtn?.classList.toggle('hidden', !mgr);
  els.adminTabBtn?.classList.toggle('hidden', !isAdmin());
  els.agencyTabBtn?.classList.toggle('hidden', emp);

  if (emp) {
    if (els.myTimecardWeekPicker) {
      els.myTimecardWeekPicker.value = formatDateInput(state.selectedWeekStart);
    }
    if (els.mpDateInput) els.mpDateInput.value = formatDateInput(new Date());
    switchTab('myTimecardTab');
    attachMyTimecardView();
    attachMyMissedPunchView();
  } else {
    switchTab('managerTab');
    if (mgr) {
      attachEmployeesView();
      attachApprovalView();
    }
  }
}

function switchTab(tabId) {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.tab === tabId);
  });

  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.classList.toggle('hidden', panel.id !== tabId);
  });
}

function attachManagerLiveViews() {
  const constraints = [];
  if (state.companyId) constraints.push(where('companyId', '==', state.companyId));
  if (isAgencyUser()) constraints.push(where('agencyId', '==', state.agencyId));
  constraints.push(orderBy('timestampMs', 'desc'));
  constraints.push(limit(250));

  const liveQuery = query(
    collection(db, 'punches'),
    ...constraints
  );

  state.unsubscribers.push(
    onSnapshot(
      liveQuery,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter(isRowVisibleToProfile);
        state.allPunchRows = rows;
        renderLivePunches(rows);
        renderActiveNow(rows);
        renderEditPunchesTable(rows);
      },
      (error) => {
        console.error(error);
        toast(error.message || 'Live punch feed failed.', true);
      }
    )
  );
}

function renderLivePunches(rows) {
  if (!els.livePunchBody) return;

  if (!rows.length) {
    els.livePunchBody.innerHTML = '<tr><td colspan="4">No live data yet.</td></tr>';
    return;
  }

  els.livePunchBody.innerHTML = rows
    .map((row) => `
      <tr>
        <td>${formatDateTime(row.timestampMs)}</td>
        <td>${escapeHtml(row.name || '-')}</td>
        <td>${prettyAction(row.action)}</td>
        <td>${escapeHtml(row.source || '-')}</td>
      </tr>
    `)
    .join('');
}

function renderActiveNow(rows) {
  if (!els.activeNowList) return;

  const latestByName = new Map();

  rows.forEach((row) => {
    const key = row.nameKey || normalizeName(row.name || '');
    if (!key) return;
    if (!latestByName.has(key)) {
      latestByName.set(key, row);
    }
  });

  const active = [...latestByName.values()].filter((row) =>
    row.action === 'clock_in' || row.action === 'end_lunch'
  );

  if (!active.length) {
    els.activeNowList.innerHTML = '<div class="empty-state">Nobody is currently clocked in.</div>';
    return;
  }

  els.activeNowList.innerHTML = active
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
    .map((row) => `
      <div class="person-row">
        <div class="person-meta">
          <strong>${escapeHtml(row.name || '-')}</strong>
          <span>${prettyAction(row.action)}</span>
        </div>
        <div class="pill">${formatTime(row.timestampMs)}</div>
      </div>
    `)
    .join('');
}

function renderEditPunchesTable(rows) {
  if (!els.editPunchesBody) return;

  const filter = String(els.editFilterNameInput?.value || '').trim().toLowerCase();
  const filtered = rows.filter((row) => {
    if (!filter) return true;
    return String(row.name || '').toLowerCase().includes(filter);
  });

  if (!filtered.length) {
    els.editPunchesBody.innerHTML = '<tr><td colspan="8">No punches found.</td></tr>';
    return;
  }

  els.editPunchesBody.innerHTML = filtered.map((row) => {
    const editedAtText = row.editedAt?.seconds
      ? formatDateTime(row.editedAt.seconds * 1000)
      : '-';

    const rowClass = row.editedBy ? 'class="edited-row"' : '';

    return `
      <tr ${rowClass}>
        <td>${escapeHtml(row.name || '-')}</td>
        <td>${prettyAction(row.action)}</td>
        <td>${formatDateOnly(row.timestampMs)}</td>
        <td>${formatTime(row.timestampMs)}</td>
        <td>${escapeHtml(row.source || '-')}</td>
        <td>${escapeHtml(row.editedBy || '-')}</td>
        <td>${escapeHtml(editedAtText)}</td>
        <td>
          <button class="secondary-btn manager-edit-punch-btn" data-id="${row.id}" type="button">Edit</button>
          <button class="danger-btn manager-delete-punch-btn" data-id="${row.id}" type="button">Delete</button>
        </td>
      </tr>
    `;
  }).join('');

  els.editPunchesBody.querySelectorAll('.manager-edit-punch-btn').forEach((btn) => {
    btn.addEventListener('click', () => editPunch(btn.dataset.id));
  });

  els.editPunchesBody.querySelectorAll('.manager-delete-punch-btn').forEach((btn) => {
    btn.addEventListener('click', () => deletePunchRecord(btn.dataset.id));
  });
}

async function editPunch(punchId) {
  if (!isManager()) {
    toast('Only managers and admins can edit punches.', true);
    return;
  }

  const row = state.allPunchRows.find((r) => r.id === punchId);
  if (!row) {
    toast('Punch not found.', true);
    return;
  }

  const newName = prompt('Edit worker name:', row.name || '');
  if (newName === null) return;

  const newAction = prompt(
    'Edit action (clock_in, start_lunch, end_lunch, clock_out):',
    row.action || 'clock_in'
  );
  if (newAction === null) return;

  const newDateTime = prompt(
    'Edit date/time (example: 2026-04-14 07:26):',
    toLocalEditString(row.timestampMs)
  );
  if (newDateTime === null) return;

  const prettyName = prettifyHumanName(newName);
  const nameKey = normalizeName(prettyName);
  const action = String(newAction).trim();

  if (!prettyName || nameKey.length < 2) {
    toast('Invalid name.', true);
    return;
  }

  if (!['clock_in', 'start_lunch', 'end_lunch', 'clock_out'].includes(action)) {
    toast('Invalid action.', true);
    return;
  }

  const parsedMs = parseLocalEditString(newDateTime);
  if (!parsedMs) {
    toast('Invalid date/time format. Use YYYY-MM-DD HH:MM', true);
    return;
  }

  const date = new Date(parsedMs);
  const dateKey = formatDateKey(date);
  const weekKey = formatDateKey(getMondayDate(date));

  const updatedPayload = {
    name: prettyName,
    nameKey,
    action,
    timestampMs: parsedMs,
    dateKey,
    weekKey,
    editedAt: serverTimestamp(),
    editedBy: state.profile?.name || state.me?.email || 'Manager'
  };

  try {
    await addDoc(collection(db, 'punch_edits'), {
      punchId,
      type: 'edit',
      companyId: row.companyId || state.companyId || '',
      clientId: row.clientId || row.companyId || state.companyId || '',
      siteId: row.siteId || row.assignedSiteId || '',
      agencyId: row.agencyId || state.agencyId || '',
      original: {
        name: row.name || '',
        nameKey: row.nameKey || '',
        action: row.action || '',
        timestampMs: row.timestampMs || 0,
        dateKey: row.dateKey || '',
        weekKey: row.weekKey || '',
        source: row.source || '',
        editedBy: row.editedBy || '',
      },
      updated: {
        name: prettyName,
        nameKey,
        action,
        timestampMs: parsedMs,
        dateKey,
        weekKey,
        source: row.source || ''
      },
      editedBy: state.profile?.name || state.me?.email || 'Manager',
      editedAt: serverTimestamp()
    });

    await updateDoc(doc(db, 'punches', punchId), updatedPayload);

    toast('Punch updated.');
  } catch (error) {
    console.error(error);
    toast(error.message || 'Could not update punch.', true);
  }
}

async function deletePunchRecord(punchId) {
  if (!isManager()) {
    toast('Only managers and admins can delete punches.', true);
    return;
  }

  const row = state.allPunchRows.find((r) => r.id === punchId);
  const okay = confirm('Delete this punch?');
  if (!okay) return;

  try {
    await addDoc(collection(db, 'punch_edits'), {
      punchId,
      type: 'delete',
      companyId: row?.companyId || state.companyId || '',
      clientId: row?.clientId || row?.companyId || state.companyId || '',
      siteId: row?.siteId || row?.assignedSiteId || '',
      agencyId: row?.agencyId || state.agencyId || '',
      original: row || null,
      editedBy: state.profile?.name || state.me?.email || 'Manager',
      editedAt: serverTimestamp()
    });

    await deleteDoc(doc(db, 'punches', punchId));
    toast('Punch deleted.');
  } catch (error) {
    console.error(error);
    toast(error.message || 'Could not delete punch.', true);
  }
}

function attachTimesheetView() {
  const weekKey = formatDateKey(state.selectedWeekStart);

  const punchConstraints = [where('weekKey', '==', weekKey)];
  if (state.companyId) punchConstraints.push(where('companyId', '==', state.companyId));
  if (isAgencyUser()) punchConstraints.push(where('agencyId', '==', state.agencyId));
  punchConstraints.push(orderBy('timestampMs', 'asc'));

  const punchesQuery = query(collection(db, 'punches'), ...punchConstraints);

  const tsConstraints = [where('weekKey', '==', weekKey)];
  if (state.companyId) tsConstraints.push(where('companyId', '==', state.companyId));
  if (isAgencyUser()) tsConstraints.push(where('agencyId', '==', state.agencyId));

  const timesheetsQuery = query(collection(db, 'timesheets'), ...tsConstraints);

  state.unsubscribers.push(
    onSnapshot(
      punchesQuery,
      (snap) => {
        state.selectedWeekPunchRows = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter(isRowVisibleToProfile);
        renderDerivedTimesheets();
        populateAgencyWorkerSelect();
        renderAgencyPreview();
      },
      (error) => {
        console.error(error);
        toast(error.message || 'Could not load weekly punches.', true);
      }
    )
  );

  state.unsubscribers.push(
    onSnapshot(
      timesheetsQuery,
      (snap) => {
        const map = {};
        snap.docs.forEach((d) => {
          const row = { id: d.id, ...d.data() };
          if (isRowVisibleToProfile(row)) {
            map[d.id] = row;
          }
        });
        state.selectedWeekTimesheetDocs = map;
        renderDerivedTimesheets();
        renderAgencyPreview();
      },
      (error) => {
        console.error(error);
        toast(error.message || 'Could not load weekly signoffs.', true);
      }
    )
  );
}

function renderDerivedTimesheets() {
  if (!els.timesheetBody) return;

  const rows = getDerivedTimesheetRows();

  if (!rows.length) {
    els.timesheetBody.innerHTML = '<tr><td colspan="6">No timesheets yet.</td></tr>';
    return;
  }

  els.timesheetBody.innerHTML = rows.map((row) => {
    const signedAt = row.managerSignedAt?.seconds
      ? formatDateTime(row.managerSignedAt.seconds * 1000)
      : '-';

    const hoursText = `${Number(row.weeklyHours || 0).toFixed(2)} (${row.daysWorked || 0} day${row.daysWorked === 1 ? '' : 's'})`;

    return `
      <tr>
        <td>${escapeHtml(row.name || '-')}${row.agencyId ? `<br><span class="tiny">${escapeHtml(formatStaffingCompany(row.agencyId))}</span>` : ''}</td>
        <td>${escapeHtml(row.weekKey || '-')}</td>
        <td>${hoursText}</td>
        <td>${escapeHtml(row.status || 'open')}</td>
        <td>${escapeHtml(row.managerSignedBy || '-')}${signedAt !== '-' ? `<br><span class="tiny">${signedAt}</span>` : ''}</td>
        <td>
          ${row.status === 'signed'
            ? `<button class="ghost-btn reopen-btn" data-id="${row.id}">Reopen</button>`
            : `<button class="primary-btn sign-btn" data-id="${row.id}">Sign</button>`}
        </td>
      </tr>
    `;
  }).join('');

  els.timesheetBody.querySelectorAll('.sign-btn').forEach((btn) => {
    btn.addEventListener('click', () => signTimesheet(btn.dataset.id));
  });

  els.timesheetBody.querySelectorAll('.reopen-btn').forEach((btn) => {
    btn.addEventListener('click', () => reopenTimesheet(btn.dataset.id));
  });
}

function getDerivedTimesheetRows() {
  const weekKey = formatDateKey(state.selectedWeekStart);
  const grouped = new Map();

  state.selectedWeekPunchRows.forEach((p) => {
    const key = p.nameKey || normalizeName(p.name || '');
    if (!key) return;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(p);
  });

  const rows = [];

  grouped.forEach((personPunches, nameKey) => {
    const firstPunch = personPunches[0] || {};
    const displayName = firstPunch.name || nameKey;
    const totals = buildWeekTotals(personPunches);
    const timesheetId = `${weekKey}_${nameKey}`;
    const saved = state.selectedWeekTimesheetDocs[timesheetId] || null;

    rows.push({
      id: timesheetId,
      name: displayName,
      nameKey,
      weekKey,
      companyId: saved?.companyId || firstPunch.companyId || state.companyId || '',
      clientId: saved?.clientId || firstPunch.clientId || firstPunch.companyId || state.companyId || '',
      siteId: saved?.siteId || firstPunch.siteId || firstPunch.assignedSiteId || '',
      agencyId: saved?.agencyId || firstPunch.agencyId || state.agencyId || '',
      agencyName: saved?.agencyName || firstPunch.agencyName || firstPunch.agencyId || state.agencyId || '',
      employeeId: saved?.employeeId || firstPunch.employeeId || '',
      workerId: saved?.workerId || firstPunch.workerId || firstPunch.employeeId || '',
      weeklyHours: totals.weeklyHours,
      daysWorked: totals.daysWorked,
      dailyTotals: totals.dailyTotals,
      lastPunchAction: totals.lastAction,
      lastPunchAtMs: totals.lastPunchAtMs,
      status: saved?.status || 'open',
      managerSignedBy: saved?.managerSignedBy || '',
      managerSignedAt: saved?.managerSignedAt || null,
    });
  });

  rows.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return rows;
}

async function signTimesheet(timesheetId) {
  const weekKey = formatDateKey(state.selectedWeekStart);
  const row = buildCurrentTimesheetRow(timesheetId, weekKey);

  if (!row) {
    toast('Could not find that weekly record.', true);
    return;
  }

  try {
    await setDoc(doc(db, 'timesheets', timesheetId), {
      name: row.name,
      workerName: row.name,
      nameKey: row.nameKey,
      weekKey: row.weekKey,
      companyId: row.companyId || state.companyId || '',
      clientId: row.clientId || row.companyId || state.companyId || '',
      siteId: row.siteId || '',
      agencyId: row.agencyId || state.agencyId || '',
      agencyName: row.agencyName || row.agencyId || state.agencyId || '',
      employeeId: row.employeeId || row.workerId || '',
      workerId: row.workerId || row.employeeId || '',
      dailyTotals: row.dailyTotals,
      weeklyHours: row.weeklyHours,
      daysWorked: row.daysWorked,
      status: 'signed',
      managerSignedBy: state.profile?.name || state.me?.email || 'Manager',
      managerSignedAt: Timestamp.fromDate(new Date()),
      updatedAt: serverTimestamp(),
      lastPunchAction: row.lastPunchAction,
      lastPunchAtMs: row.lastPunchAtMs,
    }, { merge: true });

    toast('Timesheet signed.');
  } catch (error) {
    console.error(error);
    toast(error.message || 'Could not sign timesheet.', true);
  }
}

async function reopenTimesheet(timesheetId) {
  const weekKey = formatDateKey(state.selectedWeekStart);
  const row = buildCurrentTimesheetRow(timesheetId, weekKey);

  if (!row) {
    toast('Could not find that weekly record.', true);
    return;
  }

  try {
    await setDoc(doc(db, 'timesheets', timesheetId), {
      name: row.name,
      workerName: row.name,
      nameKey: row.nameKey,
      weekKey: row.weekKey,
      companyId: row.companyId || state.companyId || '',
      clientId: row.clientId || row.companyId || state.companyId || '',
      siteId: row.siteId || '',
      agencyId: row.agencyId || state.agencyId || '',
      agencyName: row.agencyName || row.agencyId || state.agencyId || '',
      employeeId: row.employeeId || row.workerId || '',
      workerId: row.workerId || row.employeeId || '',
      dailyTotals: row.dailyTotals,
      weeklyHours: row.weeklyHours,
      daysWorked: row.daysWorked,
      status: 'open',
      managerSignedBy: '',
      managerSignedAt: null,
      updatedAt: serverTimestamp(),
      lastPunchAction: row.lastPunchAction,
      lastPunchAtMs: row.lastPunchAtMs,
    }, { merge: true });

    toast('Timesheet reopened.');
  } catch (error) {
    console.error(error);
    toast(error.message || 'Could not reopen timesheet.', true);
  }
}

function buildCurrentTimesheetRow(timesheetId, weekKey) {
  const rows = getDerivedTimesheetRows();
  return rows.find((row) => row.id === timesheetId && row.weekKey === weekKey) || null;
}

function buildWeekTotals(punches) {
  const sorted = [...punches].sort((a, b) => (a.timestampMs || 0) - (b.timestampMs || 0));
  const byDay = {};
  let currentIn = null;
  let weeklyMinutes = 0;
  let lastAction = '-';
  let lastPunchAtMs = 0;

  sorted.forEach((punch) => {
    const timeMs = punch.timestampMs || 0;
    const dateKey = punch.dateKey || formatDateKey(new Date(timeMs));

    if (!byDay[dateKey]) {
      byDay[dateKey] = {
        clock_in: '',
        start_lunch: '',
        end_lunch: '',
        clock_out: '',
        minutes: 0
      };
    }

    lastAction = punch.action;
    lastPunchAtMs = Math.max(lastPunchAtMs, timeMs);

    if (punch.action === 'clock_in') {
      byDay[dateKey].clock_in = formatTime(timeMs);
      currentIn = timeMs;
    }

    if (punch.action === 'start_lunch') {
      byDay[dateKey].start_lunch = formatTime(timeMs);
      if (currentIn) {
        const diff = Math.max(0, Math.round((timeMs - currentIn) / 60000));
        weeklyMinutes += diff;
        byDay[dateKey].minutes += diff;
        currentIn = null;
      }
    }

    if (punch.action === 'end_lunch') {
      byDay[dateKey].end_lunch = formatTime(timeMs);
      currentIn = timeMs;
    }

    if (punch.action === 'clock_out') {
      byDay[dateKey].clock_out = formatTime(timeMs);
      if (currentIn) {
        const diff = Math.max(0, Math.round((timeMs - currentIn) / 60000));
        weeklyMinutes += diff;
        byDay[dateKey].minutes += diff;
        currentIn = null;
      }
    }
  });

  const dailyTotals = Object.fromEntries(
    Object.entries(byDay).map(([dateKey, value]) => [
      dateKey,
      {
        clock_in: value.clock_in,
        start_lunch: value.start_lunch,
        end_lunch: value.end_lunch,
        clock_out: value.clock_out,
        hours: Number((value.minutes / 60).toFixed(2))
      }
    ])
  );

  const daysWorked = Object.keys(dailyTotals).length;

  return {
    dailyTotals,
    weeklyHours: Number((weeklyMinutes / 60).toFixed(2)),
    daysWorked,
    lastAction,
    lastPunchAtMs,
  };
}

function isEmployee() {
  return state.profile?.role === 'worker' || state.profile?.role === 'employee';
}

/* ───────────────────────────────────────────────────
   MY TIMECARD (employee self-service view)
   ─────────────────────────────────────────────────── */

function attachMyTimecardView() {
  const weekStart = els.myTimecardWeekPicker?.value
    ? new Date(`${els.myTimecardWeekPicker.value}T00:00:00`)
    : state.selectedWeekStart;

  const weekKey = formatDateKey(weekStart);
  const employeeId = state.profile?.employeeId || state.profile?.workerId || null;
  const nameKey = normalizeName(state.profile?.name || '');

  if (!employeeId && !nameKey) {
    toast('Your profile is missing employeeId. Ask your manager.', true);
    return;
  }

  // Query punches by employeeId (preferred) or nameKey (legacy fallback)
  const constraints = [where('weekKey', '==', weekKey)];
  if (employeeId) {
    constraints.push(where('employeeId', '==', employeeId));
  } else {
    constraints.push(where('nameKey', '==', nameKey));
  }
  if (state.companyId) constraints.push(where('companyId', '==', state.companyId));
  constraints.push(orderBy('timestampMs', 'asc'));

  const q = query(collection(db, 'punches'), ...constraints);

  state._myTcUnsub = onSnapshot(q, (snap) => {
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderMyTimecard(rows);
  }, (error) => {
    console.error(error);
    toast(error.message || 'Could not load your timecard.', true);
  });

  state.unsubscribers.push(state._myTcUnsub);
}

function clearMyTimecardListener() {
  if (state._myTcUnsub) {
    try { state._myTcUnsub(); } catch (_) {}
    state._myTcUnsub = null;
  }
}

function renderMyTimecard(punches) {
  const totals = buildWeekTotals(punches);

  if (els.myTcTotalHours) els.myTcTotalHours.textContent = Number(totals.weeklyHours || 0).toFixed(2);
  if (els.myTcDaysWorked) els.myTcDaysWorked.textContent = String(totals.daysWorked || 0);
  if (els.myTcLastPunch) els.myTcLastPunch.textContent = totals.lastPunchAtMs ? formatDateTime(totals.lastPunchAtMs) : '-';
  if (els.myTcStatus) els.myTcStatus.textContent = totals.lastAction ? statusLabelForAction(totals.lastAction) : '-';

  if (!els.myTimecardBody) return;

  const daily = totals.dailyTotals;
  const keys = Object.keys(daily).sort();

  if (!keys.length) {
    els.myTimecardBody.innerHTML = '<tr><td colspan="6">No punches this week.</td></tr>';
    return;
  }

  els.myTimecardBody.innerHTML = keys.map((dateKey) => {
    const d = daily[dateKey];
    return `
      <tr>
        <td>${escapeHtml(dateKey)}</td>
        <td>${escapeHtml(d.clock_in || '-')}</td>
        <td>${escapeHtml(d.start_lunch || '-')}</td>
        <td>${escapeHtml(d.end_lunch || '-')}</td>
        <td>${escapeHtml(d.clock_out || '-')}</td>
        <td>${Number(d.hours || 0).toFixed(2)}</td>
      </tr>
    `;
  }).join('');
}

/* ───────────────────────────────────────────────────
   MISSED PUNCH REQUESTS
   ─────────────────────────────────────────────────── */

async function handleMissedPunchSubmit(event) {
  event.preventDefault();

  if (!state.me || !state.profile) {
    toast('You must be signed in.', true);
    return;
  }

  const action = els.mpActionInput?.value;
  const dateValue = els.mpDateInput?.value;
  const timeValue = els.mpTimeInput?.value;
  const reason = els.mpReasonInput?.value.trim();

  if (!action || !dateValue || !timeValue || !reason) {
    toast('Fill out all fields.', true);
    return;
  }

  const requestedTimestampMs = parseLocalDateAndTime(dateValue, timeValue);
  if (!requestedTimestampMs) {
    toast('Invalid date or time.', true);
    return;
  }

  try {
    await addDoc(collection(db, 'punchRequests'), {
      uid: state.me.uid,
      employeeId: state.profile.employeeId || state.profile.workerId || '',
      workerId: state.profile.workerId || state.profile.employeeId || '',
      companyId: state.companyId || '',
      clientId: state.companyId || '',
      siteId: state.profile.assignedSiteId || '',
      agencyId: state.agencyId || '',
      name: state.profile.name || '',
      workerName: state.profile.name || '',
      requestedAction: action,
      requestedDate: dateValue,
      requestedTime: timeValue,
      requestedTimestampMs,
      requestedLocalDate: dateValue,
      reason,
      status: 'pending',
      source: 'workerSelfService',
      reviewedBy: '',
      reviewedAt: null,
      approvedBy: '',
      approvedAt: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    els.missedPunchForm?.reset();
    if (els.mpDateInput) els.mpDateInput.value = formatDateInput(new Date());
    toast('Missed punch request submitted.');
  } catch (error) {
    console.error(error);
    toast(error.message || 'Could not submit request.', true);
  }
}

function attachMyMissedPunchView() {
  if (!state.me) return;

  const constraints = [where('uid', '==', state.me.uid)];
  if (state.companyId) constraints.push(where('companyId', '==', state.companyId));

  const q = query(collection(db, 'punchRequests'), ...constraints);

  state.unsubscribers.push(
    onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) => (b.requestedTimestampMs || 0) - (a.requestedTimestampMs || 0));
      renderMyMissedPunches(rows);
    }, (error) => {
      console.error(error);
    })
  );
}

function renderMyMissedPunches(rows) {
  if (!els.myMissedPunchBody) return;

  if (!rows.length) {
    els.myMissedPunchBody.innerHTML = '<tr><td colspan="6">No requests yet.</td></tr>';
    return;
  }

  els.myMissedPunchBody.innerHTML = rows.map((r) => {
    const statusClass = r.status === 'approved' ? 'color:var(--good)' :
                        r.status === 'denied' ? 'color:var(--danger)' : 'color:var(--warn)';
    return `
      <tr>
        <td>${escapeHtml(getRequestDateLabel(r))}</td>
        <td>${escapeHtml(getRequestTimeLabel(r))}</td>
        <td>${prettyAction(r.requestedAction)}</td>
        <td>${escapeHtml(r.reason || '-')}</td>
        <td><span style="${statusClass};font-weight:700;text-transform:capitalize;">${escapeHtml(r.status || 'pending')}</span></td>
        <td>${escapeHtml(r.reviewedBy || '-')}</td>
      </tr>
    `;
  }).join('');
}

/* ───────────────────────────────────────────────────
   MANAGER APPROVAL DASHBOARD
   ─────────────────────────────────────────────────── */

function attachApprovalView() {
  const constraints = [];
  if (state.companyId) constraints.push(where('companyId', '==', state.companyId));
  if (isAgencyUser()) constraints.push(where('agencyId', '==', state.agencyId));

  const q = query(collection(db, 'punchRequests'), ...constraints);

  state.unsubscribers.push(
    onSnapshot(q, (snap) => {
      state.allMissedRequests = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter(isRowVisibleToProfile);
      state.allMissedRequests.sort((a, b) => (b.requestedTimestampMs || 0) - (a.requestedTimestampMs || 0));
      renderApprovalList(state.allMissedRequests);
    }, (error) => {
      console.error(error);
      toast(error.message || 'Could not load approval requests.', true);
    })
  );
}

function renderApprovalList(requests) {
  if (!els.approvalListBody) return;

  const filtered = state.approvalFilter === 'all'
    ? requests
    : requests.filter((r) => r.status === state.approvalFilter);

  if (!filtered.length) {
    els.approvalListBody.innerHTML = `<tr><td colspan="7">No ${state.approvalFilter} requests.</td></tr>`;
    return;
  }

  els.approvalListBody.innerHTML = filtered.map((r) => {
    const statusClass = r.status === 'approved' ? 'color:var(--good)' :
                        r.status === 'denied' ? 'color:var(--danger)' : 'color:var(--warn)';
    const actions = r.status === 'pending'
      ? `<button class="primary-btn approve-req-btn" data-id="${r.id}" type="button" style="margin-right:6px;">Approve</button>
         <button class="danger-btn deny-req-btn" data-id="${r.id}" type="button">Deny</button>`
      : `<span class="tiny">${escapeHtml(r.reviewedBy || '-')}</span>`;

    return `
      <tr>
        <td>${escapeHtml(r.workerName || r.name || '-')}</td>
        <td>${escapeHtml(getRequestDateLabel(r))}</td>
        <td>${escapeHtml(getRequestTimeLabel(r))}</td>
        <td>${prettyAction(r.requestedAction)}</td>
        <td>${escapeHtml(r.reason || '-')}</td>
        <td><span style="${statusClass};font-weight:700;text-transform:capitalize;">${escapeHtml(r.status)}</span></td>
        <td>${actions}</td>
      </tr>
    `;
  }).join('');

  els.approvalListBody.querySelectorAll('.approve-req-btn').forEach((btn) => {
    btn.addEventListener('click', () => approveRequest(btn.dataset.id));
  });

  els.approvalListBody.querySelectorAll('.deny-req-btn').forEach((btn) => {
    btn.addEventListener('click', () => denyRequest(btn.dataset.id));
  });
}

async function approveRequest(requestId) {
  if (!isManager()) { toast('Only managers can approve.', true); return; }

  const req = state.allMissedRequests.find((r) => r.id === requestId);
  if (!req) { toast('Request not found.', true); return; }

  const managerName = state.profile?.name || state.me?.email || 'Manager';
  const now = Timestamp.fromDate(new Date());

  try {
    // 1. Update the request status
    await updateDoc(doc(db, 'punchRequests', requestId), {
      status: 'approved',
      reviewedBy: managerName,
      reviewedAt: now,
      approvedBy: managerName,
      approvedAt: now,
      updatedAt: serverTimestamp(),
    });

    // 2. Auto-create the actual punch
    const punchDate = new Date(req.requestedTimestampMs);
    const dateKey = formatDateKey(punchDate);
    const weekKey = formatDateKey(getMondayDate(punchDate));

    await addDoc(collection(db, 'punches'), {
      name: req.workerName || req.name || '',
      workerName: req.workerName || req.name || '',
      nameKey: normalizeName(req.workerName || req.name || ''),
      action: req.requestedAction,
      timestamp: serverTimestamp(),
      timestampMs: req.requestedTimestampMs,
      dateKey,
      weekKey,
      source: 'missed_punch_approved',
      createdAt: serverTimestamp(),
      createdBy: managerName,
      approvedBy: managerName,
      approvedAt: now,
      companyId: req.companyId || '',
      clientId: req.clientId || req.companyId || '',
      siteId: req.siteId || '',
      agencyId: req.agencyId || '',
      workerId: req.workerId || req.employeeId || '',
      employeeId: req.employeeId || '',
    });

    toast('Request approved — punch created.');
  } catch (error) {
    console.error(error);
    toast(error.message || 'Could not approve request.', true);
  }
}

async function denyRequest(requestId) {
  if (!isManager()) { toast('Only managers can deny.', true); return; }

  const reason = prompt('Denial reason (optional):') || '';
  const managerName = state.profile?.name || state.me?.email || 'Manager';

  try {
    await updateDoc(doc(db, 'punchRequests', requestId), {
      status: 'denied',
      reviewedBy: managerName,
      reviewedAt: Timestamp.fromDate(new Date()),
      editReason: reason,
      updatedAt: serverTimestamp(),
    });

    toast('Request denied.');
  } catch (error) {
    console.error(error);
    toast(error.message || 'Could not deny request.', true);
  }
}

/* ───────────────────────────────────────────────────
   EMPLOYEES COLLECTION (employees/{employeeId})
   ─────────────────────────────────────────────────── */

function attachEmployeesView() {
  const empConstraints = [];
  if (state.companyId) empConstraints.push(where('companyId', '==', state.companyId));
  if (isAgencyUser()) empConstraints.push(where('agencyId', '==', state.agencyId));
  empConstraints.push(orderBy('name', 'asc'));

  const empQuery = query(collection(db, 'workers'), ...empConstraints);

  state.unsubscribers.push(
    onSnapshot(empQuery, (snap) => {
      state.allEmployees = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter(isRowVisibleToProfile);
      renderEmployeeList(state.allEmployees);
    }, (error) => {
      console.error(error);
      toast(error.message || 'Could not load employees.', true);
    })
  );
}

function renderEmployeeList(employees) {
  if (!els.employeeListBody) return;

  const filter = String(els.empFilterInput?.value || '').trim().toLowerCase();
  const filtered = employees.filter((e) => {
    if (!filter) return true;
    return (
      String(e.name || '').toLowerCase().includes(filter) ||
      String(e.employeeNumber || '').toLowerCase().includes(filter)
    );
  });

  if (!filtered.length) {
    els.employeeListBody.innerHTML = '<tr><td colspan="6">No employees found.</td></tr>';
    return;
  }

  els.employeeListBody.innerHTML = filtered.map((emp) => `
    <tr>
      <td>${escapeHtml(emp.employeeNumber || '-')}</td>
      <td>${escapeHtml(emp.name || '-')}</td>
      <td>${escapeHtml(emp.clientId || emp.companyId || '-')}</td>
      <td>${escapeHtml(emp.siteId || emp.assignedSiteId || '-')}</td>
      <td><span class="tiny-flag">${escapeHtml(emp.status || 'active')}</span></td>
      <td>
        <button class="secondary-btn emp-edit-btn" data-id="${emp.id}" type="button">Edit</button>
      </td>
    </tr>
  `).join('');

  els.employeeListBody.querySelectorAll('.emp-edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => loadEmployeeForEdit(btn.dataset.id));
  });
}

function loadEmployeeForEdit(empId) {
  const emp = (state.allEmployees || []).find((e) => e.id === empId);
  if (!emp) { toast('Employee not found.', true); return; }

  if (els.employeeDocId) els.employeeDocId.value = empId;
  if (els.empNameInput) els.empNameInput.value = emp.name || '';
  if (els.empNumberInput) els.empNumberInput.value = emp.employeeNumber || '';
  if (els.empAgencyInput) els.empAgencyInput.value = emp.agencyId || '';
  if (els.empClientInput) els.empClientInput.value = emp.clientId || emp.companyId || '';
  if (els.empSiteInput) els.empSiteInput.value = emp.siteId || emp.assignedSiteId || '';
  if (els.empPinInput) els.empPinInput.value = '';
  if (els.empStatusSelect) els.empStatusSelect.value = emp.status || 'active';
  els.empCancelEditBtn?.classList.remove('hidden');
}

function cancelEmployeeEdit() {
  els.employeeForm?.reset();
  if (els.employeeDocId) els.employeeDocId.value = '';
  els.empCancelEditBtn?.classList.add('hidden');
}

async function handleSaveEmployee(event) {
  event.preventDefault();

  if (!isManager()) {
    toast('Only managers and admins can manage employees.', true);
    return;
  }

  const name = prettifyHumanName(els.empNameInput?.value.trim());
  const nameKey = normalizeName(name);

  if (!name || nameKey.length < 2) {
    toast('Enter a valid worker name.', true);
    return;
  }

  let employeeNumber = els.empNumberInput?.value.trim();
  const agencyId = els.empAgencyInput?.value.trim() || state.agencyId || '';
  const clientId = els.empClientInput?.value.trim() || state.companyId || '';
  const assignedSiteId = els.empSiteInput?.value.trim() || '';
  const status = els.empStatusSelect?.value || 'active';
  const existingId = els.employeeDocId?.value || '';
  const pin = String(els.empPinInput?.value || '').trim();

  // Auto-generate employee number if blank
  if (!employeeNumber) {
    employeeNumber = await generateNextEmployeeNumber();
  }

  const [firstName, ...lastParts] = name.split(' ');
  const lastName = lastParts.join(' ');

  const payload = {
    name,
    displayName: name,
    firstName: firstName || '',
    lastName: lastName || '',
    nameKey,
    employeeNumber,
    companyId: clientId,
    clientId,
    agencyId,
    agencyName: agencyId,
    assignedSiteId,
    siteId: assignedSiteId,
    status,
    workerId: existingId || '',
    updatedAt: serverTimestamp(),
  };

  if (pin) {
    payload.pinHash = await hashWorkerPin(pin, agencyId || clientId || 'default');
  }

  try {
    if (existingId) {
      // Update existing worker
      await updateDoc(doc(db, 'workers', existingId), payload);
      await logAudit('worker_updated', 'worker', existingId, {}, payload, pin ? 'PIN reset' : 'Profile update');
      toast('Worker updated.');
    } else {
      // Create new worker
      payload.createdAt = serverTimestamp();
      const newRef = await addDoc(collection(db, 'workers'), payload);
      // Keep both IDs for compatibility with the original QRTimeClock data shape.
      await updateDoc(newRef, { employeeId: newRef.id, workerId: newRef.id });
      await logAudit('worker_created', 'worker', newRef.id, {}, payload, 'Worker added');
      toast('Worker created: ' + employeeNumber);
    }

    cancelEmployeeEdit();
  } catch (error) {
    console.error(error);
    toast(error.message || 'Could not save worker.', true);
  }
}

async function generateNextEmployeeNumber() {
  // Find the highest existing employee number and increment
  const prefix = 'EMP-';
  const existing = (state.allEmployees || [])
    .map((e) => e.employeeNumber || '')
    .filter((n) => n.startsWith(prefix))
    .map((n) => parseInt(n.replace(prefix, ''), 10))
    .filter((n) => !isNaN(n));

  const maxNum = existing.length ? Math.max(...existing) : 1000;
  return prefix + String(maxNum + 1);
}

function attachUsersViewIfAdmin() {
  if (!isAdmin()) return;
  attachUsersView();
}

function attachUsersView() {
  const userConstraints = [];
  if (state.companyId) userConstraints.push(where('companyId', '==', state.companyId));
  userConstraints.push(orderBy('name', 'asc'));

  const usersQuery = query(collection(db, 'users'), ...userConstraints);

  state.unsubscribers.push(
    onSnapshot(
      usersQuery,
      (snap) => {
        const rows = snap.docs.map((d) => d.data());

        if (!rows.length) {
          els.userListBody.innerHTML = '<tr><td colspan="4">No users yet.</td></tr>';
          return;
        }

        els.userListBody.innerHTML = rows
          .map((row) => `
            <tr>
              <td>${escapeHtml(row.name || '-')}</td>
              <td>${escapeHtml(row.email || '-')}</td>
              <td>${escapeHtml(row.role || '-')}</td>
              <td>${row.active ? 'Yes' : 'No'}</td>
            </tr>
          `)
          .join('');
      },
      (error) => {
        console.error(error);
        toast(error.message || 'Could not load users.', true);
      }
    )
  );
}

async function handleSaveProfile(event) {
  event.preventDefault();

  try {
    const uid = els.userUidInput?.value.trim();
    const profilePayload = {
      name: prettifyHumanName(els.userNameInput?.value.trim()),
      email: els.userEmailInput?.value.trim().toLowerCase(),
      role: els.userRoleInput?.value,
      active: els.userActiveInput?.value === 'true',
      updatedAt: serverTimestamp(),
    };
    // Auto-assign current user's companyId to new profiles
    if (state.companyId) profilePayload.companyId = state.companyId;

    await setDoc(doc(db, 'users', uid), profilePayload, { merge: true });

    toast('User profile saved.');
    els.userProfileForm?.reset();
  } catch (error) {
    console.error(error);
    toast(error.message || 'Could not save profile.', true);
  }
}

function populateAgencyWorkerSelect() {
  if (!els.agencyWorkerSelect) return;

  const current = els.agencyWorkerSelect.value;
  const rows = getDerivedTimesheetRows();

  els.agencyWorkerSelect.innerHTML = '<option value="">Select a worker</option>' +
    rows.map((row) => `<option value="${escapeHtml(row.nameKey)}">${escapeHtml(row.name)}</option>`).join('');

  if (rows.some((row) => row.nameKey === current)) {
    els.agencyWorkerSelect.value = current;
  }
}

function renderAgencyPreview() {
  if (!els.agencyPreview || !els.agencyWorkerSelect) return;

  const selectedNameKey = els.agencyWorkerSelect.value;
  if (!selectedNameKey) {
    els.agencyPreview.innerHTML = '<div class="empty-state">Choose a worker and click Preview Sheet.</div>';
    return;
  }

  const weekKey = formatDateKey(state.selectedWeekStart);
  const row = getDerivedTimesheetRows().find((r) => r.nameKey === selectedNameKey && r.weekKey === weekKey);

  if (!row) {
    els.agencyPreview.innerHTML = '<div class="empty-state">No weekly sheet found for that worker.</div>';
    return;
  }

  const signedAt = row.managerSignedAt?.seconds
    ? formatDateTime(row.managerSignedAt.seconds * 1000)
    : '-';

  const dailyRows = buildAgencyDailyRows(row.dailyTotals);

  els.agencyPreview.innerHTML = `
    <div id="agencyPrintableSheet" style="background:#fff;color:#111;border-radius:12px;padding:24px;min-height:200px;">
      <div style="display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap;margin-bottom:18px;">
        <div>
          <h2 style="margin:0 0 8px;font-size:28px;">Weekly Time Sheet</h2>
          <div style="font-size:15px;line-height:1.6;">
            <div><strong>Worker:</strong> ${escapeHtml(row.name)}</div>
            <div><strong>Staffing Company:</strong> ${escapeHtml(formatStaffingCompany(row.agencyName || row.agencyId || '-'))}</div>
            <div><strong>Client:</strong> ${escapeHtml(row.clientId || row.companyId || getCompanyName())}</div>
            <div><strong>Site:</strong> ${escapeHtml(row.siteId || '-')}</div>
            <div><strong>Week Start:</strong> ${escapeHtml(row.weekKey)}</div>
            <div><strong>Status:</strong> ${escapeHtml(row.status)}</div>
          </div>
        </div>
        <div style="font-size:14px;line-height:1.7;text-align:right;">
          <div><strong>Company:</strong> ${escapeHtml(getCompanyName())}</div>
          <div><strong>Generated:</strong> ${escapeHtml(formatDateTime(Date.now()))}</div>
        </div>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:18px;">
        <thead>
          <tr>
            <th style="border:1px solid #bbb;padding:10px;text-align:left;background:#f3f6fa;">Date</th>
            <th style="border:1px solid #bbb;padding:10px;text-align:left;background:#f3f6fa;">Clock In</th>
            <th style="border:1px solid #bbb;padding:10px;text-align:left;background:#f3f6fa;">Lunch Out</th>
            <th style="border:1px solid #bbb;padding:10px;text-align:left;background:#f3f6fa;">Lunch In</th>
            <th style="border:1px solid #bbb;padding:10px;text-align:left;background:#f3f6fa;">Clock Out</th>
            <th style="border:1px solid #bbb;padding:10px;text-align:left;background:#f3f6fa;">Hours</th>
          </tr>
        </thead>
        <tbody>
          ${dailyRows}
        </tbody>
      </table>

      <div style="display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-top:24px;">
        <div style="font-size:15px;line-height:1.8;">
          <div><strong>Total Hours:</strong> ${Number(row.weeklyHours || 0).toFixed(2)}</div>
          <div><strong>Days Worked:</strong> ${Number(row.daysWorked || 0)}</div>
        </div>

        <div style="font-size:15px;line-height:1.8;text-align:right;">
          <div><strong>Manager:</strong> ${escapeHtml(row.managerSignedBy || '-')}</div>
          <div><strong>Signed:</strong> ${escapeHtml(signedAt)}</div>
        </div>
      </div>
    </div>
  `;
}

function buildAgencyDailyRows(dailyTotals) {
  const keys = Object.keys(dailyTotals || {}).sort();
  if (!keys.length) {
    return `
      <tr>
        <td colspan="6" style="border:1px solid #bbb;padding:10px;">No punches recorded for this week.</td>
      </tr>
    `;
  }

  return keys.map((dateKey) => {
    const row = dailyTotals[dateKey] || {};
    return `
      <tr>
        <td style="border:1px solid #bbb;padding:10px;">${escapeHtml(dateKey)}</td>
        <td style="border:1px solid #bbb;padding:10px;">${escapeHtml(row.clock_in || '-')}</td>
        <td style="border:1px solid #bbb;padding:10px;">${escapeHtml(row.start_lunch || '-')}</td>
        <td style="border:1px solid #bbb;padding:10px;">${escapeHtml(row.end_lunch || '-')}</td>
        <td style="border:1px solid #bbb;padding:10px;">${escapeHtml(row.clock_out || '-')}</td>
        <td style="border:1px solid #bbb;padding:10px;">${Number(row.hours || 0).toFixed(2)}</td>
      </tr>
    `;
  }).join('');
}

function printAgencyPreview() {
  const sheet = document.getElementById('agencyPrintableSheet');
  if (!sheet) {
    toast('Preview the sheet first.', true);
    return;
  }

  const win = window.open('', '_blank', 'width=1000,height=800');
  if (!win) {
    toast('Pop-up blocked. Allow pop-ups to print.', true);
    return;
  }

  win.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Agency Time Sheet</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 24px;
            color: #111;
            background: #fff;
          }
          @media print {
            body {
              margin: 12px;
            }
          }
        </style>
      </head>
      <body>
        ${sheet.outerHTML}
        <script>
          window.onload = function() {
            window.print();
          };
        <\/script>
      </body>
    </html>
  `);
  win.document.close();
}

function clearLiveListeners() {
  state.unsubscribers.forEach((unsub) => {
    try { unsub(); } catch (_) {}
  });
  state.unsubscribers = [];
}

function clearTimesheetListenerOnly() {
  clearLiveListeners();

  if (state.me && isManager()) {
    attachManagerLiveViews();
    attachTimesheetView();
    attachUsersViewIfAdmin();
  }
}

function isManager() {
  return ['manager', 'admin', 'agencyOwner', 'agencyAdmin', 'clientManager', 'platformOwner'].includes(state.profile?.role);
}

function isAdmin() {
  return ['admin', 'agencyOwner', 'agencyAdmin', 'platformOwner'].includes(state.profile?.role);
}

function isClientManager() {
  return state.profile?.role === 'clientManager';
}

function getAssignedClientIds() {
  return Array.isArray(state.profile?.assignedClientIds) ? state.profile.assignedClientIds : [];
}

function getAssignedSiteIds() {
  return Array.isArray(state.profile?.assignedSiteIds) ? state.profile.assignedSiteIds : [];
}

function isRowVisibleToProfile(row) {
  if (!row) return false;
  if (isAdmin()) return true;
  if (isClientManager()) {
    const clientIds = getAssignedClientIds();
    const siteIds = getAssignedSiteIds();
    const clientMatch = !clientIds.length || (row.clientId && clientIds.includes(row.clientId)) || (row.companyId && clientIds.includes(row.companyId));
    const siteMatch = !siteIds.length || (row.siteId && siteIds.includes(row.siteId)) || (row.assignedSiteId && siteIds.includes(row.assignedSiteId));
    return clientMatch && siteMatch;
  }
  return isManager();
}

function prettyAction(action) {
  return String(action || '-')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function statusLabelForAction(action) {
  const map = {
    clock_in: 'Clocked In',
    start_lunch: 'On Lunch',
    end_lunch: 'Back From Lunch',
    clock_out: 'Clocked Out'
  };
  return map[action] || 'Saved';
}

function prettifyHumanName(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function normalizeName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .replaceAll(' ', '_');
}

function getRequestDateLabel(row) {
  if (row?.requestedDate) return row.requestedDate;
  if (row?.requestedLocalDate) return row.requestedLocalDate;
  if (row?.requestedTimestampMs) return formatDateKey(new Date(row.requestedTimestampMs));
  return '-';
}

function getRequestTimeLabel(row) {
  if (row?.requestedTime) return row.requestedTime;
  if (row?.requestedTimestampMs) return formatTime(row.requestedTimestampMs);
  return '-';
}

async function hashWorkerPin(pin, scope) {
  const input = `${String(scope || '').trim()}::${String(pin || '').trim()}`;
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function logAudit(action, entityType, entityId, oldValue = {}, newValue = {}, reason = '') {
  if (!firebaseReady() || !state.me) return;
  try {
    await addDoc(collection(db, 'auditLogs'), {
      agencyId: state.agencyId || '',
      companyId: state.companyId || '',
      actorId: state.me.uid || '',
      actorRole: state.profile?.role || '',
      action,
      entityType,
      entityId,
      oldValue,
      newValue,
      reason,
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.warn('Audit log write failed:', error.message);
  }
}

function toLocalEditString(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hour = String(d.getHours()).padStart(2, '0');
  const minute = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function parseLocalEditString(value) {
  const cleaned = String(value || '').trim().replace('T', ' ');
  const match = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
  if (!match) return 0;

  const [, y, m, d, h, min] = match;
  const date = new Date(
    Number(y),
    Number(m) - 1,
    Number(d),
    Number(h),
    Number(min),
    0,
    0
  );

  const ms = date.getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function parseLocalDateAndTime(dateValue, timeValue) {
  if (!dateValue || !timeValue) return 0;
  const cleaned = `${dateValue} ${timeValue}`;
  const match = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
  if (!match) return 0;

  const [, y, m, d, h, min] = match;
  const date = new Date(
    Number(y),
    Number(m) - 1,
    Number(d),
    Number(h),
    Number(min),
    0,
    0
  );

  const ms = date.getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function getMondayDate(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDateKey(date) {
  return formatDateInput(date);
}

function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTime(ms) {
  if (!ms) return '-';
  return new Date(ms).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit'
  });
}

function formatDateOnly(ms) {
  if (!ms) return '-';
  return new Date(ms).toLocaleDateString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function formatDateTime(ms) {
  if (!ms) return '-';
  return new Date(ms).toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function formatTimeForInput(ms) {
  const d = new Date(ms);
  const hour = String(d.getHours()).padStart(2, '0');
  const minute = String(d.getMinutes()).padStart(2, '0');
  return `${hour}:${minute}`;
}

function toast(message, isError = false) {
  if (!els.toast) return;
  els.toast.textContent = message;
  els.toast.classList.remove('hidden');
  els.toast.style.borderColor = isError
    ? 'rgba(255,107,107,0.45)'
    : 'rgba(255,255,255,0.14)';

  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => els.toast.classList.add('hidden'), 3200);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
