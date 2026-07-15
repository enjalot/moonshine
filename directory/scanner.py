#!/usr/bin/env python3
"""Moonshine directory scanner (Linux + macOS, stdlib only).

Produces the registry consumed by the directory page (index.html):

  1. Enumerate listening TCP ports (Linux: ss -tlnp; macOS: lsof) and
     HTTP-probe each on localhost; keep the ones that speak HTTP.
  2. For each running site, gather process metadata (cmdline, cwd, start
     time, owning systemd unit / launchd label) and link it to the Claude
     Code conversation that spawned it:
       - exact:    CLAUDE_CODE_SESSION_ID in the server's environment
                   (Linux: /proc/<pid>/environ; macOS: ps -E)
       - ancestor: a `claude` process in the parent chain (session id
                   recovered from any of its descendants' environment)
     plus the tmux session via the parent chain, and the first user
     prompt from the transcript under ~/.claude/projects/.
  3. Scan MOONSHINE_HOME (default ~/.agent/moonshine) for article
     projects: still projects (package.json + vite) and static articles
     (plain index.html). Merge each project's moonshine.meta.json
     (title, summary, sessionId, created, port) and match running dev
     servers to projects by cwd.
  4. Merge optional annotations from <out dir>/annotations.json
     (key = port number or project id, value = {name, description}).
  5. Write registry.json atomically; keep vanished sites in a
     "recent" list for RETAIN_DAYS.

Environment:
  AGENT_ROOT      root of the served tree (default ~/.agent)
  MOONSHINE_HOME  article projects dir (default $AGENT_ROOT/moonshine)

Usable standalone (`scanner.py`, or `--loop N` to scan forever) or as a
library: `scan()` returns the registry dict, `write_registry(data)`
persists it. Read-only apart from the registry file.
"""
import glob
import html
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request

IS_MAC = sys.platform == "darwin"

HOME = os.path.expanduser("~")
AGENT_ROOT = os.environ.get("AGENT_ROOT", os.path.join(HOME, ".agent"))
MOONSHINE_HOME = os.environ.get("MOONSHINE_HOME", os.path.join(AGENT_ROOT, "moonshine"))
OUT_DIR = os.path.join(AGENT_ROOT, "sites")
REGISTRY_PATH = os.path.join(OUT_DIR, "registry.json")
ANNOTATIONS_PATH = os.path.join(OUT_DIR, "annotations.json")
CLAUDE_PROJECTS = os.path.join(HOME, ".claude", "projects")

SKIP_PORTS = {22}
# macOS system daemons that listen on TCP but are never "sites"
SKIP_PROCS = {
    "rapportd", "ControlCenter", "ARDAgent", "sharingd", "AirPlayXPCHelper",
    "identityservicesd", "AMPLibraryAgent", "Google Chrome", "Dropbox",
}
HTTP_TIMEOUT = 2.0
BODY_LIMIT = 131072
RETAIN_DAYS = 7
PROMPT_PREVIEW_CHARS = 280

SID_RE = re.compile(r"CLAUDE_CODE_SESSION_ID=([0-9a-fA-F][0-9a-fA-F-]{7,})")


def run(cmd, timeout=10):
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout).stdout
    except Exception:
        return ""


# ---------------------------------------------------------------- process table

MAC_PS_RE = re.compile(
    r"^\s*(\d+)\s+(\d+)\s+(\w{3}\s+\w{3}\s+\d+\s+\d\d:\d\d:\d\d\s+\d{4})\s*(.*)$"
)


