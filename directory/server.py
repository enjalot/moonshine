#!/usr/bin/env python3
"""Moonshine directory server (Linux + macOS, stdlib only).

One process that:
  - rescans ports + moonshine projects every SCAN_INTERVAL seconds
    (scanner.py) and writes $AGENT_ROOT/sites/registry.json
  - serves the directory page (index.html next to this file) at /
  - serves non-dot files under static moonshine articles at
    /moonshine/<article>/, without exposing the rest of $AGENT_ROOT
  - exposes a small API:
      GET  /registry.json          current registry (no-store)
      GET  /api/probe?port=N       {"up": bool} — is localhost:N serving HTTP
      POST /api/start              {"project": name} — npm install (if
                                   needed) + npm run dev:lan in the project,
                                   detached; responds {"port": N, ...}
      POST /api/scan               force a rescan now

Usage: server.py [PORT]   (default 8600)
Environment:
  AGENT_ROOT      registry/log location (default ~/.agent)
  MOONSHINE_HOME  article projects dir (default $AGENT_ROOT/moonshine)
  MOONSHINE_DIRECTORY_TOKEN  optional explicit control token

Dev servers are spawned through a login shell with nvm sourced when
present, so the node that authored the articles is the node that runs
them — no machine-specific paths in here.
"""
import argparse
import json
import hmac
import os
import re
import socket
import subprocess
import sys
import threading
import time
from functools import partial
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlsplit

import scanner
from control_token import control_url, load_or_create_control_token


def parse_args():
    parser = argparse.ArgumentParser(description="moonshine directory server")
    parser.add_argument("port", nargs="?", type=int, default=8600)
    parser.add_argument(
        "--control-url",
        nargs="?",
        const="127.0.0.1",
        metavar="HOST",
        help="print the persisted control URL for HOST and exit",
    )
    return parser.parse_args()


ARGS = parse_args()
PORT = ARGS.port
APP_DIR = os.path.dirname(os.path.abspath(__file__))
AGENT_ROOT = scanner.AGENT_ROOT
MOONSHINE_HOME = scanner.MOONSHINE_HOME
LOG_DIR = os.path.join(scanner.OUT_DIR, "logs")
SCAN_INTERVAL = 30
DEV_PORT_RANGE = range(5173, 5400)
MAX_REQUEST_BODY = 64 * 1024

NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")
CONTROL_COOKIE = "moonshine_control"
CONTROL_TOKEN_PATH = os.path.join(scanner.OUT_DIR, "control-token")
CONTROL_TOKEN, CONTROL_TOKEN_SOURCE = load_or_create_control_token(
    os.environ.get("MOONSHINE_DIRECTORY_TOKEN"), CONTROL_TOKEN_PATH
)

rescan_now = threading.Event()
starting_lock = threading.Lock()
starting = {}  # project name -> {"port": N, "at": ts} for in-flight starts


# ---------------------------------------------------------------- scan loop

def scan_loop():
    while True:
        try:
            scanner.write_registry(scanner.scan())
        except Exception as e:
            print(f"scan failed: {e}", file=sys.stderr, flush=True)
        rescan_now.wait(SCAN_INTERVAL)
        rescan_now.clear()


# ---------------------------------------------------------------- start projects

def port_is_free(port):
    with socket.socket() as s:
        s.settimeout(0.3)
        return s.connect_ex(("127.0.0.1", port)) != 0


def pick_port(preferred):
    if preferred and port_is_free(preferred):
        return preferred
    reserved = {info["port"] for info in starting.values()}
    for p in DEV_PORT_RANGE:
        if p not in reserved and port_is_free(p):
            return p
    raise RuntimeError("no free port in dev range")


