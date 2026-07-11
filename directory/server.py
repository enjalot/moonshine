#!/usr/bin/env python3
"""Moonshine directory server (Linux + macOS, stdlib only).

One process that:
  - rescans ports + moonshine projects every SCAN_INTERVAL seconds
    (scanner.py) and writes $AGENT_ROOT/sites/registry.json
  - serves the directory page (index.html next to this file) at /
  - serves $AGENT_ROOT statically (so /moonshine/<article>/ built pages
    and any other reports under ~/.agent stay reachable)
  - exposes a small API:
      GET  /registry.json          current registry (no-store)
      GET  /api/probe?port=N       {"up": bool} — is localhost:N serving HTTP
      POST /api/start              {"project": name} — npm install (if
                                   needed) + npm run dev:lan in the project,
                                   detached; responds {"port": N, ...}
      POST /api/scan               force a rescan now

Usage: server.py [PORT]   (default 8600)
Environment:
  AGENT_ROOT      served tree + registry location (default ~/.agent)
  MOONSHINE_HOME  article projects dir (default $AGENT_ROOT/moonshine)

Dev servers are spawned through a login shell with nvm sourced when
present, so the node that authored the articles is the node that runs
them — no machine-specific paths in here.
"""
import json
import os
import re
import socket
import subprocess
import sys
import threading
import time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

import scanner

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8600
APP_DIR = os.path.dirname(os.path.abspath(__file__))
AGENT_ROOT = scanner.AGENT_ROOT
MOONSHINE_HOME = scanner.MOONSHINE_HOME
LOG_DIR = os.path.join(scanner.OUT_DIR, "logs")
SCAN_INTERVAL = 30
DEV_PORT_RANGE = range(5173, 5400)

NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")

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
    def send_json(self, obj, status=200):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_file_nostore(self, path, ctype):
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
        self.wfile.write(body)

    def do_GET(self):
        path = self.path.split("?")[0]
        if path in ("", "/", "/index.html"):
            self.send_file_nostore(os.path.join(APP_DIR, "index.html"), "text/html; charset=utf-8")
        elif path == "/registry.json":
            self.send_file_nostore(scanner.REGISTRY_PATH, "application/json")
        elif path == "/api/probe":
            m = re.search(r"port=(\d+)", self.path)
            up = bool(m) and scanner.probe_http(int(m.group(1))) is not None
            self.send_json({"up": up})
        else:
            super().do_GET()

    def do_POST(self):
        path = self.path.split("?")[0]
        if path == "/api/scan":
            rescan_now.set()
            self.send_json({"ok": True})
            return
        if path != "/api/start":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
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
    threading.Thread(target=scan_loop, daemon=True).start()
    handler = partial(Handler, directory=AGENT_ROOT)
    server = ThreadingHTTPServer(("", PORT), handler)
    print(f"moonshine directory on :{PORT} — serving {AGENT_ROOT}, "
          f"projects from {MOONSHINE_HOME}", flush=True)
    server.serve_forever()
