/* ──────────────────────────────────────────────────────────────
   Vitappio PWA — app.js v2
   SQLite (sql.js) + auth flow + dashboard + MEDOM integration
   ────────────────────────────────────────────────────────────── */

// ── Helpers ──────────────────────────────────────────────────

function isLocalDevHostname(h) {
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "" ||
    /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(h)
  );
}

function getUrlHostname(url) {
  try {
    return new URL(String(url)).hostname.toLowerCase();
  } catch (_) {
    return "";
  }
}

function isMedomPublicHost(url) {
  return getUrlHostname(url) === "medom.virtual-hospital.ru";
}

function joinApiUrl(base, path) {
  const b = String(base || "").replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : "/" + path;
  return b + p;
}

function _obf(s) {
  return btoa(unescape(encodeURIComponent(s))).split("").reverse().join("");
}
function _deobf(s) {
  return decodeURIComponent(escape(atob(s.split("").reverse().join(""))));
}
function saveMedomCreds(login, password) {
  localStorage.setItem("vitappio.medom.login", _obf(login));
  localStorage.setItem("vitappio.medom.password", _obf(password));
}
function loadMedomCreds() {
  try {
    const l = localStorage.getItem("vitappio.medom.login");
    const p = localStorage.getItem("vitappio.medom.password");
    if (!l || !p) return null;
    return { login: _deobf(l), password: _deobf(p) };
  } catch { return null; }
}
function isMedomConfigured() {
  return !!loadMedomCreds();
}

// ── Config ────────────────────────────────────────────────────

let APP_CONFIG = {
  medom_api_url: "https://medom.virtual-hospital.ru",
  backend_api_url: "http://127.0.0.1:8000",
  app_name: "Vitappio",
  version: "2.0.0",
};

async function loadConfig() {
  try {
    const resp = await fetch("./config.json?t=" + Date.now());
    if (resp.ok) {
      const cfg = await resp.json();
      Object.assign(APP_CONFIG, cfg);
    }
  } catch (_) {}
}

function inferDefaultApiBase() {
  try {
    const h = window.location.hostname;
    if (h === "localhost" || h === "127.0.0.1" || h === "") {
      return APP_CONFIG.backend_api_url || "http://127.0.0.1:8000";
    }
    if (isLocalDevHostname(h)) {
      return "http://" + h + ":8000";
    }
  } catch (_) {}
  return APP_CONFIG.medom_api_url || "https://medom.virtual-hospital.ru";
}

function normalizeApiBaseForOrigin(stored) {
  try {
    const h = window.location.hostname;
    const isLocal = isLocalDevHostname(h);
    if (!isLocal) {
      return (stored && String(stored).trim()) || inferDefaultApiBase();
    }
    const s = (stored || "").trim().replace(/\/+$/, "");
    const local = inferDefaultApiBase();
    if (!s || isMedomPublicHost(s)) {
      if (s && isMedomPublicHost(s)) {
        try { localStorage.setItem("vitappio.apiBaseUrl", local); } catch (_) {}
      }
      return local;
    }
    return s;
  } catch (_) {
    return stored || inferDefaultApiBase();
  }
}

function coerceBackendUrlForPage(input) {
  const u = (input || "").trim().replace(/\/+$/, "");
  try {
    const h = window.location.hostname;
    if (isLocalDevHostname(h) && isMedomPublicHost(u)) {
      return inferDefaultApiBase();
    }
  } catch (_) {}
  return u;
}

const _storedApiBase = localStorage.getItem("vitappio.apiBaseUrl");
let API_BASE_URL = "";
let DEMO_MODE = !_storedApiBase;
let medomCredsSynced = false;

// ── SQLite Database ──────────────────────────────────────────

let db = null;

function loadDbFromIndexedDB() {
  return new Promise((resolve) => {
    const req = indexedDB.open("vitappio_db", 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains("db")) {
        req.result.createObjectStore("db");
      }
    };
    req.onsuccess = () => {
      const tx = req.result.transaction("db", "readonly");
      const getReq = tx.objectStore("db").get("sqlite");
      getReq.onsuccess = () => resolve(getReq.result || null);
      getReq.onerror = () => resolve(null);
    };
    req.onerror = () => resolve(null);
  });
}