def process_table():
    """pid -> {name, ppid, start?, cmd?} for all visible processes."""
    table = {}
    if IS_MAC:
        out = run(["ps", "-axww", "-o", "pid=,ppid=,lstart=,command="])
        for line in out.splitlines():
            m = MAC_PS_RE.match(line)
            if not m:
                continue
            pid, ppid, lstart, cmd = int(m.group(1)), int(m.group(2)), m.group(3), m.group(4)
            try:
                start = time.mktime(time.strptime(" ".join(lstart.split()), "%a %b %d %H:%M:%S %Y"))
            except ValueError:
                start = None
            name = os.path.basename(cmd.split()[0]) if cmd.split() else None
            table[pid] = {"name": name, "ppid": ppid, "start": start, "cmd": cmd}
        return table
    for entry in os.listdir("/proc"):
        if not entry.isdigit():
            continue
        pid = int(entry)
        try:
            name, ppid = None, None
            with open(f"/proc/{pid}/status") as f:
                for line in f:
                    if line.startswith("Name:"):
                        name = line.split(None, 1)[1].strip()
                    elif line.startswith("PPid:"):
                        ppid = int(line.split()[1])
                        break
            table[pid] = {"name": name, "ppid": ppid}
        except (OSError, ValueError):
            continue
    return table


def ancestors(pid, table, limit=30):
    """Chain [pid, parent, grandparent, ...] up to init/launchd."""
    chain = []
    cur = pid
    for _ in range(limit):
        if not cur or cur <= 1 or cur not in table:
            break
        chain.append(cur)
        cur = table[cur]["ppid"]
    return chain


def proc_cmdline(pid, table):
    if IS_MAC:
        return (table.get(pid) or {}).get("cmd") or ""
    try:
        with open(f"/proc/{pid}/cmdline", "rb") as f:
            return " ".join(
                a.decode("utf-8", "replace") for a in f.read().split(b"\0") if a
            )
    except OSError:
        return ""


def proc_cwd(pid):
    if IS_MAC:
        out = run(["lsof", "-a", "-p", str(pid), "-d", "cwd", "-Fn"])
        for line in out.splitlines():
            if line.startswith("n"):
                return line[1:]
        return None
    try:
        return os.readlink(f"/proc/{pid}/cwd")
    except OSError:
        return None


def proc_start_time(pid, table):
    """Wall-clock process start."""
    if IS_MAC:
        return (table.get(pid) or {}).get("start")
    try:
        with open(f"/proc/{pid}/stat") as f:
            stat = f.read()
        fields = stat[stat.rindex(")") + 2:].split()
        start_ticks = int(fields[19])  # field 22 overall
        with open("/proc/stat") as f:
            btime = next(int(l.split()[1]) for l in f if l.startswith("btime"))
        return btime + start_ticks / os.sysconf("SC_CLK_TCK")
    except (OSError, ValueError, StopIteration, IndexError):
        return None


def unit_map():
    """pid -> owning service name. macOS: launchd labels (non-Apple only)."""
    if not IS_MAC:
        return None  # Linux resolves lazily from cgroup, see proc_unit
    units = {}
    for line in run(["launchctl", "list"]).splitlines()[1:]:
        parts = line.split("\t")
        if (len(parts) == 3 and parts[0].isdigit()
                and not parts[2].startswith(("com.apple.", "application."))):
            units[int(parts[0])] = parts[2]
    return units


def proc_unit(pid, units):
    if IS_MAC:
        return (units or {}).get(pid)
    try:
        with open(f"/proc/{pid}/cgroup") as f:
            path = f.read().strip().splitlines()[-1].split(":", 2)[-1]
    except (OSError, IndexError):
        return None
    seg = path.rstrip("/").split("/")[-1]
    if seg.endswith(".service") and not seg.startswith("user@"):
        return seg
    return None


# ---------------------------------------------------------------- listeners

