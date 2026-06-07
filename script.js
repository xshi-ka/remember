const STORAGE_KEY = "kotobaTrainerHtmlData.v1";
const SETTINGS_KEY = "kotobaTrainerHtmlSettings.v1";
const LAST_SOURCE_KEY = "kotobaLastSpreadsheetSourceId.v1";
const SESSION_POOL_LIMIT = 10;
const SPREADSHEET_SOURCES = [
  { 
    id: "sp4",
    kode: "sek tak piker",
    label: "N2 (Source APK Migi lek gk salah)",
    url: "https://docs.google.com/spreadsheets/d/1mTMUzI1rsu7XaFGvHwEOItDXa-zpO-EeOqFhZRKUpsk/export?format=csv&gid=0"
  },
  {
    id: "sp3",
    kode: "8im64im6u6yb",
    label: "N3 (Source FB lek gk salah)",
    url: "https://docs.google.com/spreadsheets/d/11X2py3lyV1DDLLIpnkC6XLvnNRHY8yh3qvaBtxZkxMg/export?format=csv&gid=0"
  },
  {
    id: "sp1",
    kode: "Peh lali aku",
    label: "N4 (Source lali aku ko ngendi)",
    url: "https://docs.google.com/spreadsheets/d/1en_L8gmNtW07nQ3CfvNF1pVX2BJldN0sid23OzTiVVs/export?format=csv&gid=0"
  },
  {
    id: "sp2",
    kode: "u46b647uy6bn4",
    label: "PM",
    url: "https://docs.google.com/spreadsheets/d/1147-w0dWCnVqdB2ZbMqQJ2Yc-79w73w8tjZwK9gwPBM/export?format=csv&gid=0"
  }
];

let db = {};
let activeBab = "";
let current = null;
let queue = [];
let sudahCek = false;
let selectedRows = new Set();
let sortHideAsc = false;

let previewMode = false;
let previewDb = {};
let previewSourceLabel = "";
let localBabBeforePreview = "";

let pendingSheetAction = "";
let pendingSheetSource = null;
let activeSessionPool = [];

let originalLocalDb = {};


/* =========================
   Helpers
========================= */

function $(id) {
  return document.getElementById(id);
}

function qs(selector) {
  return document.querySelector(selector);
}

function norm(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function setStorageStatus(source, type = "info") {
  const el = $("storageStatus");
  if (!el) return;
  el.textContent = source;
  el.dataset.type = type;
}

function showStatus(message, type = "info") {
  const el = $("syncStatus");
  if (!el) return;
  el.textContent = message;
  el.dataset.type = type;
}

/* =========================
   Default data
========================= */

function defaultData() {
  return {
    "Contoh 1": [
      { hide: false, kanji: "学校", kana: "がっこう", romaji: "gakkou", arti: "Sekolah" },
      { hide: false, kanji: "先生", kana: "せんせい", romaji: "sensei", arti: "Guru" }
    ],
    "Contoh 2": [
      { hide: false, kanji: "水", kana: "みず", romaji: "mizu", arti: "Air" },
      { hide: false, kanji: "火", kana: "ひ", romaji: "hi", arti: "Api" }
    ]
  };
}

function normalizeItem(item) {
  return {
    hide: !!item?.hide,
    kanji: String(item?.kanji ?? "").trim(),
    kana: String(item?.kana ?? "").trim(),
    romaji: String(item?.romaji ?? "").trim(),
    arti: String(item?.arti ?? "").trim()
  };
}

function normalizeDb(input) {
  const result = {};
  if (!input || typeof input !== "object") return result;

  for (const [babName, items] of Object.entries(input)) {
    if (!Array.isArray(items)) continue;
    result[String(babName)] = items.map(normalizeItem);
  }

  return result;
}

function ensureDbValid() {
  db = normalizeDb(db);

  if (!db || Object.keys(db).length === 0) {
    db = defaultData();
  }

  if (!activeBab || !db[activeBab]) {
    activeBab = Object.keys(db)[0] || "";
  }
}

/* =========================
   Settings & local
========================= */

function getSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveSettings() {
  try {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        lastBab: activeBab,
        sortHideAsc
      })
    );
  } catch (err) {
    console.warn("Gagal simpan settings:", err);
  }
}

