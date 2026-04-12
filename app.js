const API_BASE_URL = localStorage.getItem("vitappio.apiBaseUrl") || "";
const DEMO_MODE = !API_BASE_URL;

const screenMap = {
  intro: "scr-intro",
  patient: "scr-patient",
  device: "scr-device",
  wizard: "scr-wizard",
  check: "scr-check",
  success: "scr-success",
  fail: "scr-fail",
  diary: "scr-diary",
  finish: "scr-finish",
  done: "scr-finish-done",
};

const WZ_STEPS = [
  { title: "Подключение Wi-Fi модема" },
  {
    title: "Подготовка кожи",
    text: "Протрите область крепления электродов салфеткой. Убедитесь, что кожа сухая и чистая. Область расположена на передней поверхности грудной клетки.",
  },
  {
    title: "Установка электродов",
    text: "Снимите защитную плёнку с каждого электрода и плотно прижмите к коже в обозначенных точках. Убедитесь, что электроды не отклеиваются.",
  },
  {
    title: "Подключение прибора",
    text: "Присоедините кабель холтера к электродам — каждый разъём к своему электроду. Прибор должен располагаться в удобном положении, не мешать движениям.",
  },
  {
    title: "Закрепление модема",
    text: "Подключите модем к прибору через кабель. Зафиксируйте оба устройства на теле с помощью клипсы или кармана. Убедитесь, что кабели не натянуты.",
  },
];

