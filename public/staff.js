// The staff page: add a number when an order comes in, tap Ready when it's done, Collected when it's picked up.

// How long the Undo bar stays after a number is collected or removed.
const UNDO_FOR = 6 * 1000;

// How often to check for changes made on another phone.
const CHECK_EVERY = 3 * 1000;

// Every word on the page, in English and BM. {n} is an order's number.
const TEXT = {
  en: {
    switchTo: "BM",
    pinLabel: "Staff PIN",
    start: "Start",
    pinHint: "Only once on each phone: it's remembered after that.",
    pinChanged: "The PIN has changed. Please type the new one.",
    offline: "Can't reach the server. Check the Wi-Fi; it keeps trying.",
    noServer: "Can't reach the server. Check the Wi-Fi.",
    newNumber: "New order number",
    add: "Add",
    typeNumber: "Type the order's number first.",
    preparing: "Preparing",
    ready: "Ready to collect",
    nothingPreparing: "Nothing being prepared",
    nothingReady: "Nothing waiting to be collected",
    remove: "Remove",
    removeLabel: "Remove {n}",
    readyButton: "Ready ✓",
    notReady: "Not ready",
    collected: "Collected",
    wasRemoved: "{n} removed",
    wasCollected: "{n} collected",
    undo: "Undo",
    openTv: "Open the TV screen ↗",
    problems: {
      "bad-number": "Use up to 6 letters and numbers, like A12.",
      already: "{n} is already on the screen.",
      full: "The list is full. Tap Collected on some orders first.",
      "wrong-pin": "That PIN isn't right.",
      "too-many": "Too many wrong PINs. Wait 10 minutes, then try again.",
      other: "That didn't work. Try again.",
    },
  },
  bm: {
    switchTo: "EN",
    pinLabel: "PIN kakitangan",
    start: "Mula",
    pinHint: "Sekali sahaja pada setiap telefon: ia akan diingati selepas itu.",
    pinChanged: "PIN telah ditukar. Sila taip PIN yang baru.",
    offline: "Tidak dapat sambung ke pelayan. Periksa Wi-Fi; ia akan terus mencuba.",
    noServer: "Tidak dapat sambung ke pelayan. Periksa Wi-Fi.",
    newNumber: "Nombor pesanan baru",
    add: "Tambah",
    typeNumber: "Taip nombor pesanan dahulu.",
    preparing: "Sedang disediakan",
    ready: "Sedia untuk diambil",
    nothingPreparing: "Tiada pesanan sedang disediakan",
    nothingReady: "Tiada pesanan menunggu untuk diambil",
    remove: "Buang",
    removeLabel: "Buang {n}",
    readyButton: "Siap ✓",
    notReady: "Belum siap",
    collected: "Diambil",
    wasRemoved: "{n} dibuang",
    wasCollected: "{n} sudah diambil",
    undo: "Batal",
    openTv: "Buka skrin TV ↗",
    problems: {
      "bad-number": "Guna hingga 6 huruf dan nombor, contohnya A12.",
      already: "{n} sudah ada di skrin.",
      full: "Senarai sudah penuh. Tekan Diambil pada beberapa pesanan dahulu.",
      "wrong-pin": "PIN itu salah.",
      "too-many": "Terlalu banyak PIN salah. Tunggu 10 minit, kemudian cuba lagi.",
      other: "Tidak berjaya. Cuba lagi.",
    },
  },
};

const LANGUAGE_KEY = "order-ready-language";

let language = startLanguage();
let drawn = ""; // the orders on the page now, so it's only redrawn when something changed
let undoTimer = null;
let takeBack = null; // what Undo does, if it's showing

// The language chosen last time on this phone, or BM if the phone is set to Malay.
function startLanguage() {
  try {
    const saved = localStorage.getItem(LANGUAGE_KEY);
    if (saved in TEXT) return saved;
  } catch {
    // can't read it: go by the phone's language
  }
  return navigator.language.toLowerCase().startsWith("ms") ? "bm" : "en";
}

// A word in the current language, with an order's number put in.
function say(key, number) {
  return TEXT[language][key].replace("{n}", number);
}

// A problem from the server, in the current language.
function sayProblem(answer, number) {
  const problems = TEXT[language].problems;
  return (problems[answer.data.code] || problems.other).replace("{n}", number);
}

// Put every word on the page into the current language.
function useLanguage() {
  document.documentElement.lang = language === "bm" ? "ms" : "en";
  for (const el of document.querySelectorAll("[data-text]")) el.textContent = say(el.dataset.text);
  document.getElementById("preparing").dataset.empty = say("nothingPreparing");
  document.getElementById("ready").dataset.empty = say("nothingReady");
  document.getElementById("language").textContent = say("switchTo");
  document.getElementById("problem").textContent = "";
  document.getElementById("pin-problem").textContent = "";
  drawn = ""; // so the buttons are redrawn too, next time the orders arrive
}

document.getElementById("language").addEventListener("click", () => {
  language = language === "en" ? "bm" : "en";
  try {
    localStorage.setItem(LANGUAGE_KEY, language);
  } catch {
    // can't save it: it starts in the phone's language next time
  }
  useLanguage();
  refresh();
});

// Make a new piece of the page, with a class and (optionally) some text.
function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

// The number after the last one, keeping its letters and zeros: A09 → A10, 99 → 100. Nothing yet → 1.
function nextNumber(last) {
  const match = /^(.*?)(\d+)$/.exec(last || "");
  if (!match) return "1";
  const [, letters, digits] = match;
  return letters + String(Number(digits) + 1).padStart(digits.length, "0");
}