function saveDbToIndexedDB() {
  if (!db) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const data = db.export();
    const buffer = data.buffer;
    const req = indexedDB.open("vitappio_db", 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains("db")) {
        req.result.createObjectStore("db");
      }
    };
    req.onsuccess = () => {
      const tx = req.result.transaction("db", "readwrite");
      tx.objectStore("db").put(buffer, "sqlite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
}

async function initDatabase() {
  const SQL = await initSqlJs({
    locateFile: (file) =>
      "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/" + file,
  });

  const savedData = await loadDbFromIndexedDB();
  if (savedData) {
    db = new SQL.Database(new Uint8Array(savedData));
  } else {
    db = new SQL.Database();
  }

  db.run(`CREATE TABLE IF NOT EXISTS patients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    birth_date TEXT NOT NULL,
    gender TEXT NOT NULL,
    medom_patient_id TEXT,
    server_patient_id TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    server_session_id TEXT,
    device_serial TEXT,
    medom_device_id TEXT,
    status TEXT DEFAULT 'active',
    started_at TEXT DEFAULT (datetime('now')),
    finished_at TEXT,
    finish_reason TEXT,
    FOREIGN KEY (patient_id) REFERENCES patients(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS diary_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    synced INTEGER DEFAULT 0,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    patient_id INTEGER NOT NULL,
    html_content TEXT,
    doctor_name TEXT,
    uploaded_at TEXT,
    FOREIGN KEY (session_id) REFERENCES patients(id)
  )`);

  await saveDbToIndexedDB();
}

function dbSave() {
  saveDbToIndexedDB().catch(() => {});
}

// ── DB query helpers ─────────────────────────────────────────

function dbFindPatient(fullName, birthDate) {
  const rows = db.exec(
    "SELECT * FROM patients WHERE full_name = ? AND birth_date = ? LIMIT 1",
    [fullName.trim(), birthDate]
  );
  if (!rows.length || !rows[0].values.length) return null;
  const cols = rows[0].columns;
  const vals = rows[0].values[0];
  const obj = {};
  cols.forEach((c, i) => (obj[c] = vals[i]));
  return obj;
}

function dbGetPatientById(id) {
  const rows = db.exec("SELECT * FROM patients WHERE id = ? LIMIT 1", [id]);
  if (!rows.length || !rows[0].values.length) return null;
  const cols = rows[0].columns;
  const vals = rows[0].values[0];
  const obj = {};
  cols.forEach((c, i) => (obj[c] = vals[i]));
  return obj;
}

function dbCreatePatient(fullName, birthDate, gender) {
  db.run(
    "INSERT INTO patients (full_name, birth_date, gender) VALUES (?, ?, ?)",
    [fullName.trim(), birthDate, gender]
  );
  const idRes = db.exec("SELECT last_insert_rowid()");
  const id = idRes[0].values[0][0];
  dbSave();
  return id;
}

function dbUpdatePatientServerId(patientDbId, serverId, medomId) {
  if (serverId) {
    db.run("UPDATE patients SET server_patient_id = ? WHERE id = ?", [serverId, patientDbId]);
  }
  if (medomId) {
    db.run("UPDATE patients SET medom_patient_id = ? WHERE id = ?", [medomId, patientDbId]);
  }
  dbSave();
}

function dbGetActiveSession(patientId) {
  const rows = db.exec(
    "SELECT * FROM sessions WHERE patient_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1",
    [patientId]
  );
  if (!rows.length || !rows[0].values.length) return null;
  const cols = rows[0].columns;
  const vals = rows[0].values[0];
  const obj = {};
  cols.forEach((c, i) => (obj[c] = vals[i]));
  return obj;
}

function dbGetCompletedSessions(patientId) {
  const rows = db.exec(
    "SELECT * FROM sessions WHERE patient_id = ? AND status = 'completed' ORDER BY finished_at DESC",
    [patientId]
  );
  if (!rows.length) return [];
  const cols = rows[0].columns;
  return rows[0].values.map((vals) => {
    const obj = {};
    cols.forEach((c, i) => (obj[c] = vals[i]));
    return obj;
  });
}

function dbCreateSession(patientId, serverSessionId, deviceSerial, medomDeviceId) {
  db.run(
    "INSERT INTO sessions (patient_id, server_session_id, device_serial, medom_device_id) VALUES (?, ?, ?, ?)",
    [patientId, serverSessionId || "", deviceSerial || "", medomDeviceId || ""]
  );
  const idRes = db.exec("SELECT last_insert_rowid()");
  const id = idRes[0].values[0][0];
  dbSave();
  return id;
}

function dbFinishSession(sessionDbId, reason) {
  db.run(
    "UPDATE sessions SET status = 'completed', finished_at = datetime('now'), finish_reason = ? WHERE id = ?",
    [reason || "", sessionDbId]
  );
  dbSave();
}

function dbAddDiaryEvent(sessionDbId, eventType, timestamp) {
  db.run(
    "INSERT INTO diary_events (session_id, event_type, timestamp) VALUES (?, ?, ?)",
    [sessionDbId, eventType, timestamp]
  );
  dbSave();
}

function dbGetDiaryEvents(sessionDbId) {
  const rows = db.exec(
    "SELECT * FROM diary_events WHERE session_id = ? ORDER BY id DESC",
    [sessionDbId]
  );
  if (!rows.length) return [];
  const cols = rows[0].columns;
  return rows[0].values.map((vals) => {
    const obj = {};
    cols.forEach((c, i) => (obj[c] = vals[i]));
    return obj;
  });
}

function dbSaveReport(sessionDbId, patientId, htmlContent, doctorName) {
  db.run(
    "INSERT INTO reports (session_id, patient_id, html_content, doctor_name, uploaded_at) VALUES (?, ?, ?, ?, datetime('now'))",
    [sessionDbId, patientId, htmlContent || "", doctorName || ""]
  );
  dbSave();
}

function dbGetReport(sessionDbId) {
  const rows = db.exec(
    "SELECT * FROM reports WHERE session_id = ? ORDER BY id DESC LIMIT 1",
    [sessionDbId]
  );
  if (!rows.length || !rows[0].values.length) return null;
  const cols = rows[0].columns;
  const vals = rows[0].values[0];
  const obj = {};
  cols.forEach((c, i) => (obj[c] = vals[i]));
  return obj;
}

// ── Screen map & state ───────────────────────────────────────

const screenMap = {
  auth: "scr-auth",
  login: "scr-login",
  dashboard: "scr-dashboard",
  credentials: "scr-credentials",
  intro: "scr-intro",
  kit1: "scr-kit1",
  kit2: "scr-kit2",
  patient: "scr-patient",
  device: "scr-device",
  wizard: "scr-wizard",
  check: "scr-check",
  success: "scr-success",
  fail: "scr-fail",
  diary: "scr-diary",
  finish: "scr-finish",
  done: "scr-finish-done",
  settings: "scr-settings",
};

const WZ_STEPS = [
  { title: "Подключение Wi-Fi модема" },
  {
    title: "Подготовка кожи и установка электродов",
    text: "Протрите область крепления электродов салфеткой. Убедитесь, что кожа сухая и чистая. Снимите защитную плёнку с каждого электрода и плотно прижмите к коже в обозначенных точках.",
    image: "./static/cardience1.webp",
    note: "Точки расположения электродов не должны находиться на подвижных частях тела (плечо, живот).",
  },
  {
    title: "Установка аккумуляторной батареи",
    text: "Установите аккумуляторную батарею на регистратор.",
  },
];

const state = {
  currentPatientDbId: null,
  currentSessionDbId: null,
  patientId: "",
  sessionId: "",
  serial: "",
  medomDeviceId: "",
  medomPatientId: "",
  awaitingConclusionPatientId: "",
  prevScreen: "auth",
  wzStep: 1,
  modemOk: false,
  diary: [],
  checkSec: 100,
  timerInterval: null,
  checkPollInterval: null,
  modemBootInProgress: false,
};

// ── UI helpers ───────────────────────────────────────────────

function refreshIcons() {
  if (typeof lucide !== "undefined" && lucide.createIcons) {
    lucide.createIcons();
  }
}

function setStatus(type, text) {
  const el = document.getElementById("stLine");
  if (!el) return;
  const cls =
    type === "ok"
      ? " s-ok"
      : type === "warn"
        ? " s-warn"
        : type === "err"
          ? " s-err"
          : type === "info"
            ? " s-info"
            : "";
  el.className = "st-line" + cls;
  el.textContent = text || "Готов к работе";
}

function toast(text) {
  const c = document.getElementById("toastC");
  if (!c) return;
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = text;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

function updateNet() {
  const offline = !navigator.onLine;
  const dot = document.getElementById("netDot");
  const txt = document.getElementById("netText");
  if (dot) dot.className = "net-dot" + (offline ? " off" : "");
  if (txt) txt.textContent = offline ? "Офлайн" : "Онлайн";
}

function getErrorText(error) {
  const m = error && error.message ? error.message : "неизвестная ошибка";
  if (m === "Failed to fetch" || /NetworkError|Load failed/i.test(m)) {
    return "Нет связи с сервером. Проверьте, запущен ли backend, и URL в настройках.";
  }
  if (/MEDOM.*failed/i.test(m)) {
    return "Ошибка на стороне MEDOM. Попробуйте повторить операцию позже.";
  }
  if (/^HTTP \d+$/.test(m)) {
    const code = parseInt(m.split(" ")[1], 10);
    if (code === 401 || code === 403) return "Нет доступа. Проверьте авторизацию в настройках.";
    if (code === 422) return "Проверьте обязательные поля и формат данных.";
    return "Ошибка сервера (" + code + "). Попробуйте ещё раз.";
  }
  return m;
}

// ── Navigation ───────────────────────────────────────────────

function goTo(name) {
  if (name === "device" && !state.patientId) {
    setStatus("err", "Сначала зарегистрируйте пациента");
    return;
  }
  if (name === "wizard" && !state.sessionId) {
    setStatus("err", "Сначала создайте сессию");
    return;
  }

  if (name === "check") {
    state.checkSec = 100;
    resetCheckUI();
  } else {
    stopAllChecks();
  }

  const currentScr = document.querySelector(".scr.on");
  if (currentScr) {
    const curId = currentScr.id;
    for (const [k, v] of Object.entries(screenMap)) {
      if (v === curId) { state.prevScreen = k; break; }
    }
  }

  document.querySelectorAll(".scr").forEach((s) => s.classList.remove("on"));
  const id = screenMap[name];
  const el = id ? document.getElementById(id) : null;
  if (el) {
    el.classList.add("on");
  }
  window.scrollTo({ top: 0, behavior: "smooth" });

  if (name === "settings") loadSettingsScreen();
  if (name === "wizard") {
    state.wzStep = 1;
    state.modemOk = false;
    state.modemBootInProgress = false;
    resetModemLedUi();
    renderWizard();
  }
  if (name === "diary") renderDiary();
  if (name === "check") startCheckFlow();
  if (name === "done") renderConclusionScreen(false);
  if (name === "dashboard") renderDashboard();
  if (name === "device") {
    if (isMedomConfigured()) {
      const serialGroup = document.querySelector("#fSerial")?.closest(".fg");
      const deviceGroup = document.getElementById("fDeviceGroup");
      if (serialGroup) serialGroup.style.display = "none";
      if (deviceGroup) deviceGroup.style.display = "block";
      loadMedomDevices();
    } else {
      const serialGroup = document.querySelector("#fSerial")?.closest(".fg");
      const deviceGroup = document.getElementById("fDeviceGroup");
      if (serialGroup) serialGroup.style.display = "";
      if (deviceGroup) deviceGroup.style.display = "none";
    }
  }

  refreshIcons();
}

// ── Auth / Login / Register ──────────────────────────────────

function loginPatient() {
  const nameEl = document.getElementById("fLoginName");
  const dobEl = document.getElementById("fLoginDob");
  const errBox = document.getElementById("loginError");
  const errText = document.getElementById("loginErrorText");
  let valid = true;

  [nameEl, dobEl].forEach((f) => f && f.classList.remove("er"));
  document.querySelectorAll("#scr-login .fe").forEach((e) => e.classList.remove("vis"));
  if (errBox) errBox.style.display = "none";

  if (!nameEl.value.trim()) {
    nameEl.classList.add("er");
    document.getElementById("fLoginNameErr").classList.add("vis");
    valid = false;
  }
  if (!dobEl.value) {
    dobEl.classList.add("er");
    document.getElementById("fLoginDobErr").classList.add("vis");
    valid = false;
  }
  if (!valid) {
    setStatus("err", "Заполните все поля");
    return;
  }

  const patient = dbFindPatient(nameEl.value.trim(), dobEl.value);
  if (!patient) {
    if (errBox) errBox.style.display = "block";
    if (errText) errText.textContent = "Пациент не найден. Проверьте данные или зарегистрируйтесь.";
    setStatus("err", "Пациент не найден");
    return;
  }

  activatePatient(patient);
  setStatus("ok", "Вход выполнен");
  toast("Добро пожаловать, " + patient.full_name.split(" ")[0]);
  goTo("dashboard");
}

function activatePatient(patient) {
  state.currentPatientDbId = patient.id;
  state.patientId = patient.server_patient_id || String(patient.id);
  state.medomPatientId = patient.medom_patient_id || "";

  localStorage.setItem("vitappio.patientId", state.patientId);
  localStorage.setItem("vitappio.currentPatientDbId", String(patient.id));
  if (state.medomPatientId) {
    localStorage.setItem("vitappio.medomPatientId", state.medomPatientId);
  }

  const activeSession = dbGetActiveSession(patient.id);
  if (activeSession) {
    state.currentSessionDbId = activeSession.id;
    state.sessionId = activeSession.server_session_id || String(activeSession.id);
    state.serial = activeSession.device_serial || "";
    state.medomDeviceId = activeSession.medom_device_id || "";
    localStorage.setItem("vitappio.sessionId", state.sessionId);

    const events = dbGetDiaryEvents(activeSession.id);
    state.diary = events.map((e) => {
      const d = new Date(e.timestamp);
      return {
        type: e.event_type,
        time: String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"),
      };
    });
  } else {
    state.currentSessionDbId = null;
    state.sessionId = "";
    state.diary = [];
    localStorage.removeItem("vitappio.sessionId");
  }
}

function registerPatient() {
  const name = document.getElementById("fName");
  const dob = document.getElementById("fDob");
  const sex = document.getElementById("fSex");
  let valid = true;

  [name, dob, sex].forEach((f) => f && f.classList.remove("er"));
  document.querySelectorAll("#scr-patient .fe").forEach((e) => e.classList.remove("vis"));

  if (!name.value.trim()) {
    name.classList.add("er");
    document.getElementById("fNameErr").classList.add("vis");
    valid = false;
  }
  if (!dob.value) {
    dob.classList.add("er");
    document.getElementById("fDobErr").classList.add("vis");
    valid = false;
  }
  if (!sex.value) {
    sex.classList.add("er");
    document.getElementById("fSexErr").classList.add("vis");
    valid = false;
  }
  if (!valid) {
    setStatus("err", "Заполните все обязательные поля");
    return;
  }

  const existing = dbFindPatient(name.value.trim(), dob.value);
  if (existing) {
    setStatus("warn", "Пациент уже зарегистрирован, выполняем вход");
    activatePatient(existing);
    toast("Добро пожаловать, " + existing.full_name.split(" ")[0]);
    goTo("dashboard");
    return;
  }

  const btn = document.getElementById("btnReg");
  btn.classList.add("ld");
  btn.disabled = true;
  setStatus("info", "Регистрация пациента...");

  const fullName = name.value.trim();
  const parts = fullName.split(/\s+/);
  const patientDbId = dbCreatePatient(fullName, dob.value, sex.value);

  const finishRegistration = (serverId, medomId) => {
    if (serverId || medomId) {
      dbUpdatePatientServerId(patientDbId, serverId, medomId);
    }
    const patient = dbGetPatientById(patientDbId);
    activatePatient(patient);
    setStatus("ok", "Пациент зарегистрирован");
    btn.classList.remove("ld");
    btn.disabled = false;

    const credLogin = document.getElementById("credLogin");
    const credPass = document.getElementById("credPassword");
    if (credLogin) credLogin.textContent = fullName;
    if (credPass) credPass.textContent = dob.value;

    goTo("credentials");
  };

  if (isMedomConfigured()) {
    const medomPayload = {
      last_name: parts[0] || fullName,
      first_name: parts[1] || "",
      second_name: parts.slice(2).join(" ") || "",
      is_female: sex.value === "female" ? 1 : 0,
      birth_date: dob.value,
    };
    createPatientMedom(medomPayload)
      .then((response) => {
        finishRegistration(String(response.patient_id), String(response.patient_id));
      })
      .catch((err) => {
        setStatus("warn", "Ошибка MEDOM, пациент сохранён локально: " + getErrorText(err));
        finishRegistration(null, null);
      });
  } else if (!DEMO_MODE) {
    const payload = {
      full_name: fullName,
      birth_date: dob.value,
      gender: sex.value,
    };
    createPatient(payload)
      .then((response) => {
        finishRegistration(String(response.patient_id || response.id || ""), null);
      })
      .catch((err) => {
        setStatus("warn", "Ошибка сервера, пациент сохранён локально: " + getErrorText(err));
        finishRegistration(null, null);
      });
  } else {
    finishRegistration("demo-p-" + Date.now(), null);
  }
}

function logoutPatient() {
  state.currentPatientDbId = null;
  state.currentSessionDbId = null;
  state.patientId = "";
  state.sessionId = "";
  state.serial = "";
  state.medomDeviceId = "";
  state.medomPatientId = "";
  state.awaitingConclusionPatientId = "";
  state.diary = [];
  stopAllChecks();

  localStorage.removeItem("vitappio.patientId");
  localStorage.removeItem("vitappio.sessionId");
  localStorage.removeItem("vitappio.deviceSerial");
  localStorage.removeItem("vitappio.medomDeviceId");
  localStorage.removeItem("vitappio.medomPatientId");
  localStorage.removeItem("vitappio.currentPatientDbId");
  localStorage.removeItem("vitappio.awaitingConclusionPatientId");

  setStatus("ok", "Вы вышли из аккаунта");
  goTo("auth");
}

// ── Dashboard ────────────────────────────────────────────────

function renderDashboard() {
  if (!state.currentPatientDbId) {
    goTo("auth");
    return;
  }

  const patient = dbGetPatientById(state.currentPatientDbId);
  if (!patient) {
    goTo("auth");
    return;
  }

  const nameEl = document.getElementById("dashPatientName");
  const metaEl = document.getElementById("dashPatientMeta");
  if (nameEl) nameEl.textContent = patient.full_name;
  if (metaEl) {
    const genderText = patient.gender === "male" ? "Муж." : patient.gender === "female" ? "Жен." : "";
    metaEl.textContent = "Дата рождения: " + patient.birth_date + (genderText ? " · " + genderText : "");
  }

  const activeSession = dbGetActiveSession(patient.id);
  const completedSessions = dbGetCompletedSessions(patient.id);

  const activeEl = document.getElementById("dashActiveSession");
  const noSessionEl = document.getElementById("dashNoSession");
  const reportsEl = document.getElementById("dashReports");
  const reportsListEl = document.getElementById("dashReportsList");
  const activeInfoEl = document.getElementById("dashActiveSessionInfo");

  if (activeSession) {
    state.currentSessionDbId = activeSession.id;
    state.sessionId = activeSession.server_session_id || String(activeSession.id);
    state.serial = activeSession.device_serial || "";
    state.medomDeviceId = activeSession.medom_device_id || "";
    localStorage.setItem("vitappio.sessionId", state.sessionId);

    if (activeEl) activeEl.style.display = "block";
    if (noSessionEl) noSessionEl.style.display = "none";
    if (activeInfoEl) {
      activeInfoEl.textContent =
        "Начата: " + (activeSession.started_at || "—") +
        (activeSession.device_serial ? " · Прибор: " + activeSession.device_serial : "");
    }
  } else {
    state.currentSessionDbId = null;
    state.sessionId = "";
    localStorage.removeItem("vitappio.sessionId");

    if (activeEl) activeEl.style.display = "none";
    if (noSessionEl) noSessionEl.style.display = "block";
  }

  if (completedSessions.length > 0 && reportsEl && reportsListEl) {
    reportsEl.style.display = "block";
    reportsListEl.innerHTML = completedSessions
      .map((s) => {
        const date = s.finished_at ? new Date(s.finished_at).toLocaleDateString("ru-RU") : "—";
        const reason = s.finish_reason ? s.finish_reason : "";
        const report = dbGetReport(s.id);
        const hasReport = !!report;
        return (
          '<div class="rpt-card">' +
          '<div class="rpt-info">' +
          '<div class="rpt-date">' + date + '</div>' +
          '<div class="rpt-meta">' +
          (reason ? reason + " · " : "") +
          (s.device_serial ? "Прибор: " + s.device_serial : "Сессия #" + s.id) +
          "</div></div>" +
          (hasReport
            ? '<button class="rpt-btn" data-report-session="' + s.id + '">Отчёт</button>'
            : '<span class="dash-status dash-status-done">Нет отчёта</span>') +
          "</div>"
        );
      })
      .join("");

    reportsListEl.querySelectorAll("[data-report-session]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const sid = parseInt(btn.getAttribute("data-report-session"), 10);
        showReport(sid);
      });
    });
  } else if (reportsEl) {
    reportsEl.style.display = "none";
  }

  refreshIcons();
}

