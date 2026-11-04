// The staff page: add a number when an order comes in, tap Ready when it's done, Collected when it's picked up.

// How long the Undo bar stays after a number is collected or removed.
const UNDO_FOR = 6 * 1000;

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

// Change the saved orders, then redraw. edit(state) does the change.
function change(edit) {
  const state = readState();
  edit(state);
  writeState(state);
  show();
}

// Draw both lists from the saved orders.
function show() {
  const orders = readState().orders;
  const preparing = orders.filter((order) => order.status === "preparing"); // oldest first, as they came in
  const ready = orders.filter((order) => order.status === "ready").sort((a, b) => b.ready - a.ready); // newest first, like the TV

  fill("preparing", preparing, (order) => [
    button("Remove", "remove", () => removeOrder(order.number, `${order.number} removed`), `Remove ${order.number}`),
    button("Ready ✓", "go", () => markReady(order.number)),
  ]);
  fill("ready", ready, (order) => [
    button("Not ready", "remove", () => markNotReady(order.number)),
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

function markReady(number) {
  change((state) => {
    const order = state.orders.find((o) => o.number === number);
    if (order) Object.assign(order, { status: "ready", ready: Date.now() });
  });
}

// Back to Preparing, if Ready was tapped too soon.
function markNotReady(number) {
  change((state) => {
    const order = state.orders.find((o) => o.number === number);
    if (order) Object.assign(order, { status: "preparing", ready: undefined });
  });
}

// Take a number off (collected, or added by mistake), with a few seconds to Undo.
function removeOrder(number, message) {
  let removed = null;
  let at = 0;
  change((state) => {
    at = state.orders.findIndex((o) => o.number === number);
    if (at >= 0) [removed] = state.orders.splice(at, 1);
  });
  if (!removed) return;

  offerUndo(message, () =>
    change((state) => {
      if (!state.orders.some((o) => o.number === number)) state.orders.splice(at, 0, removed);
    }),
  );
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

// Adding a number: tidy it (A 12 → A12), and don't add the same one twice.
const input = document.getElementById("number");
const problem = document.getElementById("problem");

document.getElementById("add").addEventListener("submit", (event) => {
  event.preventDefault();
  const number = input.value.replace(/\s+/g, "").toUpperCase();
  if (!number) {
    problem.textContent = "Type the order's number first.";
    return;
  }
  if (readState().orders.some((o) => o.number === number)) {
    problem.textContent = `${number} is already on the screen.`;
    return;
  }
  change((state) => {
    state.orders.push({ number, status: "preparing" });
    state.last = number;
  });
  problem.textContent = "";
  input.value = nextNumber(number);
});

input.addEventListener("input", () => {
  problem.textContent = "";
});

// Start: the café's name, the next number ready to add, and both lists.
document.getElementById("cafe").textContent = CAFE;
document.title = `Staff · ${CAFE}`;
input.value = nextNumber(readState().last);
show();
whenStateChanges(show); // another tab changed the orders
