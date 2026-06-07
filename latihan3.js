let currentLatihan3 = null;
let latihan3Queue = [];
let latihan3Pool = [];
let latihan3ChoicesCurrent = [];
let kana3Pinned = true;

function startLatihan3() {
  const babSelect = $("babSelect");

  if (babSelect?.value && db[babSelect.value]) {
    activeBab = babSelect.value;
  }

  saveSettings();

  latihan3Queue = [];
  latihan3Pool = [];
  refillLatihan3Pool();

  kana3Pinned = true;
  updateKana3ToggleButton();

  const latihan3BabText = $("latihan3BabText");
  if (latihan3BabText) {
    latihan3BabText.textContent = "Test Latihan 3: " + activeBab;
  }

  showPage("latihan3Page");
  updateLatihan3Stats();
  nextLatihan3Question();
}

function getLatihan3Items() {
  return (db[activeBab] || []).filter((x) => {
    return !x.hide && x.kanji && x.kana && x.arti;
  });
}

function getLatihan3Key(item) {
  return `${item.kanji}|${item.kana}|${item.romaji}|${item.arti}`;
}

function refillLatihan3Pool() {
  const allAvailable = getLatihan3Items();

  const usedKeys = new Set(
    latihan3Pool.map((x) => getLatihan3Key(x))
  );

  const remaining = allAvailable.filter(
    (x) => !usedKeys.has(getLatihan3Key(x))
  );

  const shuffledRemaining = shuffle(remaining);

  while (
    latihan3Pool.length < SESSION_POOL_LIMIT &&
    shuffledRemaining.length > 0
  ) {
    latihan3Pool.push(shuffledRemaining.shift());
  }
}

function updateLatihan3Stats() {
  const arr = db[activeBab] || [];
  const data = arr.filter((x) => x.kanji || x.kana || x.romaji || x.arti);
  const hafal = data.filter((x) => x.hide).length;
  const lali = data.length - hafal;

  const hafalEl = $("latihan3HafalCount");
  const laliEl = $("latihan3LaliCount");

  if (hafalEl) hafalEl.textContent = hafal;
  if (laliEl) laliEl.textContent = lali;
}

function nextLatihan3Question() {
  updateLatihan3Stats();
  refillLatihan3Pool();

  const list = latihan3Pool;

  const artiText = $("latihan3ArtiText");
  const result = $("latihan3Result");
  const choicesBox = $("latihan3Choices");

  if (!list.length) {
    currentLatihan3 = null;

    if (artiText) artiText.textContent = "Data kosong";
    if (result) {
      result.className = "answer-hint show-warn";
      result.textContent = "Tidak ada data untuk latihan.";
    }
    if (choicesBox) choicesBox.innerHTML = "";

    return;
  }

  if (latihan3Queue.length === 0) {
    latihan3Queue = shuffle(latihan3Pool);
  }

  currentLatihan3 = latihan3Queue.shift();

  if (artiText) artiText.textContent = currentLatihan3.arti || "";

  if (result) {
    result.className = "answer-hint";
    result.textContent = "";
  }

 prepareLatihan3Choices(getLatihan3Items(), currentLatihan3);
renderLatihan3ChoicesFromCurrent();
}

function formatLatihan3Choice(item) {
  const kanji = item.kanji || "-";
  const kana = item.kana || "-";

  if (kana3Pinned) {
    return `${kanji} (${kana})`;
  }

  return kanji;
}

function prepareLatihan3Choices(list, correctItem) {
  const correctText = formatLatihan3Choice(correctItem);

  const wrongChoices = shuffle(
    list.filter((x) => {
      return (
        x !== correctItem &&
        x.kanji &&
        x.kana &&
        norm(formatLatihan3Choice(x)) !== norm(correctText)
      );
    })
  ).slice(0, 5);

  latihan3ChoicesCurrent = shuffle([correctItem, ...wrongChoices]);
}

function renderLatihan3ChoicesFromCurrent() {
  const choicesBox = $("latihan3Choices");
  if (!choicesBox) return;

  choicesBox.innerHTML = latihan3ChoicesCurrent
    .map((item, index) => {
      const text = formatLatihan3Choice(item);

      return `
        <button
          type="button"
          class="choice-btn"
          onclick="checkLatihan3AnswerByIndex(${index})">
          ${escapeHtml(text)}
        </button>
      `;
    })
    .join("");
}

function checkLatihan3AnswerByIndex(selectedIndex) {
  if (!currentLatihan3) return;

  const selectedItem = latihan3ChoicesCurrent[selectedIndex];
  if (!selectedItem) return;

  const result = $("latihan3Result");
  const buttons = document.querySelectorAll("#latihan3Choices .choice-btn");
  const correctKey = getLatihan3Key(currentLatihan3);
  const selectedKey = getLatihan3Key(selectedItem);
  const correctText = formatLatihan3Choice(currentLatihan3);

  buttons.forEach((btn, index) => {
    const item = latihan3ChoicesCurrent[index];
    const itemKey = item ? getLatihan3Key(item) : "";

    btn.disabled = true;

    if (itemKey === correctKey) {
      btn.classList.add("choice-correct");
    } else if (itemKey === selectedKey) {
      btn.classList.add("choice-wrong");
    }
  });

  if (selectedKey === correctKey) {
    if (result) {
      result.className = "answer-hint show-ok";
      result.textContent = "Benar";
    }
  } else {
    if (result) {
      result.className = "answer-hint show-bad";
      result.textContent = "Salah. Jawaban benar: " + correctText;
    }
  }

  setTimeout(() => {
    nextLatihan3Question();
  }, 900);
}

function penakLatihan3() {
  if (!currentLatihan3) return;

  const arr = db[activeBab] || [];
  const item = arr.find((x) => getLatihan3Key(x) === getLatihan3Key(currentLatihan3));

  if (item) {
    item.hide = true;
  }

  const currentKey = getLatihan3Key(currentLatihan3);

  latihan3Pool = latihan3Pool.filter((x) => getLatihan3Key(x) !== currentKey);
  latihan3Queue = latihan3Queue.filter((x) => getLatihan3Key(x) !== currentKey);

  saveLocal({ skipRender: true });
  updateLatihan3Stats();
  nextLatihan3Question();
}

function updateKana3ToggleButton() {
  const btn = $("toggleKana3Btn");
  if (!btn) return;

  btn.textContent = kana3Pinned ? "Hiragana ON" : "Hiragana OFF";
}

function toggleKana3() {
  kana3Pinned = !kana3Pinned;
  updateKana3ToggleButton();

  if (currentLatihan3) {
    renderLatihan3ChoicesFromCurrent();
  }
}


window.startLatihan3 = startLatihan3;
window.nextLatihan3Question = nextLatihan3Question;
window.checkLatihan3AnswerByIndex = checkLatihan3AnswerByIndex;
window.penakLatihan3 = penakLatihan3;
window.toggleKana3 = toggleKana3;