function showReport(sessionDbId) {
  const report = dbGetReport(sessionDbId);
  if (!report || !report.html_content) {
    toast("Отчёт не найден");
    return;
  }
  state.awaitingConclusionPatientId = state.patientId;
  localStorage.setItem("vitappio.awaitingConclusionPatientId", state.awaitingConclusionPatientId);
  goTo("done");

  setTimeout(() => {
    const frame = document.getElementById("conclusionFrame");
    const frameWrap = document.getElementById("conclusionFrameWrap");
    const wait = document.getElementById("conclusionWaiting");
    const meta = document.getElementById("conclusionMeta");
    if (frame) frame.srcdoc = report.html_content;
    if (frameWrap) frameWrap.style.display = "block";
    if (wait) wait.style.display = "none";
    if (meta) {
      const doctor = report.doctor_name ? "Врач: " + report.doctor_name + " · " : "";
      meta.textContent = doctor + "Загружено: " + (report.uploaded_at || "—");
    }
    setStatus("ok", "Отчёт загружен");
  }, 100);
}

// ── Wizard ───────────────────────────────────────────────────

function resetModemLedUi() {
  const led1 = document.getElementById("led1");
  const led2 = document.getElementById("led2");
  if (led1) led1.setAttribute("fill", "#555");
  if (led2) led2.setAttribute("fill", "#555");
  const step2Icon = document.getElementById("mdmStep2Icon");
  const step2Text = document.getElementById("mdmStep2Text");
  if (step2Icon) {
    step2Icon.className = "mdm-si pn";
    step2Icon.innerHTML = '<i data-lucide="loader" style="width:12px;height:12px"></i>';
  }
  if (step2Text) step2Text.textContent = "Включите модем и дождитесь индикаторов";
  const btnCheck = document.getElementById("btnCheckModem");
  const btnSkip = document.getElementById("btnSkipModem");
  if (btnCheck) {
    btnCheck.style.display = "";
    btnCheck.disabled = false;
    btnCheck.classList.remove("ld");
  }
  if (btnSkip) btnSkip.style.display = "";
}

