// The list of orders lives on the café's small server (app.py), so a phone and the TV share it.
// Both pages ask the server for it every couple of seconds.

// The staff key: the server gives it to a phone once the right PIN is typed, and it's saved there.
const STAFF_KEY = "order-ready-staff-key";

function savedKey() {
  try {
    return localStorage.getItem(STAFF_KEY) || "";
  } catch {
    return ""; // the browser won't let us read it (e.g. a private window)
  }
}

function saveKey(key) {
  try {
    if (key) localStorage.setItem(STAFF_KEY, key);
    else localStorage.removeItem(STAFF_KEY);
  } catch {
    // can't save it: staff type it again next time
  }
}

// Ask the server: GET when there's no body, POST (with the staff key) when there is.
// Gives back { ok, status, data }; status 0 means the server couldn't be reached (Wi-Fi down, or it's off).
async function ask(path, body) {
  const options = body === undefined
    ? { cache: "no-store" }
    : {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Staff-Key": savedKey() },
        body: JSON.stringify(body),
      };
  try {
    const response = await fetch(path, options);
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data };
  } catch {
    return { ok: false, status: 0, data: {} };
  }
}
