// The TV screen: the orders being prepared, and the ones ready to collect.
// It asks the server for them every couple of seconds, and chimes when a number is ready.

// How many fit on the screen at once; any more wait their turn (the oldest ready ones go first).
const MOST = { preparing: 12, ready: 9 };

// How long a newly ready number glows, so customers notice it.
const GLOW_FOR = 30 * 1000;

// How often to check for changes, and how long without an answer before saying so.
const CHECK_EVERY = 2 * 1000;
const OFFLINE_AFTER = 10 * 1000;

let orders = [];
let clockGap = 0; // the server's clock minus this TV's, so "glows for 30 seconds" is right even if the TV's clock is off
let lastAnswer = Date.now();
let announced = null; // the ready numbers already chimed for, so each one chimes once
let sound = null; // the browser's sound player, once someone has turned the chime on

// Make a new piece of the page, with a class and (optionally) some text.
function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

// Draw both columns from the list of orders.
function show() {
  const now = Date.now() + clockGap;
  const preparing = orders.filter((order) => order.status === "preparing"); // oldest first, as they came in
  const ready = orders.filter((order) => order.status === "ready").sort((a, b) => b.ready - a.ready); // newest first

  fill("preparing", preparing.slice(0, MOST.preparing), () => false);
  fill("ready", ready.slice(0, MOST.ready), (order) => now - order.ready < GLOW_FOR);
}

// One column: a box per number; glows(order) says which ones glow.
// Boxes already on the screen stay put (only new ones are added), so a glowing number doesn't pop in again.
function fill(id, list, glows) {
  const column = document.getElementById(id);
  const boxes = new Map([...column.children].map((box) => [box.textContent, box]));
  list.forEach((order, i) => {
    const box = boxes.get(order.number) || make("li", "number", order.number);
    boxes.delete(order.number);
    box.classList.toggle("new", glows(order));
    if (column.children[i] !== box) column.insertBefore(box, column.children[i] || null);
  });
  for (const gone of boxes.values()) gone.remove();
}

// Ask the server for the orders.
async function check() {
  const answer = await ask("/api/orders");
  if (answer.ok) {
    orders = answer.data.orders || [];
    clockGap = (answer.data.now || Date.now()) - Date.now();
    lastAnswer = Date.now();
    show();
    chimeForNew();
  }
  document.getElementById("offline").hidden = Date.now() - lastAnswer < OFFLINE_AFTER;
}

// A chime when a number becomes ready (not for the ones already there when the screen was opened).
function chimeForNew() {
  const ready = orders.filter((order) => order.status === "ready").map((order) => `${order.number}@${order.ready}`);
  const fresh = announced !== null && ready.some((key) => !announced.has(key));
  announced = new Set(ready);
  if (fresh) chime();
}

// Ding-dong: two soft notes, made by the browser (no sound file to download).
function chime() {
  if (!sound) return;
  const start = sound.currentTime;
  [[784, 0], [1047, 0.22]].forEach(([pitch, after]) => {
    const note = sound.createOscillator();
    const volume = sound.createGain();
    note.type = "sine";
    note.frequency.value = pitch;
    volume.gain.setValueAtTime(0.0001, start + after);
    volume.gain.exponentialRampToValueAtTime(0.5, start + after + 0.02);
    volume.gain.exponentialRampToValueAtTime(0.0001, start + after + 1.4);
    note.connect(volume).connect(sound.destination);
    note.start(start + after);
    note.stop(start + after + 1.5);
  });
}

// Browsers only allow sound after someone taps the page, so the TV shows a button until then.
document.getElementById("sound").addEventListener("click", (event) => {
  sound = new AudioContext();
  event.currentTarget.hidden = true;
  chime(); // so whoever set up the TV hears that it works
});

// The clock at the top right, e.g. "7:42 PM".
function tick() {
  document.getElementById("clock").textContent =
    new Date().toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" });
}

// Start: the café's details, the orders, and the clock (checked every few seconds, so it's never a minute behind).
document.body.dataset.theme = THEME;
document.getElementById("cafe").textContent = CAFE;
document.getElementById("note").textContent = NOTE.en;
document.getElementById("note-bm").textContent = NOTE.bm;
document.title = `${CAFE} · Order ready`;
tick();
check();
setInterval(tick, 5000);
setInterval(check, CHECK_EVERY);
setInterval(show, 5000); // a number stops glowing on time, even if nothing else changes