function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    db = raw ? normalizeDb(JSON.parse(raw)) : {};
    originalLocalDb = JSON.parse(JSON.stringify(db));
  } catch {
    db = {};
  }

  const st = getSettings();
  sortHideAsc = !!st.sortHideAsc;

  if (Object.keys(db).length > 0) {
    activeBab = st.lastBab && db[st.lastBab] ? st.lastBab : Object.keys(db)[0] || "";
    ensureDbValid();
    refreshBabSelects();
    setStorageStatus("Lokal", "ok");
    showStatus("Data lokal ditemukan", "ok");
  } else {
    db = defaultData();
    originalLocalDb = JSON.parse(JSON.stringify(db));
    activeBab = Object.keys(db)[0] || "";
    refreshBabSelects();
    setStorageStatus("Lokal", "ok");
    showStatus("Data lokal aktif", "ok");
  }
}

function saveLocal(options = {}) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    originalLocalDb = JSON.parse(JSON.stringify(db));
    saveSettings();

    setStorageStatus("Lokal", "ok");
    showStatus("Tersimpan di lokal", "ok");
  } catch (err) {
    console.warn("Gagal simpan local:", err);
    showStatus("Gagal simpan lokal", "warn");
  }

  if (!options.skipRender) {
    renderTable();
  }
}

/* =========================
   Spreadsheet source helpers
========================= */

function saveLastSpreadsheetSource(sourceId) {
  try {
    localStorage.setItem(LAST_SOURCE_KEY, sourceId);
  } catch {
    // ignore
  }
}

function getLastSpreadsheetSource() {
  try {
    return localStorage.getItem(LAST_SOURCE_KEY) || "";
  } catch {
    return "";
  }
}

