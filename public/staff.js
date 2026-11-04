// The staff page: add a number when an order comes in, tap Ready when it's done, Collected when it's picked up.

// How long the Undo bar stays after a number is collected or removed.
const UNDO_FOR = 6 * 1000;

// How often to check for changes made on another phone.
const CHECK_EVERY = 3 * 1000;

let drawn = ""; // the orders on the page now, so it's only redrawn when something changed
let undoTimer = null;
let takeBack = null; // what Undo does, if it's showing

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
    button("Remove", "remove", () => removeOrder(order.number, `${order.number} removed`), `Remove ${order.number}`),
    button("Ready ✓", "go", () => act(order.number, "ready")),
  ]);
  fill("ready", ready, (order) => [
    button("Not ready", "remove", () => act(order.number, "not-ready")),
    button("Collected", "go done", () => removeOrder(order.number, `${order.number} collected`)),
  ]);

  document.getElementById("preparing-count").textContent = preparing.length || "";
  document.getElementById("ready-count").textContent = ready.length || "";
}

// One list: a row per order, with its number and its buttons.
function fill(id, list, buttonsFor) {
  const rows = document.getElementById(id);
  rows.replaceChildren();
  for (const order of list) {
    const row = make("li", "order");
    row.append(make("span", "number", order.number), ...buttonsFor(order));
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
    askForPin(savedKey() ? "The PIN has changed. Please type the new one." : "");
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
  offerUndo(message, () => send("/api/orders/restore", removed));
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
    problem.textContent = "Type the order's number first.";
    return;
  }
  const answer = await send("/api/orders", { number });
  if (!answer) return;
  if (!answer.ok) {
    problem.textContent = answer.data.problem || "That didn't work. Try again.";
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
  document.getElementById("pin-problem").textContent = answer.status === 0
    ? "Can't reach the server. Check the Wi-Fi."
    : answer.data.problem;
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

// Start: the café's name, the orders, and the next number ready to add (or the PIN, the first time).
document.getElementById("cafe").textContent = CAFE;
document.title = `Staff · ${CAFE}`;
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