function renderWizard() {
  const step = state.wzStep;
  const totalSteps = WZ_STEPS.length;
  const prog = document.getElementById("wzProgress");
  if (prog) {
    prog.innerHTML = "";
    for (let i = 1; i <= totalSteps; i += 1) {
      const d = document.createElement("div");
      d.className = "wz-d" + (i < step ? " dn" : i === step ? " act" : "");
      prog.appendChild(d);
    }
  }

  const counter = document.getElementById("wzCounter");
  if (counter) counter.textContent = "Шаг " + step + " из " + totalSteps;

  const modemBlock = document.getElementById("wzModemBlock");
  const textBlock = document.getElementById("wzTextBlock");

  if (step === 1) {
    if (modemBlock) modemBlock.style.display = "block";
    if (textBlock) textBlock.style.display = "none";
  } else {
    if (modemBlock) modemBlock.style.display = "none";
    if (textBlock) textBlock.style.display = "block";
    const data = WZ_STEPS[step - 1];
    const content = document.getElementById("wzTextContent");
    if (content && data) {
      content.innerHTML =
        "<h3>" + data.title +
        '</h3><p style="font-size:15px;color:var(--fg2);line-height:1.6;margin-top:8px">' +
        (data.text || "") + "</p>" +
        (data.image ? '<img class="wz-step-img" src="' + data.image + '" alt="' + data.title + '" />' : "") +
        (data.note ? '<div class="wz-note">' + data.note + "</div>" : "");
    }
  }

  const btnBack = document.getElementById("btnWzBack");
  if (btnBack) btnBack.style.display = step === 1 ? "none" : "";

  const nextBtn = document.getElementById("btnWzNext");
  const bt = nextBtn ? nextBtn.querySelector(".bt") : null;
  if (nextBtn && bt) {
    nextBtn.disabled = false;
    bt.textContent = step === totalSteps ? "Перейти к проверке" : "Далее";
  }

  refreshIcons();
}