async function fetchSpreadsheetDb(source) {
  if (!source || !source.url) {
    throw new Error("Source spreadsheet tidak valid");
  }

  const res = await fetch(source.url, {
    method: "GET",
    cache: "no-store"
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const csvText = await res.text();
  const rows = csvToObjects(csvText);

  if (!rows.length) {
    throw new Error("Spreadsheet kosong");
  }

  const grouped = {};

  rows.forEach((row) => {
    const bab = String(row.Bab || row.bab || "").trim();
    if (!bab) return;

    const item = {
      hide:
        String(row.Hide || row.hide || "").trim().toLowerCase() === "true" ||
        String(row.Hide || row.hide || "").trim() === "1",
      kanji: String(row.Kanji || row.kanji || "").trim(),
      kana: String(row.Kana || row.kana || "").trim(),
      romaji: String(row.Romaji || row.romaji || "").trim(),
      arti: String(row.Arti || row.arti || "").trim()
    };

    if (!item.kanji && !item.kana && !item.romaji && !item.arti) return;

    if (!grouped[bab]) grouped[bab] = [];
    grouped[bab].push(item);
  });

  if (Object.keys(grouped).length === 0) {
    throw new Error("Format spreadsheet tidak cocok");
  }

  return normalizeDb(grouped);
}

async function doImportFromSpreadsheet(source) {
  try {
    showStatus(`Mengambil ${source.label}...`, "info");

    const importedDb = await fetchSpreadsheetDb(source);

db = importedDb;
originalLocalDb = JSON.parse(JSON.stringify(db));
activeBab = Object.keys(db)[0] || "";
previewMode = false;
previewDb = {};
previewSourceLabel = "";
localBabBeforePreview = "";
queue = [];
activeSessionPool = [];

    ensureDbValid();
    refreshBabSelects();
    renderTable();
    updateStats();
    saveLocal({ skipRender: true });

    saveLastSpreadsheetSource(source.id);
    setStorageStatus("Lokal", "ok");
    showStatus(`Data aktif diambil dari ${source.label}`, "ok");
  } catch (err) {
    console.error(err);
    showStatus(`Gagal ambil ${source.label}`, "warn");
  }
}

async function doPreviewFromSpreadsheet(source) {
  try {
    showStatus(`Memuat preview ${source.label}...`, "info");

    localBabBeforePreview = activeBab;

    const importedDb = await fetchSpreadsheetDb(source);

    previewMode = true;
    previewDb = importedDb;
    previewSourceLabel = source.label;

    const firstBab = Object.keys(previewDb)[0] || "";
    if (firstBab) {
      activeBab = firstBab;
    }

    refreshBabSelects();
    renderTable();
    updateStats();

    saveLastSpreadsheetSource(source.id);
    setStorageStatus("Preview", "warn");
    showStatus(`Preview ${source.label}`, "ok");
  } catch (err) {
    console.error(err);
    showStatus(`Gagal preview ${source.label}`, "warn");
  }
}


function previewFromSpreadsheet() {
  openSheetPicker("preview");
}

function closePreviewMode() {
  previewMode = false;
  previewDb = {};
  previewSourceLabel = "";

  if (localBabBeforePreview && db[localBabBeforePreview]) {
    activeBab = localBabBeforePreview;
  } else if (!db[activeBab]) {
    activeBab = Object.keys(db)[0] || "";
  }

  localBabBeforePreview = "";

  queue = [];
  activeSessionPool = [];

  ensureDbValid();
  refreshBabSelects();
  renderTable();
  updateStats();

  setStorageStatus("Lokal", "ok");
  showStatus("Kembali ke data lokal", "ok");
}

/* =========================
   BAB handling
========================= */

function refreshBabSelects() {
  const sourceDb = previewMode ? previewDb : db;
  const babNames = Object.keys(sourceDb || {});
  const babSelect = $("babSelect");
  const babKelolaSelect = $("babKelolaSelect");

  if (babNames.length === 0) return;

  function fillSelect(selectEl) {
    if (!selectEl) return;

    const selectedValue = sourceDb[activeBab] ? activeBab : babNames[0];
    selectEl.innerHTML = "";

    babNames.forEach((name) => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      selectEl.appendChild(opt);
    });

    selectEl.value = selectedValue;
  }

  fillSelect(babSelect);
  fillSelect(babKelolaSelect);
}

function setActiveBab(value) {
  const sourceDb = previewMode ? previewDb : db;
  if (!sourceDb[value]) return;

  activeBab = value;
  queue = [];
  activeSessionPool = [];
  selectedRows.clear();

  const babSelect = $("babSelect");
  const babKelolaSelect = $("babKelolaSelect");

  if (babSelect) babSelect.value = value;
  if (babKelolaSelect) babKelolaSelect.value = value;

  saveSettings();
  updateStats();
}

/* =========================
   Page nav
========================= */

function showPage(id) {
  ["welcomePage", "latihanPage", "kelolaPage", "latihan2Page", "latihan3Page"].forEach((pageId) => {
    const el = $(pageId);
    if (el) el.classList.add("hidden");
  });

  $(id)?.classList.remove("hidden");
}

function goWelcome() {
  refreshBabSelects();
  showPage("welcomePage");
}

function openKelola() {
  const babSelect = $("babSelect");
  if (babSelect?.value && db[babSelect.value]) {
    activeBab = babSelect.value;
  }

  refreshBabSelects();
  renderTable();
  showPage("kelolaPage");
}

function startLatihan() {
  const babSelect = $("babSelect");
  if (babSelect?.value && db[babSelect.value]) {
    activeBab = babSelect.value;
  }

  saveSettings();
  queue = [];
  activeSessionPool = [];
  refillSessionPool();

  const activeBabText = $("activeBabText");
  if (activeBabText) {
    activeBabText.textContent = "List kotoba yang akan diacak: " + activeBab;
  }

  showPage("latihanPage");
  nextQuestion();
}

/* =========================
   Training
========================= */

function activeItems() {
  return (db[activeBab] || []).filter(
    (x) => !x.hide && x.kanji && x.romaji && x.arti
  );
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function clearAnswerColors() {
  const romajiInput = $("romajiInput");
  const artiInput = $("artiInput");
  const answerHint = $("answerHint");
  const kanaBox = $("kanaBox");

  [romajiInput, artiInput].forEach((input) => {
    if (!input) return;
    input.classList.remove("answer-ok", "answer-bad", "answer-warn");
    input.style.borderColor = "";
    input.style.boxShadow = "";
    input.style.background = "";
  });

  if (answerHint) {
    answerHint.className = "answer-hint";
    answerHint.textContent = "";
  }

  if (kanaBox) {
    kanaBox.classList.remove("kana-ok", "kana-bad");
  }
}

function nextQuestion() {
  refillSessionPool();

  const kanjiText = $("kanjiText");
  const kanaBox = $("kanaBox");
  const romajiInput = $("romajiInput");
  const artiInput = $("artiInput");
  const cekJawabanBtn = $("cekJawabanBtn");

  if (activeSessionPool.length === 0) {
    current = null;

    if (kanjiText) kanjiText.textContent = "Data kosong";
    if (kanaBox) kanaBox.textContent = "";
    if (romajiInput) romajiInput.value = "";
    if (artiInput) artiInput.value = "";

    clearAnswerColors();
    sudahCek = false;

    if (cekJawabanBtn) cekJawabanBtn.textContent = "Cek Jawaban";
    return;
  }

  if (queue.length === 0) {
    queue = shuffle(activeSessionPool);
  }

  current = queue.shift();

  if (kanjiText) kanjiText.textContent = current.kanji;
  if (kanaBox) kanaBox.textContent = "";
  if (romajiInput) romajiInput.value = "";
  if (artiInput) artiInput.value = "";

  clearAnswerColors();
  sudahCek = false;

  if (cekJawabanBtn) cekJawabanBtn.textContent = "Cek Jawaban";

  setTimeout(() => {
    romajiInput?.focus();
  }, 50);
}

function showKana() {
  if (!current) return;
  const kanaBox = $("kanaBox");
  if (kanaBox) kanaBox.textContent = current.kana || "";
}

function hideKana() {
  const kanaBox = $("kanaBox");
  if (kanaBox) kanaBox.textContent = "";
}

function rootSimple(s) {
  let k = norm(s);

  for (const p of [
    "meng", "meny", "men", "mem", "ber", "ter", "per", "pe", "me", "di", "ke", "se"
  ]) {
    if (k.startsWith(p) && k.length > p.length + 3) {
      k = k.slice(p.length);
      break;
    }
  }

  for (const suf of ["kan", "nya", "lah", "an", "i"]) {
    if (k.endsWith(suf) && k.length > suf.length + 3) {
      k = k.slice(0, -suf.length);
      break;
    }
  }

  return k;
}

function levenshtein(a, b) {
  a = norm(a);
  b = norm(b);

  const dp = Array(a.length + 1)
    .fill(null)
    .map(() => Array(b.length + 1).fill(0));

  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[a.length][b.length];
}

function statusArti(user, correctList) {
  const u = norm(user);
  if (!u) return "salah";

  for (const answer of String(correctList || "").split("|")) {
    const c = norm(answer);

    if (u === c) return "benar";

    if (u.length >= 4 && c.length >= 4) {
      if (u.includes(c) || c.includes(u)) return "hampir";

      const ru = rootSimple(u);
      const rc = rootSimple(c);

      if (ru === rc || ru.includes(rc) || rc.includes(ru)) return "hampir";

      const sim = 1 - levenshtein(u, c) / Math.max(u.length, c.length);
      if (sim >= 0.75) return "hampir";
    }
  }

  return "salah";
}

function setInputStatus(input, status) {
  if (!input) return;

  if (status === "ok") {
    input.style.borderColor = "var(--ok)";
    input.style.boxShadow = "0 0 0 3px rgba(69, 232, 139, .25)";
    input.style.background = "rgba(69, 232, 139, .08)";
    return;
  }

  if (status === "warn") {
    input.style.borderColor = "var(--warn)";
    input.style.boxShadow = "0 0 0 3px rgba(255, 184, 77, .25)";
    input.style.background = "rgba(255, 184, 77, .08)";
    return;
  }

  input.style.borderColor = "var(--danger)";
  input.style.boxShadow = "0 0 0 3px rgba(255, 95, 126, .25)";
  input.style.background = "rgba(255, 95, 126, .08)";
}

function cekJawaban() {
  if (!current) return;

  const romajiInput = $("romajiInput");
  const artiInput = $("artiInput");
  const answerHint = $("answerHint");
  const kanaBox = $("kanaBox");

  if (!romajiInput || !artiInput) return;

  const romajiUser = romajiInput.value;
  const artiUser = artiInput.value;

  const romajiOk = norm(romajiUser) === norm(current.romaji);
  const artiStatus = statusArti(artiUser, current.arti);

  clearAnswerColors();

  setInputStatus(romajiInput, romajiOk ? "ok" : "bad");

  if (artiStatus === "benar") {
    setInputStatus(artiInput, "ok");
  } else if (artiStatus === "hampir") {
    setInputStatus(artiInput, "warn");
  } else {
    setInputStatus(artiInput, "bad");
  }

  if (answerHint) {
    if (romajiOk && artiStatus === "benar") {
      answerHint.className = "answer-hint show-ok";
    } else if (romajiOk && artiStatus === "hampir") {
      answerHint.className = "answer-hint show-warn";
    } else {
      answerHint.className = "answer-hint show-bad";
    }

    answerHint.textContent = `Romaji: ${current.romaji}\nArti: ${current.arti}`;
  }

  if (kanaBox) {
    kanaBox.classList.remove("kana-ok", "kana-bad");
    kanaBox.classList.add(romajiOk ? "kana-ok" : "kana-bad");
  }

  showKana();
  sudahCek = true;

  const cekJawabanBtn = $("cekJawabanBtn");
  if (cekJawabanBtn) cekJawabanBtn.textContent = "Soal Selanjutnya";
}

function handleCekJawaban() {
  if (sudahCek) {
    nextQuestion();
    return;
  }

  cekJawaban();
}

function penak() {
  if (!current) return;

  const arr = db[activeBab] || [];
  const item = arr.find(
    (x) =>
      x.kanji === current.kanji &&
      x.kana === current.kana &&
      x.romaji === current.romaji &&
      x.arti === current.arti
  );

  if (item) {
    item.hide = true;
  }

  const currentKey = `${current.kanji}|${current.kana}|${current.romaji}|${current.arti}`;

  activeSessionPool = activeSessionPool.filter(
    (x) => `${x.kanji}|${x.kana}|${x.romaji}|${x.arti}` !== currentKey
  );

  queue = queue.filter(
    (x) => `${x.kanji}|${x.kana}|${x.romaji}|${x.arti}` !== currentKey
  );

  refillSessionPool();

  saveLocal({ skipRender: true });
  nextQuestion();
}

/* =========================
   Table / kelola
========================= */

function renderTable() {
  const tbody = qs("#dataTable tbody");
  if (!tbody) return;

  const sourceDb = previewMode ? previewDb : db;
  const arr = sourceDb[activeBab] || [];
  const previewBadge = $("previewInfo");

  tbody.innerHTML = "";

  if (previewBadge) {
    if (previewMode) {
      previewBadge.textContent = `Mode Preview: ${previewSourceLabel}`;
      previewBadge.classList.remove("hidden");
    } else {
      previewBadge.textContent = "";
      previewBadge.classList.add("hidden");
    }
  }

  arr.forEach((item, idx) => {
    const tr = document.createElement("tr");

    if (!previewMode && selectedRows.has(idx)) {
      tr.classList.add("selected");
    }

    if (previewMode) {
      tr.innerHTML = `
        <td><input type="checkbox" disabled ${item.hide ? "checked" : ""} /></td>
        <td>${escapeHtml(item.kanji)}</td>
        <td>${escapeHtml(item.kana)}</td>
        <td>${escapeHtml(item.romaji)}</td>
        <td>${escapeHtml(item.arti)}</td>
      `;
    } else {
      tr.innerHTML = `
        <td><input type="checkbox" data-field="hide" ${item.hide ? "checked" : ""} /></td>
        <td><input type="text" data-field="kanji" value="${escapeAttr(item.kanji)}" /></td>
        <td><input type="text" data-field="kana" value="${escapeAttr(item.kana)}" /></td>
        <td><input type="text" data-field="romaji" value="${escapeAttr(item.romaji)}" /></td>
        <td><input type="text" data-field="arti" value="${escapeAttr(item.arti)}" /></td>
      `;

      tr.addEventListener("click", (ev) => {
        if (ev.target instanceof HTMLInputElement) return;

        if (selectedRows.has(idx)) {
          selectedRows.delete(idx);
        } else {
          selectedRows.add(idx);
        }

        renderTable();
      });

      tr.querySelectorAll("input").forEach((input) => {
 input.addEventListener("change", () => {
  const field = input.dataset.field;
  if (!field) return;

  item[field] = field === "hide" ? input.checked : input.value;
  updateStats();
  showStatus("Perubahan belum disimpan", "warn");
});

        input.addEventListener("input", () => {
          const field = input.dataset.field;
          if (!field || field === "hide") return;

          item[field] = input.value;
          updateStats();
        });

        input.addEventListener("blur", () => {
          saveLocal({ skipRender: true });
        });
      });
    }

    tbody.appendChild(tr);
  });

  updateStats();
}

function updateStats() {
  const sourceDb = previewMode ? previewDb : db;
  const arr = sourceDb[activeBab] || [];
  const data = arr.filter((x) => x.kanji || x.kana || x.romaji || x.arti);
  const hafal = data.filter((x) => x.hide).length;

  const statTotal = $("statTotal");
  const statHafal = $("statHafal");
  const statLali = $("statLali");

  if (statTotal) statTotal.textContent = data.length;
  if (statHafal) statHafal.textContent = hafal;
  if (statLali) statLali.textContent = data.length - hafal;
}

function hideAll(value) {
  if (previewMode) return;

  (db[activeBab] || []).forEach((x) => {
    x.hide = value;
  });

  renderTable();
  saveLocal();
}

function sortHideFirst() {
  if (previewMode) return;

  sortHideAsc = !sortHideAsc;

  db[activeBab] = (db[activeBab] || []).sort((a, b) => {
    const hideA = a.hide ? 1 : 0;
    const hideB = b.hide ? 1 : 0;

    if (sortHideAsc) {
      return hideA - hideB || String(a.kanji).localeCompare(String(b.kanji));
    }

    return hideB - hideA || String(a.kanji).localeCompare(String(b.kanji));
  });

  selectedRows.clear();
  renderTable();
  saveLocal({ skipRender: true });
}

function pasteFromTextArea() {
  if (previewMode) return;

  const pasteBox = $("pasteBox");
  const text = pasteBox?.value.trim() || "";

  if (!text) return;

  const rows = text.replace(/\r\n/g, "\n").split("\n");

  if (!db[activeBab]) db[activeBab] = [];

  rows.forEach((row) => {
    const p = row.split("\t");
    if (p.length >= 4) {
      db[activeBab].push({
        hide: false,
        kanji: p[0]?.trim() || "",
        kana: p[1]?.trim() || "",
        romaji: p[2]?.trim() || "",
        arti: p.slice(3).join(" ").trim() || ""
      });
    }
  });

  if (pasteBox) pasteBox.value = "";

  renderTable();
  saveLocal();
}

function refillSessionPool() {
  const allAvailable = activeItems();

  const usedKeys = new Set(
    activeSessionPool.map(
      (x) => `${x.kanji}|${x.kana}|${x.romaji}|${x.arti}`
    )
  );

  const remaining = allAvailable.filter(
    (x) => !usedKeys.has(`${x.kanji}|${x.kana}|${x.romaji}|${x.arti}`)
  );

  const shuffledRemaining = shuffle(remaining);

  while (
    activeSessionPool.length < SESSION_POOL_LIMIT &&
    shuffledRemaining.length > 0
  ) {
    activeSessionPool.push(shuffledRemaining.shift());
  }
}

/* =========================
   JSON file
========================= */

function saveJsonFile() {
  try {
    const payload = {
      activeBab,
      sortHideAsc,
      db,
      exportedAt: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json"
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "xshi-kotoba.json";
    a.click();

    setTimeout(() => URL.revokeObjectURL(url), 1000);

    showStatus("File JSON berhasil disimpan", "ok");
  } catch (err) {
    console.warn("Gagal simpan file JSON:", err);
    showStatus("Gagal simpan file JSON", "warn");
  }
}

function triggerImportJson() {
  $("jsonInput")?.click();
}

async function importJsonFile(file) {
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);

    const importedDb = normalizeDb(parsed.db || parsed);

    if (!importedDb || Object.keys(importedDb).length === 0) {
      alert("File JSON tidak valid atau kosong.");
      return;
    }

    db = importedDb;
    originalLocalDb = JSON.parse(JSON.stringify(db));
    activeBab =
      parsed.activeBab && db[parsed.activeBab]
        ? parsed.activeBab
        : Object.keys(db)[0] || "";

    sortHideAsc = !!parsed.sortHideAsc;

previewMode = false;
previewDb = {};
previewSourceLabel = "";
localBabBeforePreview = "";
queue = [];
activeSessionPool = [];

    ensureDbValid();
    refreshBabSelects();
    renderTable();
    updateStats();
    saveLocal({ skipRender: true });

    showStatus("Data JSON berhasil diambil", "ok");
  } catch (err) {
    console.warn("Gagal ambil file JSON:", err);
    alert("File JSON tidak valid.");
    showStatus("Gagal ambil data JSON", "warn");
  }
}

function resetLocalData() {
  if (previewMode) return;
  if (!originalLocalDb || Object.keys(originalLocalDb).length === 0) return;

  db = JSON.parse(JSON.stringify(originalLocalDb));

  if (!db[activeBab]) {
    activeBab = Object.keys(db)[0] || "";
  }

  queue = [];
  selectedRows.clear();

  refreshBabSelects();
  renderTable();
  updateStats();
  showStatus("Data lokal direset", "ok");
}

/* =========================
   Sheet picker modal
========================= */

function openSheetPicker(actionType) {
  pendingSheetAction = actionType || "";
  pendingSheetSource = null;

  const modal = $("sheetPickerModal");
  const list = $("sheetPickerList");
  const title = $("sheetPickerTitle");
  const desc = $("sheetPickerDesc");

  if (!modal || !list) return;

  if (title) {
    title.textContent =
      actionType === "preview" ? "Lihat Spreadsheet" : "Ambil Spreadsheet";
  }

  if (desc) {
    desc.textContent =
      actionType === "preview"
        ? "Pilih spreadsheet yang ingin ditampilkan dalam mode read-only."
        : "Pilih spreadsheet yang ingin diambil ke data lokal.";
  }

  const lastId = getLastSpreadsheetSource();

  list.innerHTML = SPREADSHEET_SOURCES.map((item) => {
    const lastText = item.id === lastId ? "Terakhir dipakai" : "Klik untuk memilih";
    return `
      <button type="button" class="sheet-option" onclick="selectSheetSource('${escapeAttr(item.id)}')">
        <div class="sheet-option-title">${escapeHtml(item.label)}</div>
        <div class="sheet-option-sub">${escapeHtml(lastText)}</div>
      </button>
    `;
  }).join("");

  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");
}

function closeSheetPicker() {
  const modal = $("sheetPickerModal");
  if (modal) modal.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

function openConfirmImport(source) {
  pendingSheetSource = source || null;

  const modal = $("confirmImportModal");
  const text = $("confirmImportText");

  if (!modal || !source) return;

  if (text) {
    text.textContent = `Data lokal saat ini akan ditimpa dengan data dari "${source.label}".`;
  }

  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");
}

function closeConfirmImport() {
  const modal = $("confirmImportModal");
  if (modal) modal.classList.add("hidden");

  pendingSheetSource = null;
  document.body.classList.remove("modal-open");
}

function selectSheetSource(sourceId) {
  const source = SPREADSHEET_SOURCES.find((x) => x.id === sourceId);
  if (!source) return;

  closeSheetPicker();

  if (pendingSheetAction === "preview") {
    doPreviewFromSpreadsheet(source);
    return;
  }

  openConfirmImport(source);
}

async function confirmImportSelected() {
  const source = pendingSheetSource;
  if (!source) return;

  closeConfirmImport();
  await doImportFromSpreadsheet(source);
}

/* =========================
   CSV parser
========================= */

function csvToObjects(csvText) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const next = csvText[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  if (!rows.length) return [];

  const headers = rows[0].map((h) => String(h || "").trim());

  return rows
    .slice(1)
    .filter((r) => r.some((v) => String(v || "").trim() !== ""))
    .map((r) => {
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = r[i] ?? "";
      });
      return obj;
    });
}

