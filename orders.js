// The list of orders, shared by the staff page and the TV screen.
// For now it's kept in this browser, so both pages must be open on the same computer.
// Step 3 moves it to a small server, so a phone can change the TV.

const KEY = "order-ready";

// What's saved: the orders, oldest first, and the last number added (to suggest the next one).
// An order: { number: "A12", status: "preparing" or "ready", ready: when it was marked ready }
function readState() {
  try {
    const state = JSON.parse(localStorage.getItem(KEY));
    if (state && Array.isArray(state.orders)) return state;
  } catch {
    // nothing saved yet, or the browser won't let us read it: start empty
  }
  return { orders: [], last: "" };
}

function writeState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // the browser won't let us save (e.g. a private window): the page still works until it's closed
  }
}

// Run callback whenever another tab changes the orders (the staff page changes them, the TV redraws).
function whenStateChanges(callback) {
  window.addEventListener("storage", (event) => {
    if (event.key === KEY) callback();
  });
}