const state = {
  patientId: localStorage.getItem("vitappio.patientId") || "",
  sessionId: localStorage.getItem("vitappio.sessionId") || "",
  serial: localStorage.getItem("vitappio.deviceSerial") || "",
  wzStep: 1,
  modemOk: false,
  diary: [],
  checkSec: 100,
  timerInterval: null,
  checkPollInterval: null,
  modemBootInProgress: false,
};

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

  document.querySelectorAll(".scr").forEach((s) => s.classList.remove("on"));
  const id = screenMap[name];
  const el = id ? document.getElementById(id) : null;
  if (el) {
    el.classList.add("on");
  }
  window.scrollTo({ top: 0, behavior: "smooth" });

  if (name === "wizard") {
    state.wzStep = 1;
    state.modemOk = false;
    state.modemBootInProgress = false;
    resetModemLedUi();
    renderWizard();
  }

  if (name === "diary") {
    renderDiary();
  }

  if (name === "check") {
    startCheckFlow();
  }

  refreshIcons();
}

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
  const prog = document.getElementById("wzProgress");
  if (prog) {
    prog.innerHTML = "";
    for (let i = 1; i <= 5; i += 1) {
      const d = document.createElement("div");
      d.className = "wz-d" + (i < step ? " dn" : i === step ? " act" : "");
      prog.appendChild(d);
    }
  }

  const counter = document.getElementById("wzCounter");
  if (counter) counter.textContent = "Шаг " + step + " из 5";

  const modemBlock = document.getElementById("wzModemBlock");
  const textBlock = document.getElementById("wzTextBlock");

  if (step === 1) {
    if (modemBlock) modemBlock.style.display = "block";
    if (textBlock) textBlock.style.display = "none";
    renderModemButtons();
  } else {
    if (modemBlock) modemBlock.style.display = "none";
    if (textBlock) textBlock.style.display = "block";
    const data = WZ_STEPS[step - 1];
    const content = document.getElementById("wzTextContent");
    if (content && data) {
      content.innerHTML =
        "<h3>" +
        data.title +
        '</h3><p style="font-size:15px;color:var(--fg2);line-height:1.6;margin-top:8px">' +
        (data.text || "") +
        "</p>";
    }
  }

  const btnBack = document.getElementById("btnWzBack");
  if (btnBack) btnBack.style.display = step === 1 ? "none" : "";

  const nextBtn = document.getElementById("btnWzNext");
  const bt = nextBtn ? nextBtn.querySelector(".bt") : null;
  if (nextBtn && bt) {
    if (step === 1) {
      if (state.modemOk) {
        nextBtn.disabled = false;
        bt.textContent = "Далее";
      } else {
        nextBtn.disabled = true;
        bt.textContent = "Далее";
      }
    } else if (step === 5) {
      nextBtn.disabled = false;
      bt.textContent = "Перейти к проверке";
    } else {
      nextBtn.disabled = false;
      bt.textContent = "Далее";
    }
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
  if (btn) {
    btn.classList.add("ld");
    btn.disabled = true;
  }

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

  setTimeout(() => {
    if (led1) led1.setAttribute("fill", "#EAB308");
  }, 800);
  setTimeout(() => {
    if (led1) led1.setAttribute("fill", "#16A34A");
  }, 2000);
  setTimeout(() => {
    if (led2) led2.setAttribute("fill", "#EAB308");
  }, 2200);
  setTimeout(() => {
    if (led2) led2.setAttribute("fill", "#16A34A");
  }, 3500);

  setTimeout(() => {
    if (step2Icon) {
      step2Icon.className = "mdm-si dn";
      step2Icon.innerHTML = '<i data-lucide="check" style="width:12px;height:12px"></i>';
    }
    if (step2Text) step2Text.textContent = "Индикаторы активны";
    state.modemOk = true;
    state.modemBootInProgress = false;
    if (btn) {
      btn.classList.remove("ld");
      btn.disabled = false;
    }
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
  if (state.wzStep > 1) {
    state.wzStep -= 1;
    renderWizard();
  }
}

function wzNext() {
  if (state.wzStep === 1 && !state.modemOk) return;
  if (state.wzStep < 5) {
    state.wzStep += 1;
    renderWizard();
  } else {
    goTo("check");
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

  const btn = document.getElementById("btnReg");
  btn.classList.add("ld");
  btn.disabled = true;
  setStatus("info", "Регистрация пациента...");

  const payload = {
    full_name: name.value.trim(),
    birth_date: dob.value,
    gender: sex.value,
  };

  createPatient(payload)
    .then((response) => {
      state.patientId = String(response.patient_id || response.id || "");
      localStorage.setItem("vitappio.patientId", state.patientId);
      setStatus("ok", "Пациент зарегистрирован: " + state.patientId);
      toast("Пациент зарегистрирован");
      setTimeout(() => goTo("device"), 400);
    })
    .catch((err) => {
      setStatus("err", "Ошибка регистрации: " + getErrorText(err));
    })
    .finally(() => {
      btn.classList.remove("ld");
      btn.disabled = false;
    });
}

function createSessionFlow() {
  const serial = document.getElementById("fSerial");
  serial.classList.remove("er");
  document.getElementById("fSerialErr").classList.remove("vis");

  if (!state.patientId) {
    setStatus("err", "Сначала зарегистрируйте пациента");
    goTo("patient");
    return;
  }
  if (!serial.value.trim()) {
    serial.classList.add("er");
    document.getElementById("fSerialErr").classList.add("vis");
    setStatus("err", "Укажите серийный номер");
    return;
  }

  const btn = document.getElementById("btnSession");
  btn.classList.add("ld");
  btn.disabled = true;
  setStatus("info", "Создание сессии...");

  state.serial = serial.value.trim().toUpperCase();
  localStorage.setItem("vitappio.deviceSerial", state.serial);

  createSessionApi({
    patient_id: state.patientId,
    device_serial: state.serial,
  })
    .then((response) => {
      state.sessionId = String(response.session_id || response.id || "");
      localStorage.setItem("vitappio.sessionId", state.sessionId);
      setStatus("ok", "Сессия создана: " + state.sessionId);
      toast("Сессия создана");
      setTimeout(() => goTo("wizard"), 400);
    })
    .catch((err) => {
      setStatus("err", "Ошибка создания сессии: " + getErrorText(err));
    })
    .finally(() => {
      btn.classList.remove("ld");
      btn.disabled = false;
    });
}

function resetCheckUI() {
  stopAllChecks();
  const td = document.getElementById("timerDisplay");
  if (td) {
    td.textContent = "01:40";
    td.className = "tmr";
  }
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
      td.className =
        "tmr" + (state.checkSec <= 20 ? " td" : state.checkSec <= 40 ? " tw" : "");
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
          "Сигнал: " +
          (signalOk ? "OK" : "…") +
          " · Связь: " +
          (linkOk ? "OK" : "…") +
          " · Заряд: " +
          (batteryOk ? "OK" : "…");
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
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
  if (state.checkPollInterval) {
    clearInterval(state.checkPollInterval);
    state.checkPollInterval = null;
  }
}

function addDiaryEntry(type) {
  const now = new Date();
  const time =
    String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
  state.diary.unshift({ type, time });
  renderDiary();

  const timestamp = now.toISOString();
  pushDiaryEvent({
    session_id: state.sessionId,
    event_type: type,
    timestamp,
  })
    .then(() => {
      if (!navigator.onLine) {
        setStatus("warn", "Событие сохранено в очередь (офлайн)");
      } else {
        setStatus("ok", type + " записан в дневник");
      }
      toast(type + " — записано");
    })
    .catch(() => {
      queueDiaryEvent({
        session_id: state.sessionId,
        event_type: type,
        timestamp,
      });
      setStatus("warn", "Нет сети: событие в очереди");
      toast(type + " — в очереди");
    });
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

function finishSessionFlow() {
  if (!state.sessionId) {
    setStatus("err", "Нет активной сессии");
    return;
  }
  const reason = document.getElementById("fReason");
  const btn = document.getElementById("btnFinish");
  btn.classList.add("ld");
  btn.disabled = true;
  setStatus("info", "Завершение сессии...");

  finishSessionApi(state.sessionId, reason ? reason.value.trim() : "")
    .then(() => {
      state.sessionId = "";
      localStorage.removeItem("vitappio.sessionId");
      if (reason) reason.value = "";
      setStatus("ok", "Сессия завершена");
      toast("Мониторинг завершён");
      setTimeout(() => goTo("done"), 400);
    })
    .catch((err) => {
      setStatus("err", "Ошибка завершения: " + getErrorText(err));
    })
    .finally(() => {
      btn.classList.remove("ld");
      btn.disabled = false;
    });
}

function resetApp() {
  state.patientId = "";
  state.sessionId = "";
  state.serial = "";
  state.wzStep = 1;
  state.modemOk = false;
  state.diary = [];
  state.checkSec = 100;
  stopAllChecks();

  localStorage.removeItem("vitappio.patientId");
  localStorage.removeItem("vitappio.sessionId");
  localStorage.removeItem("vitappio.deviceSerial");

  const ids = ["fName", "fDob", "fSerial", "fReason"];
  ids.forEach((id) => {
    const n = document.getElementById(id);
    if (n) n.value = "";
  });
  const sex = document.getElementById("fSex");
  if (sex) sex.value = "";

  document.querySelectorAll(".fi,.fs").forEach((f) => f.classList.remove("er"));
  document.querySelectorAll(".fe").forEach((e) => e.classList.remove("vis"));

  document.querySelectorAll("#prepCheck .ck-i").forEach((i) => i.classList.remove("dn"));
  resetModemLedUi();
  renderDiary();

  if (DEMO_MODE) {
    setStatus("warn", "Демо-режим: API не задан");
  } else {
    setStatus("ok", "API подключен");
  }
  goTo("intro");
}

function getErrorText(error) {
  return error && error.message ? error.message : "неизвестная ошибка";
}

async function createPatient(payload) {
  if (DEMO_MODE) {
    return { patient_id: "demo-p-" + Date.now() };
  }
  return apiRequest("/patients", { method: "POST", body: payload });
}

async function createSessionApi(payload) {
  if (DEMO_MODE) {
    return { session_id: "demo-s-" + Date.now() };
  }
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
  if (!payload.session_id || DEMO_MODE) {
    return { ok: true };
  }
  return apiRequest("/sessions/" + encodeURIComponent(payload.session_id) + "/events", {
    method: "POST",
    body: payload,
  });
}

async function finishSessionApi(sessionId, reason) {
  if (DEMO_MODE) {
    return { ok: true };
  }
  return apiRequest("/sessions/" + encodeURIComponent(sessionId) + "/finish", {
    method: "POST",
    body: { reason: reason || null },
  });
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
    try {
      await pushDiaryEvent(event);
    } catch {
      rest.push(event);
    }
  }
  localStorage.setItem(key, JSON.stringify(rest));
}

async function apiRequest(path, options) {
  const method = options.method || "GET";
  const headers = { "Content-Type": "application/json" };
  const response = await fetch(API_BASE_URL + path, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!response.ok) {
    throw new Error("HTTP " + response.status);
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return {};
  }
  return response.json();
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("fSerial").value = state.serial || "";

  if (DEMO_MODE) {
    setStatus("warn", "Демо-режим: API не задан");
  } else {
    setStatus("ok", "API: " + API_BASE_URL.replace(/^https?:\/\//, ""));
  }
  updateNet();

  document.getElementById("btnStart").addEventListener("click", () => goTo("patient"));
  document.getElementById("bkPatient").addEventListener("click", () => goTo("intro"));
  document.getElementById("bkDevice").addEventListener("click", () => goTo("patient"));
  document.getElementById("bkWizard").addEventListener("click", () => goTo("device"));
  document.getElementById("btnReg").addEventListener("click", registerPatient);
  document.getElementById("btnSession").addEventListener("click", createSessionFlow);
  document.getElementById("btnCheckModem").addEventListener("click", checkModem);
  document.getElementById("btnSkipModem").addEventListener("click", skipModem);
  document.getElementById("btnWzBack").addEventListener("click", wzBack);
  document.getElementById("btnWzNext").addEventListener("click", wzNext);
  document.getElementById("btnOpenDiary").addEventListener("click", () => goTo("diary"));
  document.getElementById("btnRetryCheck").addEventListener("click", () => goTo("check"));
  document.getElementById("btnToFinish").addEventListener("click", () => goTo("finish"));
  document.getElementById("bkFinish").addEventListener("click", () => goTo("diary"));
  document.getElementById("btnCancelFinish").addEventListener("click", () => goTo("diary"));
  document.getElementById("btnFinish").addEventListener("click", finishSessionFlow);
  document.getElementById("btnReset").addEventListener("click", resetApp);
  document.getElementById("btnSimOk").addEventListener("click", () => simulateCheck(true));
  document.getElementById("btnSimFail").addEventListener("click", () => simulateCheck(false));

  document.getElementById("dbgToggle").addEventListener("click", function () {
    document.getElementById("dbgPanel").classList.toggle("op");
  });

  document.getElementById("prepCheck").addEventListener("click", (e) => {
    const item = e.target.closest(".ck-i");
    if (!item) return;
    item.classList.toggle("dn");
    refreshIcons();
  });

  document.querySelectorAll("#diaryGrid .dg-b").forEach((btn) => {
    btn.addEventListener("click", () => {
      const type = btn.getAttribute("data-diary");
      if (type) addDiaryEntry(type);
    });
  });

  window.addEventListener("online", () => {
    updateNet();
    setStatus("ok", "Подключение восстановлено");
    flushDiaryQueue();
  });
  window.addEventListener("offline", () => {
    updateNet();
    setStatus("warn", "Нет подключения к сети");
  });

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