/* =========================
   Events
========================= */

function bindSelectEvents() {
  const babSelect = $("babSelect");
  const babKelolaSelect = $("babKelolaSelect");

  if (babSelect) {
    babSelect.addEventListener("change", function () {
      setActiveBab(this.value);
    });
  }

  if (babKelolaSelect) {
    babKelolaSelect.addEventListener("change", function () {
      setActiveBab(this.value);
      renderTable();
    });
  }
}

function bindTrainingEvents() {
  $("romajiInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault();
      $("artiInput")?.focus();
    }
  });

  $("artiInput")?.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      $("romajiInput")?.focus();
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      handleCekJawaban();
    }
  });

  document.addEventListener("keydown", (e) => {
    const latihanPage = $("latihanPage");
    if (!latihanPage || latihanPage.classList.contains("hidden")) return;

    if (e.key === "1") {
      e.preventDefault();
      penak();
    }

    if (e.key === "Tab") {
      e.preventDefault();
      showKana();
    }
  });

  document.addEventListener("keyup", (e) => {
    if (e.key === "Tab") {
      hideKana();
    }
  });
}

function bindImportEvents() {
  $("jsonInput")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    await importJsonFile(file);
    e.target.value = "";
  });
}

function bindBeforeUnload() {
  window.addEventListener("beforeunload", () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
      saveSettings();
    } catch {
      // ignore
    }
  });
}

