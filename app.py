"""The Order ready server: it keeps the list of orders, and serves the TV screen and the staff page.

The TV asks for the orders every couple of seconds; the staff page changes them.

The orders are kept in memory, not in a database: each one only matters for a few minutes,
so if the server restarts it simply starts with an empty screen. That's also why it must run
as ONE process (gunicorn --workers 1): two would each keep their own list.
"""

import hashlib
import hmac
import os
import re
import secrets
import threading
import time
from functools import wraps

from flask import Flask, jsonify, redirect, request
from werkzeug.middleware.proxy_fix import ProxyFix

# DEMO=1 in the server's settings: the public demo for my portfolio. Anyone can try the staff page
# (no PIN), the home page shows the phone and the TV side by side, and orders clear after a while.
DEMO = os.environ.get("DEMO", "").strip().lower() in ("1", "true", "yes")
DEMO_KEEPS_FOR = 30 * 60 * 1000  # ms

# The staff PIN, from the server's settings (never in the code). Empty = no PIN, for trying it out.
STAFF_PIN = "" if DEMO else os.environ.get("STAFF_PIN", "").strip()

# A phone that types the right PIN gets this long "staff key", and sends it with every change.
# Guessing the PIN is limited (see MOST_WRONG), but phones already set up never are: in a café
# everyone on the Wi-Fi shares one address, so a customer guessing can't lock the staff out.
# SECRET_KEY (in the server's settings) keeps the key the same after a restart; without it,
# staff type the PIN again whenever the server restarts. Changing the PIN logs every phone out.
SECRET_KEY = os.environ.get("SECRET_KEY", "") or secrets.token_hex(32)
STAFF_KEY = hmac.new(SECRET_KEY.encode(), STAFF_PIN.encode(), hashlib.sha256).hexdigest()

# An order number: letters, digits and dashes, like A12, 107 or T-08.
NUMBER = re.compile(r"^[A-Z0-9-]{1,6}$")

# Most orders on the list at once (far more than any café has), so the list can't grow forever.
MOST_ORDERS = 200

# Wrong PINs: after this many from one address, it has to wait before trying again.
MOST_WRONG = 5
WAIT_AFTER_WRONG = 10 * 60  # seconds

app = Flask(__name__, static_folder="public", static_url_path="")
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1)  # online, the visitor's address comes from the host's proxy

lock = threading.Lock()  # one change at a time, even when two staff tap at once
state = {"orders": [], "last": ""}  # an order: {number, status "preparing" or "ready", added and ready: when, in ms}
wrong_tries = {}  # address -> times of its recent wrong PINs


def now_ms():
    return int(time.time() * 1000)


def everything(**extra):
    """What both pages get back: the orders, the last number added, the server's time, and whether a PIN is needed."""
    if DEMO:  # the demo tidies itself, so the next visitor doesn't find a screen full of old numbers
        state["orders"] = [order for order in state["orders"] if now_ms() - order["added"] < DEMO_KEEPS_FOR]
    return jsonify(orders=state["orders"], last=state["last"], now=now_ms(), pinNeeded=bool(STAFF_PIN), **extra)


def problem(code, message, status):
    """Something didn't work. The code lets the staff page say it in English or BM."""
    return jsonify(problem=message, code=code), status


def staff_only(view):
    """Only staff can change the orders: their phone sends the staff key with each change."""

    @wraps(view)
    def checked(*args, **kwargs):
        if STAFF_PIN and not hmac.compare_digest(request.headers.get("X-Staff-Key", "").encode(), STAFF_KEY.encode()):
            return problem("need-pin", "Please type the staff PIN.", 401)
        with lock:
            return view(*args, **kwargs)

    return checked


def find(number):
    """Where an order is on the list, or -1."""
    return next((i for i, order in enumerate(state["orders"]) if order["number"] == number), -1)


# ---- The pages ----

@app.get("/")
def home():
    return app.send_static_file("demo.html") if DEMO else redirect("/staff")


@app.get("/tv")
def tv():
    return app.send_static_file("screen.html")


