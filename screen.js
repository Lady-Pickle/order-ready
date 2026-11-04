// The TV screen: the orders being prepared, and the ones ready to collect.

// For now, some made-up orders to see the design. Step 3 gets the real ones from the staff page.
// ready: when it was marked ready (newest first on the screen); the newest glows for a while.
let orders = [
  { number: "A12", status: "preparing" },
  { number: "A13", status: "preparing" },
  { number: "A14", status: "preparing" },
  { number: "A15", status: "preparing" },
  { number: "A09", status: "ready", ready: Date.now() - 120000 },
  { number: "A10", status: "ready", ready: Date.now() - 60000 },
  { number: "A11", status: "ready", ready: Date.now() },
];

// How many fit on the screen at once; any more wait their turn (the oldest ready ones go first).
const MOST = { preparing: 12, ready: 9 };

// How long a newly ready number glows, so customers notice it.
const GLOW_FOR = 30 * 1000;

// Make a new piece of the page, with a class and (optionally) some text.
function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

// Draw both columns from the list of orders.
function show() {
  const preparing = orders.filter((order) => order.status === "preparing"); // oldest first, as they came in
  const ready = orders.filter((order) => order.status === "ready").sort((a, b) => b.ready - a.ready); // newest first

  fill("preparing", preparing.slice(0, MOST.preparing), () => false);
  fill("ready", ready.slice(0, MOST.ready), (order) => Date.now() - order.ready < GLOW_FOR);
}

// One column: a box per number; glows(order) says which ones glow.
function fill(id, list, glows) {
  const column = document.getElementById(id);
  column.replaceChildren();
  for (const order of list) {
    const box = make("li", "number", order.number);
    if (glows(order)) box.classList.add("new");
    column.append(box);
  }
}

// The clock at the top right, e.g. "7:42 PM".
function tick() {
  document.getElementById("clock").textContent =
    new Date().toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" });
}

// Start: the café's details, the orders, and the clock (checked every few seconds, so it's never a minute behind).
document.getElementById("cafe").textContent = CAFE;
document.getElementById("note").textContent = NOTE.en;
document.getElementById("note-bm").textContent = NOTE.bm;
document.title = `${CAFE} · Order ready`;
show();
tick();
setInterval(tick, 5000);
setInterval(show, 5000); // a number stops glowing on time