function cleanKode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function importFromSpreadsheet() {
  const input = window.prompt("Masukkan Kode:");

  if (input === null) {
    showStatus("Ambil kotoba dibatalkan", "warn");
    return;
  }

  const kode = cleanKode(input);

  if (!kode) {
    window.alert("Kode belum diisi.");
    showStatus("Kode belum diisi", "warn");
    return;
  }

  const source = SPREADSHEET_SOURCES.find((item) => {
    return cleanKode(item.kode) === kode;
  });

  if (!source) {
    window.alert("Kode tidak ditemukan: " + kode);
    showStatus("Kode tidak ditemukan", "warn");
    return;
  }

  openConfirmImport(source);
}
/* =========================
   Init
========================= */

async function initApp() {
  loadLocal();
  bindSelectEvents();
  bindTrainingEvents();
  bindImportEvents();
  bindBeforeUnload();

  ensureDbValid();
  refreshBabSelects();
  renderTable();
  updateStats();

  setStorageStatus("Lokal", "ok");
  showStatus("Data lokal aktif", "ok");
}

function cleanKode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function openKodeImportModal() {
  const modal = $("kodeImportModal");
  const input = $("kodeImportInput");

  if (!modal || !input) return;

  input.value = "";
  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");

  setTimeout(() => {
    input.focus();
  }, 50);
}