def list_listeners():
    listeners = {}

    def add(port, addr, pid, proc):
        entry = listeners.setdefault(port, {"port": port, "addrs": [], "pid": pid, "proc": proc})
        if addr not in entry["addrs"]:
            entry["addrs"].append(addr)
        if entry["pid"] is None and pid is not None:
            entry["pid"], entry["proc"] = pid, proc

    if IS_MAC:
        out = run(["lsof", "+c", "0", "-nP", "-iTCP", "-sTCP:LISTEN", "-Fpcn"])
        pid, proc = None, None
        for line in out.splitlines():
            tag, val = line[:1], line[1:]
            if tag == "p":
                pid = int(val)
            elif tag == "c":
                proc = val
            elif tag == "n":
                m = re.match(r"(.*):(\d+)$", val)
                if not m:
                    continue
                addr, port = m.group(1), int(m.group(2))
                if port in SKIP_PORTS or proc in SKIP_PROCS:
                    continue
                add(port, addr, pid, proc)
    else:
        out = run(["ss", "-tlnp"])
        for line in out.splitlines()[1:]:
            parts = line.split()
            if len(parts) < 4:
                continue
            m = re.match(r"(.*):(\d+)$", parts[3])
            if not m:
                continue
            addr, port = m.group(1), int(m.group(2))
            if port in SKIP_PORTS or addr.startswith(("127.0.0.53", "127.0.0.54")):
                continue
            pm = re.search(r'users:\(\("([^"]+)",pid=(\d+)', line)
            proc, pid = (pm.group(1), int(pm.group(2))) if pm else (None, None)
            add(port, addr, pid, proc)
    return [listeners[p] for p in sorted(listeners)]


def probe_http(port):
    """GET localhost:<port>/; return HTTP metadata or None if not HTTP."""
    req = urllib.request.Request(
        f"http://127.0.0.1:{port}/",
        headers={"User-Agent": "moonshine-directory-scanner", "Accept": "text/html,*/*"},
    )
    try:
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:
            status, headers = resp.status, resp.headers
            body = resp.read(BODY_LIMIT).decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        status, headers = e.code, e.headers or {}
        try:
            body = e.read(BODY_LIMIT).decode("utf-8", "replace")
        except Exception:
            body = ""
    except Exception:
        return None
    info = {
        "http_status": status,
        "content_type": (headers.get("Content-Type") or "").split(";")[0].strip(),
    }
    m = re.search(r"<title[^>]*>(.*?)</title>", body, re.I | re.S)
    if m:
        title = html.unescape(re.sub(r"\s+", " ", m.group(1)).strip())
        if title:
            info["title"] = title[:200]
    m = re.search(r'<meta\s[^>]*name=["\']description["\'][^>]*content=["\']([^"\']*)', body, re.I)
    if m and m.group(1).strip():
        info["description"] = html.unescape(m.group(1).strip())[:300]
    if "/@vite/client" in body:
        info["framework"] = "vite"
    return info


# ---------------------------------------------------------------- claude linkage

def session_id_map():
    """macOS: pid -> CLAUDE_CODE_SESSION_ID, one ps -E pass (own procs only)."""
    if not IS_MAC:
        return None
    sids = {}
    for line in run(["ps", "-axwwE", "-o", "pid=,command="]).splitlines():
        parts = line.split(None, 1)
        if len(parts) < 2 or not parts[0].isdigit():
            continue
        m = SID_RE.search(parts[1])
        if m:
            sids[int(parts[0])] = m.group(1)
    return sids


def session_id_of(pid, sid_map):
    if IS_MAC:
        return (sid_map or {}).get(pid)
    try:
        with open(f"/proc/{pid}/environ", "rb") as f:
            raw = f.read()
    except OSError:
        return None
    m = SID_RE.search(raw.decode("utf-8", "replace"))
    return m.group(1) if m else None


def find_claude_procs(table):
    return [pid for pid, p in table.items() if p["name"] == "claude"]


def children_index(table):
    kids = {}
    for pid, p in table.items():
        kids.setdefault(p["ppid"], []).append(pid)
    return kids


def claude_session_id(claude_pid, kids, sid_map, max_reads=25):
    """Recover a claude process's session id from any descendant's environ."""
    queue, reads = [claude_pid] + list(kids.get(claude_pid, [])), 0
    while queue and reads < max_reads:
        pid = queue.pop(0)
        reads += 1
        sid = session_id_of(pid, sid_map)
        if sid:
            return sid
        if pid != claude_pid:
            queue.extend(kids.get(pid, []))
    return None