function renderModemButtons() {
  const btnCheck = document.getElementById("btnCheckModem");
  const btnSkip = document.getElementById("btnSkipModem");
  if (state.modemOk) {
    if (btnCheck) btnCheck.style.display = "none";
    if (btnSkip) btnSkip.style.display = "none";
  } else {
    if (btnCheck) btnCheck.style.display = "";
    if (btnSkip) btnSkip.style.display = "";
  }
}

function checkModem() {
  if (state.modemBootInProgress) return;
  state.modemBootInProgress = true;
  const btn = document.getElementById("btnCheckModem");
  if (btn) { btn.classList.add("ld"); btn.disabled = true; }

  const led1 = document.getElementById("led1");
  const led2 = document.getElementById("led2");
  const step2Icon = document.getElementById("mdmStep2Icon");
  const step2Text = document.getElementById("mdmStep2Text");

  if (step2Icon) {
    step2Icon.className = "mdm-si ac";
    step2Icon.innerHTML = '<i data-lucide="loader" style="width:12px;height:12px"></i>';
  }
  if (step2Text) step2Text.textContent = "Ожидание индикаторов...";
  setStatus("info", "Проверка модема...");
  refreshIcons();

  setTimeout(() => { if (led1) led1.setAttribute("fill", "#EAB308"); }, 800);
  setTimeout(() => { if (led1) led1.setAttribute("fill", "#16A34A"); }, 2000);
  setTimeout(() => { if (led2) led2.setAttribute("fill", "#EAB308"); }, 2200);
  setTimeout(() => { if (led2) led2.setAttribute("fill", "#16A34A"); }, 3500);

  setTimeout(() => {
    if (step2Icon) {
      step2Icon.className = "mdm-si dn";
      step2Icon.innerHTML = '<i data-lucide="check" style="width:12px;height:12px"></i>';
    }
    if (step2Text) step2Text.textContent = "Индикаторы активны";
    state.modemOk = true;
    state.modemBootInProgress = false;
    if (btn) { btn.classList.remove("ld"); btn.disabled = false; }
    setStatus("ok", "Модем готов");
    toast("Модем подключён");
    renderWizard();
    refreshIcons();
  }, 3800);
}

function skipModem() {
  state.modemOk = true;
  setStatus("warn", "Шаг Wi-Fi пропущен");
  renderWizard();
  toast("Шаг пропущен");
}

function wzBack() {
  if (state.wzStep > 1) { state.wzStep -= 1; renderWizard(); }
}

function wzNext() {
  if (state.wzStep < WZ_STEPS.length) { state.wzStep += 1; renderWizard(); }
  else goTo("check");
}

// ── Session flow ─────────────────────────────────────────────

function createSessionFlow() {
  const serial = document.getElementById("fSerial");
  const deviceSelect = document.getElementById("fDevice");
  serial.classList.remove("er");
  document.getElementById("fSerialErr").classList.remove("vis");

  if (!state.patientId) {
    setStatus("err", "Сначала зарегистрируйте пациента");
    goTo("patient");
    return;
  }

  const useMedom = isMedomConfigured();

  if (useMedom) {
    if (!deviceSelect || !deviceSelect.value) {
      const errEl = document.getElementById("fDeviceErr");
      if (errEl) errEl.classList.add("vis");
      setStatus("err", "Выберите устройство MEDOM");
      return;
    }
  } else {
    if (!serial.value.trim()) {
      serial.classList.add("er");
      document.getElementById("fSerialErr").classList.add("vis");
      setStatus("err", "Укажите серийный номер");
      return;
    }
  }

  const btn = document.getElementById("btnSession");
  btn.classList.add("ld");
  btn.disabled = true;
  setStatus("info", "Создание сессии...");

  const finishSession = (serverSessionId, deviceSerial, medomDeviceId) => {
    const sessionDbId = dbCreateSession(
      state.currentPatientDbId,
      serverSessionId,
      deviceSerial,
      medomDeviceId
    );
    state.currentSessionDbId = sessionDbId;
    state.sessionId = serverSessionId || String(sessionDbId);
    localStorage.setItem("vitappio.sessionId", state.sessionId);
    setStatus("ok", "Сессия создана: " + state.sessionId);
    toast("Сессия создана");
    btn.classList.remove("ld");
    btn.disabled = false;
    setTimeout(() => goTo("wizard"), 400);
  };

  if (useMedom) {
    const rawVal = deviceSelect.value;
    const deviceId = parseInt(rawVal, 10);
    console.log("Creating MEDOM session: raw deviceSelect.value =", rawVal, "parsed deviceId =", deviceId);
    if (!deviceId || isNaN(deviceId)) {
      setStatus("err", "Некорректный ID устройства: " + rawVal);
      btn.classList.remove("ld");
      btn.disabled = false;
      return;
    }
    state.medomDeviceId = String(deviceId);
    localStorage.setItem("vitappio.medomDeviceId", state.medomDeviceId);

    const patientIdNum = parseInt(state.medomPatientId || state.patientId, 10);
    console.log("MEDOM session params: patient_id =", patientIdNum, "device_id =", deviceId);

    createSessionMedom({
      patient_id: patientIdNum,
      device_id: deviceId,
    })
      .then((response) => {
        finishSession(String(response.session_id), "", String(deviceId));
      })
      .catch((err) => {
        setStatus("err", "Ошибка MEDOM: " + getErrorText(err));
        btn.classList.remove("ld");
        btn.disabled = false;
      });
  } else if (!DEMO_MODE) {
    state.serial = serial.value.trim().toUpperCase();
    localStorage.setItem("vitappio.deviceSerial", state.serial);

    createSessionApi({
      patient_id: state.patientId,
      device_serial: state.serial,
    })
      .then((response) => {
        finishSession(
          String(response.session_id || response.id || ""),
          state.serial,
          ""
        );
      })
      .catch((err) => {
        setStatus("err", "Ошибка создания сессии: " + getErrorText(err));
        btn.classList.remove("ld");
        btn.disabled = false;
      });
  } else {
    state.serial = serial.value.trim().toUpperCase() || "DEMO";
    finishSession("demo-s-" + Date.now(), state.serial, "");
  }
}

// ── Check flow ───────────────────────────────────────────────

function resetCheckUI() {
  stopAllChecks();
  const td = document.getElementById("timerDisplay");
  if (td) { td.textContent = "01:40"; td.className = "tmr"; }
  ["ciSignal", "ciLink", "ciPower"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.className = "ci pd";
  });
  const detail = document.getElementById("checkDetail");
  if (detail) detail.textContent = "";
}

function startCheckFlow() {
  if (state.timerInterval) return;
  setStatus("info", "Проверка готовности...");
  state.checkSec = 100;

  state.timerInterval = setInterval(() => {
    state.checkSec -= 1;
    if (state.checkSec < 0) {
      stopAllChecks();
      setStatus("err", "Время проверки истекло");
      goTo("fail");
      return;
    }
    const m = String(Math.floor(state.checkSec / 60)).padStart(2, "0");
    const s = String(state.checkSec % 60).padStart(2, "0");
    const td = document.getElementById("timerDisplay");
    if (td) {
      td.textContent = m + ":" + s;
      td.className = "tmr" + (state.checkSec <= 20 ? " td" : state.checkSec <= 40 ? " tw" : "");
    }
  }, 1000);

  const poll = async () => {
    if (!state.sessionId) {
      const d = document.getElementById("checkDetail");
      if (d) d.textContent = "Сессия не найдена";
      return;
    }
    try {
      const status = await getSessionStatus(state.sessionId);
      const signalOk = Boolean(status.signal_ok ?? status.signal);
      const batteryOk = Boolean(status.battery_ok ?? status.battery);
      const linkOk = Boolean(status.link_ok ?? status.connected);
      const allReady = Boolean(status.ready) || (signalOk && batteryOk && linkOk);

      setCheckClass("ciSignal", signalOk ? "ok" : "pd");
      setCheckClass("ciLink", linkOk ? "ok" : "pd");
      setCheckClass("ciPower", batteryOk ? "ok" : "pd");

      const detail = document.getElementById("checkDetail");
      if (detail) {
        detail.textContent =
          "Сигнал: " + (signalOk ? "OK" : "…") +
          " · Связь: " + (linkOk ? "OK" : "…") +
          " · Заряд: " + (batteryOk ? "OK" : "…");
      }

      if (allReady) {
        stopAllChecks();
        setStatus("ok", "Все проверки пройдены");
        toast("Проверка пройдена");
        setTimeout(() => goTo("success"), 500);
      }
    } catch (err) {
      const detail = document.getElementById("checkDetail");
      if (detail) detail.textContent = "Ошибка: " + getErrorText(err);
    }
  };

  poll();
  state.checkPollInterval = setInterval(poll, 5000);
}