def start_project(name):
    if not NAME_RE.match(name):
        raise ValueError("bad project name")
    path = os.path.join(MOONSHINE_HOME, name)
    if not os.path.isfile(os.path.join(path, "package.json")):
        raise ValueError("not a still project")

    with starting_lock:
        inflight = starting.get(name)
        if inflight and time.time() - inflight["at"] < 300:
            return {"port": inflight["port"], "already": "starting"}

        # already running? (registry may be up to a scan-interval stale)
        reg = scanner.load_json(scanner.REGISTRY_PATH, {})
        for proj in reg.get("projects", []):
            if proj.get("name") == name and proj.get("port"):
                return {"port": proj["port"], "already": "running"}

        meta_path = os.path.join(path, "moonshine.meta.json")
        meta = scanner.load_json(meta_path, {})
        port = pick_port(meta.get("port"))

        installing = not os.path.isdir(os.path.join(path, "node_modules"))
        # login shell + explicit nvm sourcing: nvm's ~/.bashrc block is
        # skipped in non-interactive shells, and engine-strict projects
        # fail on a stale system node
        cmd = 'if [ -s "$HOME/.nvm/nvm.sh" ]; then . "$HOME/.nvm/nvm.sh"; fi; '
        if installing:
            cmd += "npm install && "
        cmd += "exec npm run dev:lan"

        env = os.environ.copy()
        env["MOONSHINE_PORT"] = str(port)
        env.pop("CLAUDE_CODE_SESSION_ID", None)  # don't mislink to our spawner
        shell = env.get("SHELL") or "/bin/bash"

        os.makedirs(LOG_DIR, exist_ok=True)
        log_path = os.path.join(LOG_DIR, f"{name}.log")
        with open(log_path, "ab") as log:
            log.write(f"\n=== start {time.strftime('%Y-%m-%d %H:%M:%S')} port {port} ===\n".encode())
            proc = subprocess.Popen(
                [shell, "-lc", cmd], cwd=path, env=env,
                stdout=log, stderr=subprocess.STDOUT,
                start_new_session=True,
            )

        if meta.get("port") != port:
            meta["port"] = port
            try:
                with open(meta_path, "w") as f:
                    json.dump(meta, f, indent=2)
                    f.write("\n")
            except OSError:
                pass

        starting[name] = {"port": port, "at": time.time()}
        return {"port": port, "pid": proc.pid, "installing": installing,
                "log": os.path.relpath(log_path, AGENT_ROOT)}


# ---------------------------------------------------------------- http