def tmux_pane_map():
    try:
        out = subprocess.run(
            ["tmux", "list-panes", "-a", "-F", "#{pane_pid} #{session_name}"],
            capture_output=True, text=True, timeout=5,
        ).stdout
    except Exception:
        return {}
    panes = {}
    for line in out.splitlines():
        parts = line.split(None, 1)
        if len(parts) == 2 and parts[0].isdigit():
            panes[int(parts[0])] = parts[1].strip()
    return panes


def transcript_info(session_id):
    """First user prompt + last activity from a session's transcript."""
    matches = glob.glob(os.path.join(CLAUDE_PROJECTS, "*", session_id + ".jsonl"))
    if not matches:
        return None
    path = matches[0]
    info = {"session_id": session_id, "last_activity": os.path.getmtime(path)}
    first_any = None
    try:
        with open(path) as f:
            for i, line in enumerate(f):
                if i > 200:
                    break
                try:
                    rec = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if rec.get("type") != "user":
                    continue
                content = (rec.get("message") or {}).get("content")
                text = None
                if isinstance(content, str):
                    text = content
                elif isinstance(content, list):
                    for block in content:
                        if isinstance(block, dict) and block.get("type") == "text":
                            text = block.get("text")
                            break
                if not text or not text.strip():
                    continue
                text = text.strip()
                if first_any is None:
                    first_any = text
                # skip harness noise (system reminders, command wrappers, caveats)
                if text.startswith("<") or text.startswith("Caveat:"):
                    continue
                info["first_prompt"] = text[:PROMPT_PREVIEW_CHARS]
                break
    except OSError:
        pass
    if "first_prompt" not in info and first_any:
        info["first_prompt"] = first_any[:PROMPT_PREVIEW_CHARS]
    return info


# ---------------------------------------------------------------- moonshine projects

FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---", re.S)


def frontmatter_fields(md_path):
    """title/description from simple velite frontmatter (no yaml dep)."""
    try:
        with open(md_path, encoding="utf-8", errors="replace") as f:
            head = f.read(4096)
    except OSError:
        return {}
    m = FRONTMATTER_RE.match(head)
    if not m:
        return {}
    fields = {}
    for line in m.group(1).splitlines():
        km = re.match(r"^(title|description):\s*(.+)$", line)
        if km:
            val = km.group(2).strip()
            if (val[:1], val[-1:]) in (("'", "'"), ('"', '"')):
                val = val[1:-1]
            fields[km.group(1)] = val
    return fields


def project_content_info(path):
    """Best title/description from content/ markdown (series index wins)."""
    candidates = (
        glob.glob(os.path.join(path, "content", "series", "index.md"))
        + sorted(glob.glob(os.path.join(path, "content", "*.md")))
    )
    for md in candidates:
        fields = frontmatter_fields(md)
        if fields.get("title"):
            return fields
    return {}


def static_page_info(path):
    """title/description scraped from a static article's index.html."""
    try:
        with open(os.path.join(path, "index.html"), encoding="utf-8", errors="replace") as f:
            body = f.read(BODY_LIMIT)
    except OSError:
        return {}
    info = {}
    m = re.search(r"<title[^>]*>(.*?)</title>", body, re.I | re.S)
    if m:
        info["title"] = html.unescape(re.sub(r"\s+", " ", m.group(1)).strip())[:200]
    m = re.search(r'<meta\s[^>]*name=["\']description["\'][^>]*content=["\']([^"\']*)', body, re.I)
    if m and m.group(1).strip():
        info["description"] = html.unescape(m.group(1).strip())[:300]
    return info