function setCheckClass(id, stateName) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = "ci " + (stateName === "ok" ? "ok" : stateName === "fl" ? "fl" : "pd");
}

function simulateCheck(success) {
  stopAllChecks();
  if (success) {
    ["ciSignal", "ciLink", "ciPower"].forEach((id) => setCheckClass(id, "ok"));
    setStatus("ok", "Все проверки пройдены (симуляция)");
    toast("Проверка пройдена");
    setTimeout(() => goTo("success"), 400);
  } else {
    setCheckClass("ciSignal", "fl");
    setCheckClass("ciLink", "fl");
    setStatus("err", "Ошибка проверки (симуляция)");
    setTimeout(() => goTo("fail"), 400);
  }
}

function stopAllChecks() {
  if (state.timerInterval) { clearInterval(state.timerInterval); state.timerInterval = null; }
  if (state.checkPollInterval) { clearInterval(state.checkPollInterval); state.checkPollInterval = null; }
}

// ── Diary ────────────────────────────────────────────────────

function addDiaryEntry(type) {
  const now = new Date();
  const time = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
  state.diary.unshift({ type, time });
  renderDiary();

  const timestamp = now.toISOString();

  if (state.currentSessionDbId) {
    dbAddDiaryEvent(state.currentSessionDbId, type, timestamp);
  }

  if (isMedomConfigured() && state.sessionId) {
    addEventMedom({
      session_id: parseInt(state.sessionId, 10),
      text: type,
      start: timestamp,
      severity: "Low",
    })
      .then(() => {
        setStatus("ok", type + " записан в дневник");
        toast(type + " — записано");
      })
      .catch(() => {
        queueDiaryEvent({ session_id: state.sessionId, event_type: type, timestamp });
        setStatus("warn", "Ошибка отправки, событие в очереди");
        toast(type + " — в очереди");
      });
  } else if (!DEMO_MODE) {
    pushDiaryEvent({ session_id: state.sessionId, event_type: type, timestamp })
      .then(() => {
        if (!navigator.onLine) {
          setStatus("warn", "Событие сохранено в очередь (офлайн)");
        } else {
          setStatus("ok", type + " записан в дневник");
        }
        toast(type + " — записано");
      })
      .catch(() => {
        queueDiaryEvent({ session_id: state.sessionId, event_type: type, timestamp });
        setStatus("warn", "Нет сети: событие в очереди");
        toast(type + " — в очереди");
      });
  } else {
    setStatus("ok", type + " записан в дневник");
    toast(type + " — записано");
  }
}

function renderDiary() {
  const el = document.getElementById("diaryEntries");
  if (!el) return;
  if (state.diary.length === 0) {
    el.innerHTML = '<div class="de-emp">Записей пока нет. Отметьте событие выше.</div>';
    refreshIcons();
    return;
  }
  el.innerHTML = state.diary
    .map(
      (e) =>
        '<div class="de"><span class="de-t">' + e.time + '</span><span class="de-n">' + e.type + "</span></div>"
    )
    .join("");
  refreshIcons();
}

// ── Finish session ───────────────────────────────────────────

async function finishSessionFlow() {
  if (!state.sessionId) {
    setStatus("err", "Нет активной сессии");
    return;
  }
  const reason = document.getElementById("fReason");
  const btn = document.getElementById("btnFinish");
  btn.classList.add("ld");
  btn.disabled = true;
  setStatus("info", "Завершение сессии...");

  try {
    if (isMedomConfigured()) {
      await finishSessionMedom(parseInt(state.sessionId, 10));
    } else if (!DEMO_MODE) {
      await finishSessionApi(state.sessionId, reason ? reason.value.trim() : "");
    }

    if (state.currentSessionDbId) {
      dbFinishSession(state.currentSessionDbId, reason ? reason.value.trim() : "");
    }

    state.awaitingConclusionPatientId = state.patientId;
    localStorage.setItem("vitappio.awaitingConclusionPatientId", state.awaitingConclusionPatientId);
    state.sessionId = "";
    state.currentSessionDbId = null;
    localStorage.removeItem("vitappio.sessionId");
    if (reason) reason.value = "";
    setStatus("ok", "Мониторинг завершён. Ожидание заключения врача.");
    toast("Сессия завершена");
    setTimeout(() => goTo("done"), 400);
  } catch (err) {
    setStatus("err", "Ошибка завершения: " + getErrorText(err));
  } finally {
    btn.classList.remove("ld");
    btn.disabled = false;
  }
}

// ── Conclusion ───────────────────────────────────────────────

async function renderConclusionScreen(manualCheck) {
  const wait = document.getElementById("conclusionWaiting");
  const frameWrap = document.getElementById("conclusionFrameWrap");
  const frame = document.getElementById("conclusionFrame");
  const meta = document.getElementById("conclusionMeta");
  const patientLine = document.getElementById("conclusionPatient");
  const patientId = state.awaitingConclusionPatientId || state.patientId;

  if (patientLine) {
    patientLine.textContent = patientId ? "Пациент: " + patientId : "Пациент не выбран";
  }
  if (!patientId || !wait || !frameWrap || !frame) return;

  wait.style.display = "block";
  frameWrap.style.display = "none";
  if (meta) meta.textContent = "";
  if (manualCheck) setStatus("info", "Проверяем наличие заключения...");

  try {
    const result = await getPatientConclusion(patientId);
    if (result.ready && result.conclusion && result.conclusion.html_content) {
      frame.srcdoc = result.conclusion.html_content;
      frameWrap.style.display = "block";
      wait.style.display = "none";
      if (meta) {
        const doctor = result.conclusion.doctor_name ? "Врач: " + result.conclusion.doctor_name + " · " : "";
        meta.textContent = doctor + "Загружено: " + new Date(result.conclusion.uploaded_at).toLocaleString();
      }

      if (state.currentPatientDbId) {
        const sessions = dbGetCompletedSessions(state.currentPatientDbId);
        if (sessions.length > 0) {
          dbSaveReport(
            sessions[0].id,
            state.currentPatientDbId,
            result.conclusion.html_content,
            result.conclusion.doctor_name || ""
          );
        }
      }

      setStatus("ok", "Заключение доступно");
      return;
    }
    setStatus("info", "Заключение пока не загружено");
  } catch (err) {
    setStatus("warn", "Не удалось получить заключение: " + getErrorText(err));
  }
}