class Handler(SimpleHTTPRequestHandler):
    def request_path(self):
        return unquote(urlsplit(self.path).path)

    def control_authorized(self):
        raw = self.headers.get("Cookie") or ""
        cookie = SimpleCookie()
        try:
            cookie.load(raw)
        except Exception:
            return False
        supplied = cookie.get(CONTROL_COOKIE)
        return bool(supplied) and hmac.compare_digest(supplied.value, CONTROL_TOKEN)

    def establish_control_session(self):
        supplied = parse_qs(urlsplit(self.path).query).get("token", [""])[0]
        if not supplied:
            return False
        if not hmac.compare_digest(supplied, CONTROL_TOKEN):
            self.send_error(403, "invalid control token")
            return True
        self.send_response(303)
        self.send_header("Location", "/")
        self.send_header(
            "Set-Cookie",
            f"{CONTROL_COOKIE}={CONTROL_TOKEN}; Path=/; HttpOnly; SameSite=Strict",
        )
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        return True

    def require_control(self):
        if not self.control_authorized():
            self.send_json({"ok": False, "error": "control token required"}, status=401)
            return False
        return True

    def require_same_origin_json(self):
        if not self.require_control():
            return False
        ctype = (self.headers.get("Content-Type") or "").lower()
        if not ctype.startswith("application/json"):
            self.send_json({"ok": False, "error": "content-type must be application/json"}, status=403)
            return False
        fetch_site = self.headers.get("Sec-Fetch-Site")
        if fetch_site and fetch_site not in ("same-origin", "none"):
            self.send_json({"ok": False, "error": "cross-site requests are not allowed"}, status=403)
            return False
        origin = self.headers.get("Origin")
        host = self.headers.get("Host")
        if origin and host:
            parsed = urlsplit(origin)
            if parsed.scheme not in ("http", "https") or parsed.netloc != host:
                self.send_json({"ok": False, "error": "origin does not match host"}, status=403)
                return False
        return True

    def static_project_parts(self):
        """Safe path parts for a non-dot file inside a static article."""
        path = self.request_path()
        if "\x00" in path:
            return None
        parts = [part for part in path.split("/") if part]
        if len(parts) < 2 or parts[0] != "moonshine":
            return None
        rel = parts[1:]
        if any(part in (".", "..") or part.startswith(".") for part in rel):
            return None

        home = os.path.realpath(MOONSHINE_HOME)
        project = os.path.realpath(os.path.join(home, rel[0]))
        candidate = os.path.realpath(os.path.join(project, *rel[1:]))
        try:
            if os.path.commonpath((home, project)) != home:
                return None
            if os.path.commonpath((project, candidate)) != project:
                return None
        except ValueError:
            return None

        # Still/Vite projects are reached through their own dev server. Only
        # static exports are served here, with arbitrary non-dot assets/files.
        if not os.path.isfile(os.path.join(project, "index.html")):
            return None
        if os.path.isfile(os.path.join(project, "package.json")):
            return None
        return rel

    def translate_path(self, path):
        parts = self.static_project_parts()
        if not parts:
            return os.path.join(MOONSHINE_HOME, "__moonshine-denied__")
        return os.path.join(MOONSHINE_HOME, *parts)

    def list_directory(self, path):
        self.send_error(404, "directory listings are disabled")
        return None

    def send_json(self, obj, status=200):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_file_nostore(self, path, ctype, head_only=False):
        try:
            with open(path, "rb") as f:
                body = f.read()
        except OSError:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if not head_only:
            self.wfile.write(body)

    def do_GET(self):
        path = self.request_path()
        if path in ("", "/", "/index.html"):
            if self.establish_control_session():
                return
            self.send_file_nostore(os.path.join(APP_DIR, "index.html"), "text/html; charset=utf-8")
        elif path == "/registry.json":
            self.send_file_nostore(scanner.REGISTRY_PATH, "application/json")
        elif path == "/api/auth":
            self.send_json({"ok": True, "authorized": self.control_authorized()})
        elif path == "/api/probe":
            if not self.require_control():
                return
            m = re.search(r"port=(\d+)", self.path)
            up = bool(m) and scanner.probe_http(int(m.group(1))) is not None
            self.send_json({"up": up})
        elif self.static_project_parts():
            super().do_GET()
        else:
            self.send_error(404)

    def do_HEAD(self):
        path = self.request_path()
        if path in ("", "/", "/index.html"):
            self.send_file_nostore(
                os.path.join(APP_DIR, "index.html"), "text/html; charset=utf-8", head_only=True
            )
        elif path == "/registry.json":
            self.send_file_nostore(scanner.REGISTRY_PATH, "application/json", head_only=True)
        elif self.static_project_parts():
            super().do_HEAD()
        else:
            self.send_error(404)

    def do_POST(self):
        if not self.require_same_origin_json():
            return
        path = self.request_path()
        if path == "/api/scan":
            rescan_now.set()
            self.send_json({"ok": True})
            return
        if path != "/api/start":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
            if length < 0 or length > MAX_REQUEST_BODY:
                self.send_json({"ok": False, "error": "request body too large"}, status=413)
                return
            body = json.loads(self.rfile.read(length) or b"{}")
            result = start_project(str(body.get("project", "")))
            result["ok"] = True
            self.send_json(result)
        except (ValueError, RuntimeError) as e:
            self.send_json({"ok": False, "error": str(e)}, status=400)
        except Exception as e:
            self.send_json({"ok": False, "error": f"internal: {e}"}, status=500)

    def log_message(self, *args):
        pass  # quiet; systemd/launchd would capture every request otherwise


if __name__ == "__main__":
    if ARGS.control_url:
        print(control_url(ARGS.control_url, PORT, CONTROL_TOKEN))
        raise SystemExit(0)
    threading.Thread(target=scan_loop, daemon=True).start()
    handler = partial(Handler, directory=AGENT_ROOT)
    server = ThreadingHTTPServer(("", PORT), handler)
    print(f"moonshine directory on :{PORT} — projects from {MOONSHINE_HOME}", flush=True)
    if sys.stdout.isatty():
        print(
            f"control access: {control_url('127.0.0.1', PORT, CONTROL_TOKEN)} "
            "(replace 127.0.0.1 with this machine's LAN host when remote)",
            flush=True,
        )
    else:
        print(
            f"control access: run {sys.executable} {os.path.abspath(__file__)} "
            f"{PORT} --control-url [HOST]",
            flush=True,
        )
    if CONTROL_TOKEN_SOURCE == "file":
        print(f"control token persists at {CONTROL_TOKEN_PATH}", flush=True)
    server.serve_forever()