def newest_mtime(path, subdirs=("content",)):
    """Latest mtime across the project's authored files (content/ or root)."""
    latest = 0
    roots = [os.path.join(path, s) for s in subdirs if os.path.isdir(os.path.join(path, s))]
    if not roots:
        roots = [path]
    for root in roots:
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = [d for d in dirnames if d not in ("node_modules", ".git", "dist", ".velite")]
            for fn in filenames:
                try:
                    latest = max(latest, os.path.getmtime(os.path.join(dirpath, fn)))
                except OSError:
                    pass
    return latest or None


def scan_projects(sites):
    """Index MOONSHINE_HOME article projects and match running dev servers."""
    if not os.path.isdir(MOONSHINE_HOME):
        return []
    by_cwd = {}
    for s in sites:
        if s.get("cwd"):
            by_cwd[os.path.realpath(s["cwd"])] = s

    projects = []
    for name in sorted(os.listdir(MOONSHINE_HOME)):
        path = os.path.join(MOONSHINE_HOME, name)
        if name.startswith(".") or not os.path.isdir(path):
            continue
        has_pkg = os.path.isfile(os.path.join(path, "package.json"))
        has_html = os.path.isfile(os.path.join(path, "index.html"))
        if not has_pkg and not has_html:
            continue
        kind = "still" if has_pkg else "static"

        meta = {}
        try:
            with open(os.path.join(path, "moonshine.meta.json")) as f:
                meta = json.load(f)
        except (OSError, json.JSONDecodeError):
            pass

        content = project_content_info(path) if kind == "still" else static_page_info(path)
        proj = {
            "name": name,
            "kind": kind,
            "path": path,
            "title": meta.get("title") or content.get("title") or name,
            "summary": meta.get("summary") or content.get("description"),
            "session_id": meta.get("sessionId"),
            "created": meta.get("created"),
            "preferred_port": meta.get("port"),
            "updated_at": newest_mtime(path) if kind == "still" else newest_mtime(path, ()),
        }
        if kind == "still":
            proj["installed"] = os.path.isdir(os.path.join(path, "node_modules"))
            running = by_cwd.get(os.path.realpath(path))
            if running:
                proj["port"] = running["port"]
                proj["localhost_only"] = running.get("localhost_only", False)
                running["moonshine_project"] = name
        else:
            proj["url"] = f"/moonshine/{name}/"
        projects.append(proj)
    return projects


# ---------------------------------------------------------------- assembly

def guess_project(cwd, cmd):
    if not cwd:
        return None
    m = re.search(r"/moonshine/([^/]+)", cwd)
    if m and m.group(1) != "node_modules":
        return "moonshine:" + m.group(1)
    base = os.path.basename(cwd.rstrip("/"))
    return base or None


def build_site(listener, table, kids, panes, claude_by_session, sid_map, units):
    port, pid = listener["port"], listener["pid"]
    http = probe_http(port)
    if http is None:
        return None

    cmd = proc_cmdline(pid, table)[:300] if pid else ""
    cmd = cmd or (listener.get("proc") or "")
    cwd = proc_cwd(pid) if pid else None
    chain = ancestors(pid, table) if pid else []

    site = {
        "port": port,
        "addrs": listener["addrs"],
        "pid": pid,
        "cmd": cmd,
        "cwd": cwd,
        "localhost_only": bool(listener["addrs"])
        and all(a in ("127.0.0.1", "[::1]", "::1") for a in listener["addrs"]),
        "unit": proc_unit(pid, units) if pid else None,
        "started_at": proc_start_time(pid, table) if pid else None,
        "project": guess_project(cwd, cmd),
        **http,
    }

    # tmux session via parent chain
    site["tmux_session"] = next((panes[p] for p in chain if p in panes), None)

    # claude conversation linkage
    session_id = session_id_of(pid, sid_map) if pid else None
    link_type = "env" if session_id else None
    if not session_id:
        claude_anc = next((p for p in chain if table.get(p, {}).get("name") == "claude"), None)
        if claude_anc:
            session_id = claude_session_id(claude_anc, kids, sid_map)
            link_type = "ancestor"
    if session_id:
        tinfo = transcript_info(session_id) or {"session_id": session_id}
        tinfo["link_type"] = link_type
        site["claude"] = tinfo
        if not site["tmux_session"]:
            site["tmux_session"] = claude_by_session.get(session_id)
    return site