function resetToHome() {
  state.awaitingConclusionPatientId = "";
  localStorage.removeItem("vitappio.awaitingConclusionPatientId");

  if (state.currentPatientDbId) {
    goTo("dashboard");
  } else {
    goTo("auth");
  }
}

// ── Settings ─────────────────────────────────────────────────

function loadSettingsScreen() {
  const creds = loadMedomCreds();
  const loginEl = document.getElementById("fMedomLogin");
  const passEl = document.getElementById("fMedomPass");
  const urlEl = document.getElementById("fBackendUrl");
  if (creds && loginEl) loginEl.value = creds.login;
  if (creds && passEl) passEl.value = creds.password;
  if (urlEl) urlEl.value = API_BASE_URL || "";
}

async function connectMedom() {
  const loginEl = document.getElementById("fMedomLogin");
  const passEl = document.getElementById("fMedomPass");
  const urlEl = document.getElementById("fBackendUrl");
  const statusBox = document.getElementById("medomStatus");
  const statusText = document.getElementById("medomStatusText");
  const btn = document.getElementById("btnMedomSave");
  if (!loginEl || !passEl || !urlEl) return;

  const backendUrl = coerceBackendUrlForPage(urlEl.value);
  if (urlEl.value.trim().replace(/\/+$/, "") !== backendUrl) {
    urlEl.value = backendUrl;
  }
  const login = loginEl.value.trim();
  const password = passEl.value.trim();

  if (!backendUrl) { setStatus("err", "Введите URL Backend API"); return; }
  if (!login || !password) { setStatus("err", "Введите логин и пароль"); return; }

  API_BASE_URL = backendUrl;
  DEMO_MODE = false;
  localStorage.setItem("vitappio.apiBaseUrl", backendUrl);

  btn.classList.add("ld");
  btn.disabled = true;
  if (statusBox) statusBox.style.display = "none";

  try {
    const result = await saveMedomCredsToBackend(login, password);
    medomCredsSynced = true;
    saveMedomCreds(login, password);

    if (statusBox) statusBox.style.display = "block";
    if (result.is_auth) {
      if (statusText) statusText.textContent = "Подключено. Пользователь: " + (result.user || login);
      statusBox.style.background = "var(--ok-bg)";
      statusBox.style.borderColor = "#86efac";
      setStatus("ok", "MEDOM подключён");
      toast("Подключение к MEDOM успешно");
    } else {
      if (statusText) statusText.textContent = "Авторизация не прошла. Проверьте логин и пароль.";
      statusBox.style.background = "var(--err-bg)";
      statusBox.style.borderColor = "#fca5a5";
      setStatus("err", "Ошибка авторизации MEDOM");
    }
  } catch (err) {
    if (statusBox) {
      statusBox.style.display = "block";
      statusBox.style.background = "var(--err-bg)";
      statusBox.style.borderColor = "#fca5a5";
    }
    if (statusText) statusText.textContent = "Ошибка: " + getErrorText(err);
    setStatus("err", "Не удалось подключиться к MEDOM");
  } finally {
    btn.classList.remove("ld");
    btn.disabled = false;
  }
}

// ── API layer ────────────────────────────────────────────────