@app.get("/staff")
def staff():
    return app.send_static_file("staff.html")


# ---- The orders ----

@app.get("/api/orders")
def orders():
    with lock:
        return everything()


@app.post("/api/pin")
def pin():
    """The staff page sends the PIN here once, and gets the staff key back to save on the phone."""
    if not STAFF_PIN:
        return jsonify(key="")
    address = request.remote_addr or "?"
    with lock:
        recent = [t for t in wrong_tries.get(address, []) if time.time() - t < WAIT_AFTER_WRONG]
        if len(recent) >= MOST_WRONG:
            return problem("too-many", "Too many wrong PINs. Wait 10 minutes, then try again.", 429)
        typed = str((request.get_json(silent=True) or {}).get("pin", "")).strip()
        if not hmac.compare_digest(typed.encode(), STAFF_PIN.encode()):
            if len(wrong_tries) > 1000:  # forget old ones, so this list stays small
                wrong_tries.clear()
            wrong_tries[address] = recent + [time.time()]
            return problem("wrong-pin", "That PIN isn't right.", 401)
        wrong_tries.pop(address, None)
    return jsonify(key=STAFF_KEY)


@app.post("/api/orders")
@staff_only
def add():
    number = re.sub(r"\s+", "", str((request.get_json(silent=True) or {}).get("number", ""))).upper()
    if not NUMBER.match(number):
        return problem("bad-number", "Use up to 6 letters and numbers, like A12.", 400)
    if find(number) >= 0:
        return problem("already", f"{number} is already on the screen.", 409)
    if len(state["orders"]) >= MOST_ORDERS:
        return problem("full", "The list is full. Tap Collected on some orders first.", 409)
    state["orders"].append({"number": number, "status": "preparing", "added": now_ms()})
    state["last"] = number
    return everything()


@app.post("/api/orders/<number>/<action>")
@staff_only
def change(number, action):
    """ready, not-ready (back to Preparing) or remove (collected, or added by mistake)."""
    at = find(number)
    if at < 0:
        return problem("gone", f"{number} isn't on the list any more.", 404)
    order = state["orders"][at]
    if action == "ready":
        order.update(status="ready", ready=now_ms())
    elif action == "not-ready":
        order["status"] = "preparing"
        order.pop("ready", None)
    elif action == "remove":
        state["orders"].pop(at)
        return everything(removed={"order": order, "at": at})  # so Undo can put it back where it was
    else:
        return problem("unknown", "Unknown change.", 404)
    return everything()


@app.post("/api/orders/restore")
@staff_only
def restore():
    """Undo: put a removed order back where it was."""
    body = request.get_json(silent=True) or {}
    order = body.get("order") or {}
    number = str(order.get("number", ""))
    if not NUMBER.match(number) or order.get("status") not in ("preparing", "ready"):
        return problem("unknown", "That can't be undone.", 400)
    if find(number) < 0 and len(state["orders"]) < MOST_ORDERS:
        kept = {"number": number, "status": order["status"], "added": now_ms()}
        if order["status"] == "ready":
            ready = order.get("ready")
            kept["ready"] = ready if isinstance(ready, int) else now_ms()
        at = body.get("at")
        state["orders"].insert(at if isinstance(at, int) and at >= 0 else len(state["orders"]), kept)
    return everything()


@app.after_request
def no_caching(response):
    """The orders change all the time: never keep an old copy. And a few standard safety settings."""
    if request.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "same-origin"
    return response


if DEMO:  # a few numbers to start with, so the demo's first visitor sees what it looks like
    state["orders"] = [
        {"number": number, "status": status, "added": now_ms(), **({"ready": now_ms() - 60000} if status == "ready" else {})}
        for number, status in [("A01", "ready"), ("A02", "ready"), ("A03", "preparing"), ("A04", "preparing")]
    ]
    state["last"] = "A04"


if __name__ == "__main__":
    # On this computer: python app.py, then open http://localhost:5050/staff and http://localhost:5050/tv
    app.run(host="127.0.0.1", port=5050)