def load_json(path, default):
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return default


def scan():
    """One full scan; returns the registry dict (does not write it)."""
    now = time.time()

    table = process_table()
    kids = children_index(table)
    panes = tmux_pane_map()
    sid_map = session_id_map()
    units = unit_map()

    # session_id -> tmux session name (via each claude process)
    claude_by_session = {}
    for cpid in find_claude_procs(table):
        sid = claude_session_id(cpid, kids, sid_map)
        if sid:
            tsess = next((panes[p] for p in ancestors(cpid, table) if p in panes), None)
            if tsess:
                claude_by_session[sid] = tsess
    # macOS: any process carrying a session id can anchor that session to a pane
    for pid, sid in (sid_map or {}).items():
        if sid not in claude_by_session:
            tsess = next((panes[p] for p in ancestors(pid, table) if p in panes), None)
            if tsess:
                claude_by_session[sid] = tsess

    sites = []
    for listener in list_listeners():
        site = build_site(listener, table, kids, panes, claude_by_session, sid_map, units)
        if site:
            sites.append(site)

    projects = scan_projects(sites)

    prev = load_json(REGISTRY_PATH, {})
    old_sites = {s["port"]: s for s in prev.get("sites", [])}
    annotations = load_json(ANNOTATIONS_PATH, {})

    live_keys = set()
    for site in sites:
        old = old_sites.get(site["port"])
        same = old is not None and old.get("cmd") == site["cmd"]
        site["first_seen"] = old["first_seen"] if same and old.get("first_seen") else now
        site["last_seen"] = now
        ann = annotations.get(str(site["port"]))
        if ann is None and site.get("project"):
            ann = annotations.get(site["project"])
        if ann:
            site["annotation"] = ann
        live_keys.add((site["port"], site["cmd"]))

    # carry over vanished sites into "recent"
    recent = prev.get("recent", [])
    for port, old in old_sites.items():
        if (port, old.get("cmd")) not in live_keys:
            old.setdefault("ended_at", old.get("last_seen", now))
            recent.append(old)
    seen, pruned = set(), []
    for s in sorted(recent, key=lambda x: -(x.get("ended_at") or 0)):
        key = (s.get("port"), s.get("cmd"))
        if key in seen or key in live_keys:
            continue
        if now - (s.get("ended_at") or 0) > RETAIN_DAYS * 86400:
            continue
        seen.add(key)
        pruned.append(s)

    host = os.uname().nodename.split(".")[0]
    if IS_MAC:
        host = run(["scutil", "--get", "LocalHostName"]).strip() or host
    return {
        "generated_at": now,
        "host": host,
        "moonshine_home": MOONSHINE_HOME,
        "projects": projects,
        "sites": sites,
        "recent": pruned,
    }


def write_registry(data):
    os.makedirs(OUT_DIR, exist_ok=True)
    tmp = REGISTRY_PATH + ".tmp"
    with open(tmp, "w") as f:
        json.dump(data, f, indent=1)
    os.replace(tmp, REGISTRY_PATH)


def main():
    data = scan()
    write_registry(data)
    print(f"{len(data['projects'])} projects, {len(data['sites'])} sites, "
          f"{len(data['recent'])} recent -> {REGISTRY_PATH}")


if __name__ == "__main__":
    # --loop N: run forever, scanning every N seconds (for platforms where
    # a one-shot timer isn't practical). server.py embeds its own loop, so
    # this is only needed when running the scanner without the server.
    if len(sys.argv) > 1 and sys.argv[1] == "--loop":
        interval = int(sys.argv[2]) if len(sys.argv) > 2 else 30
        while True:
            try:
                main()
            except Exception as e:
                print(f"scan failed: {e}", file=sys.stderr, flush=True)
            time.sleep(interval)
    else:
        main()
