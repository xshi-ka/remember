let currentLatihan2 = null;
let latihan2Queue = [];
let latihan2Pool = [];
let kana2Pinned = false;


function startLatihan2() {
  const babSelect = $("babSelect");

  if (babSelect?.value && db[babSelect.value]) {
    activeBab = babSelect.value;
  }

  saveSettings();

  latihan2Queue = [];
  latihan2Pool = [];
  refillLatihan2Pool(); 
  kana2Pinned = false;
  updateKana2ToggleButton();

  const latihan2BabText = $("latihan2BabText");
  if (latihan2BabText) {
    latihan2BabText.textContent = "Test Latihan 2: " + activeBab;
  }

  showPage("latihan2Page");
  updateLatihan2Stats();
  nextLatihan2Question();
}

function getLatihan2Items() {
  return (db[activeBab] || []).filter((x) => {
    return !x.hide2 && x.kanji && x.arti;
  });
}

function showKana2() {
  if (!currentLatihan2) return;

  const kanaBox = $("latihan2KanaBox");
  if (kanaBox) {
    kanaBox.textContent = currentLatihan2.kana || "";
  }
}

function hideKana2() {
  const kanaBox = $("latihan2KanaBox");
  if (kanaBox) {
    kanaBox.textContent = "";
  }
}

function updateKana2ToggleButton() {
  const btn = $("toggleKana2Btn");
  if (!btn) return;

  btn.textContent = kana2Pinned ? "Hiragana ON" : "Hiragana OFF";
}

function toggleKana2() {
  kana2Pinned = !kana2Pinned;

  if (kana2Pinned) {
    showKana2();
  } else {
    hideKana2();
  }

  updateKana2ToggleButton();
}

function nextLatihan2Question() {
  refillLatihan2Pool();

  const list = latihan2Pool;

  const kanjiText = $("latihan2KanjiText");
  const kanaBox = $("latihan2KanaBox");
  const result = $("latihan2Result");
  const choicesBox = $("latihan2Choices");

  if (!list.length) {
    currentLatihan2 = null;

    if (kanjiText) kanjiText.textContent = "Data kosong";
    if (kanaBox) kanaBox.textContent = "";
    if (result) {
      result.className = "answer-hint show-warn";
      result.textContent = "Tidak ada data untuk latihan.";
    }
    if (choicesBox) choicesBox.innerHTML = "";

    return;
  }

  if (latihan2Queue.length === 0) {
    latihan2Queue = shuffle(latihan2Pool);
  }

  currentLatihan2 = latihan2Queue.shift();

  if (kanjiText) kanjiText.textContent = currentLatihan2.kanji || "";

  if (kana2Pinned) {
    showKana2();
  } else if (kanaBox) {
    kanaBox.textContent = "";
  }

  if (result) {
    result.className = "answer-hint";
    result.textContent = "";
  }

  renderLatihan2Choices(getLatihan2Items(), currentLatihan2);
}

function renderLatihan2Choices(list, correctItem) {
  const choicesBox = $("latihan2Choices");
  if (!choicesBox) return;

  const wrongChoices = shuffle(
    list.filter((x) => {
      return (
        x !== correctItem &&
        x.arti &&
        norm(x.arti) !== norm(correctItem.arti)
      );
    })
  ).slice(0, 5);

  const choices = shuffle([correctItem, ...wrongChoices]);

  choicesBox.innerHTML = choices
    .map((item) => {
      return `
        <button
          type="button"
          class="choice-btn"
          onclick="checkLatihan2Answer('${escapeAttr(item.arti)}')">
          ${escapeHtml(item.arti || "-")}
        </button>
      `;
    })
    .join("");
}

function checkLatihan2Answer(selectedArti) {
  if (!currentLatihan2) return;

  const result = $("latihan2Result");
  const buttons = document.querySelectorAll("#latihan2Choices .choice-btn");

  buttons.forEach((btn) => {
    const text = btn.textContent.trim();

    btn.disabled = true;

    if (norm(text) === norm(currentLatihan2.arti)) {
      btn.classList.add("choice-correct");
    } else if (norm(text) === norm(selectedArti)) {
      btn.classList.add("choice-wrong");
    }
  });

  if (norm(selectedArti) === norm(currentLatihan2.arti)) {
    if (result) {
      result.className = "answer-hint show-ok";
      result.textContent = "Benar";
    }
  } else {
    if (result) {
      result.className = "answer-hint show-bad";
      result.textContent = "Salah. Jawaban benar: " + currentLatihan2.arti;
    }
  }

  setTimeout(() => {
    nextLatihan2Question();
  }, 900);
}

function penakLatihan2() {
  if (!currentLatihan2) return;

  const arr = db[activeBab] || [];
  const currentKey = getLatihan2Key(currentLatihan2);

  const item = arr.find((x) => getLatihan2Key(x) === currentKey);

  if (item) {
    item.hide2 = true;
  }

  latihan2Pool = latihan2Pool.filter((x) => getLatihan2Key(x) !== currentKey);
  latihan2Queue = latihan2Queue.filter((x) => getLatihan2Key(x) !== currentKey);

saveLocal({ skipRender: true });
updateLatihan2Stats();
updateStats();
nextLatihan2Question();
}
function updateLatihan2Stats() {
  const arr = db[activeBab] || [];
  const data = arr.filter((x) => x.kanji || x.kana || x.romaji || x.arti);

  const hafal = data.filter((x) => x.hide2).length;
  const lali = data.length - hafal;

  const hafalEl = $("latihan2HafalCount");
  const laliEl = $("latihan2LaliCount");

  if (hafalEl) hafalEl.textContent = hafal;
  if (laliEl) laliEl.textContent = lali;
}

function refillLatihan2Pool() {
  const allAvailable = getLatihan2Items();

  const usedKeys = new Set(
    latihan2Pool.map((x) => `${x.kanji}|${x.kana}|${x.romaji}|${x.arti}`)
  );

  const remaining = allAvailable.filter(
    (x) => !usedKeys.has(`${x.kanji}|${x.kana}|${x.romaji}|${x.arti}`)
  );

  const shuffledRemaining = shuffle(remaining);

  while (
    latihan2Pool.length < SESSION_POOL_LIMIT &&
    shuffledRemaining.length > 0
  ) {
    latihan2Pool.push(shuffledRemaining.shift());
  }
}
function getLatihan2Key(item) {
  return `${item.kanji}|${item.kana}|${item.romaji}|${item.arti}`;
}




window.startLatihan2 = startLatihan2;
window.nextLatihan2Question = nextLatihan2Question;
window.checkLatihan2Answer = checkLatihan2Answer;
window.toggleKana2 = toggleKana2;
window.penakLatihan2 = penakLatihan2;