function closeKodeImportModal() {
  const modal = $("kodeImportModal");

  if (modal) {
    modal.classList.add("hidden");
  }

  document.body.classList.remove("modal-open");
}

function confirmKodeImport() {
  const input = $("kodeImportInput");

  const kode = cleanKode(input?.value || "");

  if (!kode) {
    showStatus("Kode belum diisi", "warn");
    return;
  }

  const source = SPREADSHEET_SOURCES.find((item) => {
    return cleanKode(item.kode) === kode;
  });

  if (!source) {
    showStatus("Kode tidak ditemukan", "warn");
    return;
  }

  closeKodeImportModal();
  openConfirmImport(source);
}

function importFromSpreadsheet() {
  openKodeImportModal();
}

/* =========================
   Expose globals
========================= */

window.showPage = showPage;
window.goWelcome = goWelcome;
window.openKelola = openKelola;
window.startLatihan = startLatihan;
window.handleCekJawaban = handleCekJawaban;
window.cekJawaban = cekJawaban;
window.nextQuestion = nextQuestion;
window.showKana = showKana;
window.hideKana = hideKana;
window.penak = penak;

window.hideAll = hideAll;
window.sortHideFirst = sortHideFirst;
window.pasteFromTextArea = pasteFromTextArea;

window.saveLocal = saveLocal;
window.saveJsonFile = saveJsonFile;
window.triggerImportJson = triggerImportJson;

window.importFromSpreadsheet = importFromSpreadsheet;
window.previewFromSpreadsheet = previewFromSpreadsheet;
window.closePreviewMode = closePreviewMode;

window.openSheetPicker = openSheetPicker;
window.closeSheetPicker = closeSheetPicker;
window.selectSheetSource = selectSheetSource;
window.openConfirmImport = openConfirmImport;
window.closeConfirmImport = closeConfirmImport;
window.confirmImportSelected = confirmImportSelected;

document.addEventListener("DOMContentLoaded", initApp);

window.resetLocalData = resetLocalData;

window.openKodeImportModal = openKodeImportModal;
window.closeKodeImportModal = closeKodeImportModal;
window.confirmKodeImport = confirmKodeImport;
window.importFromSpreadsheet = importFromSpreadsheet;