// Draw both lists from what the server sent.
function show(data) {
  const orders = data.orders || [];
  const now = JSON.stringify(orders);
  if (now === drawn) return; // nothing changed: leave the buttons alone, mid-tap
  drawn = now;

  const preparing = orders.filter((order) => order.status === "preparing"); // oldest first, as they came in
  const ready = orders.filter((order) => order.status === "ready").sort((a, b) => b.ready - a.ready); // newest first, like the TV

  fill("preparing", preparing, (order) => [
    button(say("remove"), "remove", () => removeOrder(order.number, "wasRemoved"), say("removeLabel", order.number)),
    button(say("readyButton"), "go", () => act(order.number, "ready")),
  ]);
  fill("ready", ready, (order) => [
    button(say("notReady"), "remove", () => act(order.number, "not-ready")),
    button(say("collected"), "go done", () => removeOrder(order.number, "wasCollected")),
  ]);

  document.getElementById("preparing-count").textContent = preparing.length || "";
  document.getElementById("ready-count").textContent = ready.length || "";
}

// One list: a row per order: its number with the small "mistake" button under it, then the big button.
function fill(id, list, buttonsFor) {
  const rows = document.getElementById(id);
  rows.replaceChildren();
  for (const order of list) {
    const [small, big] = buttonsFor(order);
    const which = make("div", "which");
    which.append(make("span", "number", order.number), small);
    const row = make("li", "order");
    row.append(which, big);
    rows.append(row);
  }
}

function button(text, className, onClick, label) {
  const el = make("button", className, text);
  el.type = "button";
  if (label) el.setAttribute("aria-label", label);
  el.addEventListener("click", onClick);
  return el;
}

// Send a change to the server, and show the result. Gives back the server's answer, or null if it didn't work.
async function send(path, body = {}) {
  const answer = await ask(path, body);
  online(answer.status !== 0);
  if (answer.status === 401) {
    askForPin(savedKey() ? say("pinChanged") : "");
    return null;
  }
  if (!answer.ok) {
    refresh(); // e.g. another phone already collected it: show how things are now
    return answer;
  }
  show(answer.data);
  return answer;
}

// "ready", or "not-ready" (back to Preparing).
function act(number, change) {
  return send(`/api/orders/${encodeURIComponent(number)}/${change}`);
}

// Take a number off (collected, or added by mistake), with a few seconds to Undo.
async function removeOrder(number, message) {
  const answer = await send(`/api/orders/${encodeURIComponent(number)}/remove`);
  if (!answer || !answer.ok) return;
  const { removed } = answer.data;
  offerUndo(say(message, number), () => send("/api/orders/restore", removed));
}

function offerUndo(message, undo) {
  takeBack = undo;
  document.getElementById("undo-text").textContent = message;
  document.getElementById("undo").hidden = false;
  clearTimeout(undoTimer);
  undoTimer = setTimeout(hideUndo, UNDO_FOR);
}

function hideUndo() {
  takeBack = null;
  document.getElementById("undo").hidden = true;
}

document.getElementById("undo-button").addEventListener("click", () => {
  if (takeBack) takeBack();
  hideUndo();
});

// Adding a number: tidy it (a 12 → A12) and send it. The server says if it's already there.
const input = document.getElementById("number");
const problem = document.getElementById("problem");

document.getElementById("add").addEventListener("submit", async (event) => {
  event.preventDefault();
  const number = input.value.replace(/\s+/g, "").toUpperCase();
  if (!number) {
    problem.textContent = say("typeNumber");
    return;
  }
  const answer = await send("/api/orders", { number });
  if (!answer) return;
  if (!answer.ok) {
    problem.textContent = sayProblem(answer, number);
    return;
  }
  problem.textContent = "";
  input.value = nextNumber(answer.data.last);
});

input.addEventListener("input", () => {
  problem.textContent = "";
});

// ---- The staff PIN ----

const pinForm = document.getElementById("pin-form");
const pinInput = document.getElementById("pin");

function askForPin(message) {
  saveKey("");
  document.getElementById("main").hidden = true;
  pinForm.hidden = false;
  document.getElementById("pin-problem").textContent = message || "";
  pinInput.focus();
}

pinForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const answer = await ask("/api/pin", { pin: pinInput.value.trim() });
  if (answer.ok) {
    saveKey(answer.data.key);
    pinInput.value = "";
    pinForm.hidden = true;
    document.getElementById("main").hidden = false;
    refresh();
    return;
  }
  document.getElementById("pin-problem").textContent = answer.status === 0 ? say("noServer") : sayProblem(answer);
});

// ---- Keeping up with other phones ----

function online(yes) {
  document.getElementById("offline").hidden = yes;
}

async function refresh() {
  const answer = await ask("/api/orders");
  online(answer.ok);
  if (!answer.ok) return null;
  show(answer.data);
  return answer.data;
}

// Start: the words, the café's name, the orders, and the next number ready to add (or the PIN, the first time).
document.getElementById("cafe").textContent = CAFE;
document.title = `Staff · ${CAFE}`;
useLanguage();
refresh().then((data) => {
  if (!data) return;
  input.value = nextNumber(data.last);
  if (data.pinNeeded && !savedKey()) askForPin();
});
setInterval(() => {
  if (!document.hidden) refresh(); // not while the phone's screen is off
}, CHECK_EVERY);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refresh(); // straight away when the phone is picked up again
});
