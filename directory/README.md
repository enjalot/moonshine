# moonshine directory

A self-updating index of the moonshine articles on a machine, plus every
other web server running on it — each linked back to the Claude Code
conversation that spawned it. One stdlib-Python process, no dependencies,
Linux + macOS.

Open the server's port in a browser and you get:

- **Articles** — every project under `MOONSHINE_HOME` (default
  `~/.agent/moonshine`): still projects (Vite) and static exports. Cards show
  the title, the intent summary, and the authoring session from the article's
  `moonshine.meta.json` (see below). Running dev servers link straight to
  their port; stopped still projects get a **▶ start** button that launches
  `npm run dev:lan` (running `npm install` first if needed) and flips to a
  link once the server answers.
- **Other running servers** — every listening port that speaks HTTP, with
  process cwd, uptime, tmux session, systemd unit / launchd label, and the
  first prompt of the Claude session that started it (`claude --resume` id
  one copy-button away).
- **Recently stopped** — servers that vanished in the last 7 days.

## Run

```
python3 directory/server.py [PORT]     # default 8600
```

That single process rescans every 30s (ports + projects), writes
`$AGENT_ROOT/sites/registry.json`, serves the page at `/`, and serves static
articles at `/moonshine/<name>/`. Static articles may contain arbitrary
assets or data files, but dotfiles, dot-directories, directory listings,
still/Vite project source, and everything else under `$AGENT_ROOT` are not
web-accessible.

Environment (all optional):

| var | default | meaning |
| --- | --- | --- |
| `AGENT_ROOT` | `~/.agent` | registry and logs live at `<root>/sites/` |
| `MOONSHINE_HOME` | `$AGENT_ROOT/moonshine` | where article projects live |
| `MOONSHINE_DIRECTORY_TOKEN` | generated once | optional explicit token for start/scan/probe controls |

The article index and static exports are read-only without a control token.
The first startup generates one at `$AGENT_ROOT/sites/control-token` with mode
`0600`; later starts reuse it, so browser access survives service restarts.
`MOONSHINE_DIRECTORY_TOKEN` still overrides the generated value when an
operator wants to manage the secret explicitly.

An interactive startup prints a URL ending in `?token=...`; open it once to
set a same-site, HTTP-only control cookie, after which the **▶ start** buttons
become available. Services do not write the secret into their logs. Ask the
server to print the current URL directly, supplying the same port as the
running directory and the hostname used by your browser:

```bash
python3 directory/server.py 8600 --control-url moonshine.local
```

Use `127.0.0.1` (the default when `--control-url` has no value) when the
browser runs on the same machine. The server requires the cookie plus
same-origin JSON for every mutating request.

`scanner.py` also runs standalone (`python3 scanner.py`, or `--loop 30`)
if you only want the registry file.

## Article metadata: `moonshine.meta.json`

The still skill writes this at the article's project root when it
scaffolds (see `plugins/moonshine/STILL.md` § Bootstrap). All fields
optional; the scanner falls back to content frontmatter for title/summary.

```json
{
  "title": "Anisotropy: the shape of an embedding cloud",
  "summary": "Why the article exists — the intent, in a sentence or two.",
  "sessionId": "8b1f6a2e-4c3d-4e5f-9a0b-1c2d3e4f5a6b",
  "created": "2026-07-11",
  "port": 5192
}
```

`port` is the preferred dev port; the server records the port it picked on
first **▶ start** so the article comes back on the same one. Commit the file
with the article.

## API

| route | method | behavior |
| --- | --- | --- |
| `/registry.json` | GET | current registry (no-store) |
| `/api/auth` | GET | whether this browser has control access |
| `/api/probe?port=N` | GET | authorized control: does localhost:N answer HTTP |
| `/api/start` | POST | authorized control: spawn a dev server for `{"project": "<name>"}` |
| `/api/scan` | POST | authorized control: rescan now instead of waiting for the interval |

Started servers are detached (their own session), spawned through a login
shell with nvm sourced when present — so the right node is found without any
machine-specific paths. Output goes to `$AGENT_ROOT/sites/logs/<name>.log`.

Names/descriptions for non-moonshine servers can be provided in
`$AGENT_ROOT/sites/annotations.json` (key = port number or project id,
value = `{"name", "description"}`); articles should use
`moonshine.meta.json` instead.

## How linkage works

Processes spawned by Claude Code carry `CLAUDE_CODE_SESSION_ID` in their
environment. The scanner reads it from `/proc/<pid>/environ` (Linux) or
`ps -axwwE` (macOS, own processes only), finds the transcript under
`~/.claude/projects/`, and extracts the first user prompt. Fallback: walk
the parent chain to a `claude` process. tmux names come from matching the
parent chain against `tmux list-panes -a`.

## Install as a service

Nothing here requires a service manager — any way you keep
`server.py` running works. Reference setups (adjust the `server.py`
path to wherever you cloned this repo):

**Linux (systemd user service):**

```ini
# ~/.config/systemd/user/moonshine-directory.service
[Unit]
Description=Moonshine directory (articles + running servers)
After=network-online.target

[Service]
ExecStart=/usr/bin/python3 %h/code/moonshine/directory/server.py 8600
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
```

`systemctl --user enable --now moonshine-directory` — plus
`loginctl enable-linger $USER` so it survives reboots without a login.
To bind :80 as a user service, allow unprivileged low ports:
`echo net.ipv4.ip_unprivileged_port_start=80 | sudo tee /etc/sysctl.d/10-unprivileged-ports.conf && sudo sysctl --system`.

**macOS (LaunchDaemon, reboot-safe + can bind :80):**

```xml
<!-- /Library/LaunchDaemons/com.<you>.moonshine-directory.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.YOU.moonshine-directory</string>
  <key>ProgramArguments</key>
  <array><string>/usr/bin/python3</string>
    <string>/Users/YOU/code/moonshine/directory/server.py</string>
    <string>8600</string></array>
  <key>EnvironmentVariables</key>
  <dict><key>HOME</key><string>/Users/YOU</string>
        <key>SHELL</key><string>/bin/zsh</string></dict>
  <key>UserName</key><string>YOU</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardErrorPath</key><string>/tmp/moonshine-directory.err</string>
</dict></plist>
```

`sudo launchctl bootstrap system /Library/LaunchDaemons/com.YOU.moonshine-directory.plist`.
(LaunchDaemons, not LaunchAgents — agents only load at GUI login. Keep
`UserName` set unless you need :80, in which case run as root.)