async function apiRequest(path, options) {
  try {
    const h = window.location.hostname;
    if (isLocalDevHostname(h) && isMedomPublicHost(API_BASE_URL)) {
      API_BASE_URL = inferDefaultApiBase();
      localStorage.setItem("vitappio.apiBaseUrl", API_BASE_URL);
    }
  } catch (_) {}

  const method = options.method || "GET";
  const headers = { "Content-Type": "application/json" };
  let response;
  try {
    response = await fetch(joinApiUrl(API_BASE_URL, path), {
      method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch (e) {
    throw new Error(e && e.message ? e.message : "Failed to fetch");
  }
  if (!response.ok) {
    let detail = "";
    try {
      const ct = response.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        const errBody = await response.json();
        detail = errBody.detail || "";
      }
    } catch (_) {}
    throw new Error(detail || "HTTP " + response.status);
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return {};
  return response.json();
}

async function createPatient(payload) {
  if (DEMO_MODE) return { patient_id: "demo-p-" + Date.now() };
  return apiRequest("/patients", { method: "POST", body: payload });
}

async function createSessionApi(payload) {
  if (DEMO_MODE) return { session_id: "demo-s-" + Date.now() };
  return apiRequest("/sessions", { method: "POST", body: payload });
}

async function getSessionStatus(sessionId) {
  if (DEMO_MODE) {
    const progress = 100 - state.checkSec;
    return {
      signal_ok: progress > 25,
      link_ok: progress > 35,
      battery_ok: progress > 45,
      ready: progress > 55,
    };
  }
  return apiRequest("/sessions/" + encodeURIComponent(sessionId) + "/status", { method: "GET" });
}

async function pushDiaryEvent(payload) {
  if (!payload.session_id || DEMO_MODE) return { ok: true };
  return apiRequest("/sessions/" + encodeURIComponent(payload.session_id) + "/events", {
    method: "POST",
    body: payload,
  });
}

async function finishSessionApi(sessionId, reason) {
  if (DEMO_MODE) return { ok: true };
  return apiRequest("/sessions/" + encodeURIComponent(sessionId) + "/finish", {
    method: "POST",
    body: { reason: reason || null },
  });
}

async function getPatientConclusion(patientId) {
  if (!patientId) return { ready: false };
  if (DEMO_MODE) return { ready: false };
  return apiRequest("/patients/" + encodeURIComponent(patientId) + "/conclusion", { method: "GET" });
}

function queueDiaryEvent(payload) {
  const key = "vitappio.diaryQueue";
  const queue = JSON.parse(localStorage.getItem(key) || "[]");
  queue.push(payload);
  localStorage.setItem(key, JSON.stringify(queue));
}

async function flushDiaryQueue() {
  const key = "vitappio.diaryQueue";
  const queue = JSON.parse(localStorage.getItem(key) || "[]");
  if (!queue.length || DEMO_MODE) return;
  const rest = [];
  for (const event of queue) {
    try { await pushDiaryEvent(event); }
    catch { rest.push(event); }
  }
  localStorage.setItem(key, JSON.stringify(rest));
}

// ── MEDOM API ────────────────────────────────────────────────

async function syncMedomCredentials() {
  const creds = loadMedomCreds();
  if (!creds) throw new Error("Настройте подключение к MEDOM в разделе «Настройки».");
  await saveMedomCredsToBackend(creds.login, creds.password);
  medomCredsSynced = true;
}

async function ensureMedomCredentialsOnBackend() {
  if (DEMO_MODE) return;
  if (medomCredsSynced) return;
  await syncMedomCredentials();
}

async function medomRequest(fn) {
  await ensureMedomCredentialsOnBackend();
  try {
    return await fn();
  } catch (err) {
    if (err && /credentials not configured/i.test(err.message) && loadMedomCreds()) {
      medomCredsSynced = false;
      await syncMedomCredentials();
      return await fn();
    }
    throw err;
  }
}

async function createPatientMedom(payload) {
  return medomRequest(() => apiRequest("/medom/patients", { method: "POST", body: payload }));
}
async function createSessionMedom(payload) {
  return medomRequest(() => apiRequest("/medom/sessions", { method: "POST", body: payload }));
}
async function finishSessionMedom(sessionId) {
  return medomRequest(() => apiRequest("/medom/sessions/" + sessionId + "/finish", { method: "POST", body: {} }));
}
async function addEventMedom(payload) {
  return medomRequest(() => apiRequest("/medom/sessions/" + payload.session_id + "/events", { method: "POST", body: payload }));
}
async function getMedomDevices() {
  return medomRequest(() => apiRequest("/medom/devices", { method: "GET" }));
}
async function saveMedomCredsToBackend(login, password) {
  return apiRequest("/medom/credentials", { method: "POST", body: { login, password } });
}
async function pingMedom() {
  return apiRequest("/medom/ping", { method: "GET" });
}

function extractDeviceId(d) {
  return d.Id ?? d.DeviceId ?? d.id ?? d.device_id ?? null;
}

function extractDeviceSerial(d) {
  return d.SerialNumber ?? d.serial_number ?? d.DeviceMacNumber ?? d.device_mac_number ?? extractDeviceId(d);
}

function extractDeviceStatus(d) {
  return d.StatusId ?? d.status_id ?? d.Status ?? d.status ?? null;
}

function loadMedomDevices() {
  const group = document.getElementById("fDeviceGroup");
  const select = document.getElementById("fDevice");
  if (!isMedomConfigured() || !group || !select) return;
  group.style.display = "block";
  select.innerHTML = '<option value="">Загрузка…</option>';

  getMedomDevices()
    .then((devices) => {
      console.log("MEDOM devices response:", JSON.stringify(devices, null, 2));
      select.innerHTML = '<option value="">Выберите устройство</option>';
      if (!devices || !devices.length) {
        select.innerHTML = '<option value="">Нет доступных устройств</option>';
        return;
      }
      const statusId = (d) => extractDeviceStatus(d);
      const free = devices.filter((d) => statusId(d) === 1);
      (free.length ? free : devices).forEach((d) => {
        const id = extractDeviceId(d);
        if (id == null) {
          console.warn("Device without ID:", d);
          return;
        }
        const opt = document.createElement("option");
        opt.value = id;
        const serial = extractDeviceSerial(d);
        const st = statusId(d);
        const statusLabel = st === 1 ? "свободен" : st === 2 ? "занят" : "неисправен";
        opt.textContent = "S/N: " + serial + " (" + statusLabel + ")";
        select.appendChild(opt);
      });
    })
    .catch((err) => {
      console.error("Failed to load devices:", err);
      select.innerHTML = '<option value="">Ошибка загрузки</option>';
    });
}

// ── Initialization ───────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  await loadConfig();

  API_BASE_URL = normalizeApiBaseForOrigin(_storedApiBase);

  try {
    await initDatabase();
  } catch (err) {
    console.error("SQLite init failed", err);
    toast("Ошибка инициализации базы данных");
  }

  if (DEMO_MODE) {
    setStatus("warn", "Демо-режим");
  } else {
    setStatus("ok", "API: " + API_BASE_URL.replace(/^https?:\/\//, ""));
  }
  updateNet();

  // Auth / Login
  document.getElementById("btnGoLogin").addEventListener("click", () => goTo("login"));
  document.getElementById("btnGoRegister").addEventListener("click", () => goTo("patient"));
  document.getElementById("bkLogin").addEventListener("click", () => goTo("auth"));
  document.getElementById("btnLogin").addEventListener("click", loginPatient);

  // Credentials (after registration)
  document.getElementById("btnCredsNext").addEventListener("click", () => goTo("dashboard"));
  document.getElementById("btnCopyCreds").addEventListener("click", () => {
    const login = document.getElementById("credLogin")?.textContent || "";
    const pass = document.getElementById("credPassword")?.textContent || "";
    const text = "Логин: " + login + "\nПароль: " + pass;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => toast("Данные скопированы")).catch(() => toast("Не удалось скопировать"));
    } else {
      toast("Скопируйте данные вручную");
    }
  });

  // Dashboard
  document.getElementById("btnGoDiary").addEventListener("click", () => goTo("diary"));
  document.getElementById("btnNewSession").addEventListener("click", () => goTo("intro"));
  document.getElementById("btnLogout").addEventListener("click", logoutPatient);

  // Intro / Kit / Patient
  const bkIntro = document.getElementById("bkIntro");
  if (bkIntro) bkIntro.addEventListener("click", () => goTo("dashboard"));
  document.getElementById("btnStart").addEventListener("click", () => goTo("kit1"));
  document.getElementById("bkKit1").addEventListener("click", () => goTo("intro"));
  document.getElementById("btnKit1Next").addEventListener("click", () => goTo("kit2"));
  document.getElementById("bkKit2").addEventListener("click", () => goTo("kit1"));
  document.getElementById("btnKit2Next").addEventListener("click", () => goTo("device"));
  document.getElementById("bkPatient").addEventListener("click", () => goTo("auth"));
  document.getElementById("bkDevice").addEventListener("click", () => goTo("kit2"));
  document.getElementById("bkWizard").addEventListener("click", () => goTo("device"));
  document.getElementById("btnReg").addEventListener("click", registerPatient);
  document.getElementById("btnSession").addEventListener("click", createSessionFlow);

  // Wizard / Check
  document.getElementById("btnWzBack").addEventListener("click", wzBack);
  document.getElementById("btnWzNext").addEventListener("click", wzNext);
  document.getElementById("btnRetryCheck").addEventListener("click", () => goTo("check"));
  document.getElementById("btnSimOk").addEventListener("click", () => simulateCheck(true));
  document.getElementById("btnSimFail").addEventListener("click", () => simulateCheck(false));

  // Diary / Finish
  document.getElementById("btnOpenDiary").addEventListener("click", () => goTo("diary"));
  document.getElementById("btnToFinish").addEventListener("click", () => goTo("finish"));
  document.getElementById("bkFinish").addEventListener("click", () => goTo("diary"));
  document.getElementById("btnCancelFinish").addEventListener("click", () => goTo("diary"));
  document.getElementById("btnFinish").addEventListener("click", finishSessionFlow);

  // Conclusion / Reset
  document.getElementById("btnCheckConclusion").addEventListener("click", () => renderConclusionScreen(true));
  document.getElementById("btnReset").addEventListener("click", resetToHome);

  // Settings
  document.getElementById("btnSettings").addEventListener("click", () => goTo("settings"));
  document.getElementById("bkSettings").addEventListener("click", () => goTo(state.prevScreen || "auth"));
  document.getElementById("btnMedomSave").addEventListener("click", connectMedom);

  // Debug
  document.getElementById("dbgToggle").addEventListener("click", function () {
    document.getElementById("dbgPanel").classList.toggle("op");
  });

  // Prep checklist
  document.getElementById("prepCheck").addEventListener("click", (e) => {
    const item = e.target.closest(".ck-i");
    if (!item) return;
    item.classList.toggle("dn");
    refreshIcons();
  });

  // Diary buttons
  document.querySelectorAll("#diaryGrid .dg-b").forEach((btn) => {
    btn.addEventListener("click", () => {
      const type = btn.getAttribute("data-diary");
      if (type) addDiaryEntry(type);
    });
  });

  // Online/offline
  window.addEventListener("online", () => {
    updateNet();
    setStatus("ok", "Подключение восстановлено");
    flushDiaryQueue();
  });
  window.addEventListener("offline", () => {
    updateNet();
    setStatus("warn", "Нет подключения к сети");
  });

  // Restore session from localStorage (auto-login)
  const savedPatientDbId = localStorage.getItem("vitappio.currentPatientDbId");
  if (savedPatientDbId && db) {
    const patient = dbGetPatientById(parseInt(savedPatientDbId, 10));
    if (patient) {
      activatePatient(patient);
      goTo("dashboard");
    }
  }

  refreshIcons();
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("./sw.js");
    } catch (error) {
      console.error("Service worker registration failed", error);
    }
  });
}
