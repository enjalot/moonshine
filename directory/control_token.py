"""Persistent control credentials for the moonshine directory."""

import os
import secrets
from urllib.parse import urlencode


def _read_token(path):
    with open(path, encoding="utf-8") as token_file:
        token = token_file.read().strip()
    if not token:
        raise RuntimeError(f"control token file is empty: {path}")
    return token


def load_or_create_control_token(explicit_token, path, token_factory=None):
    """Return ``(token, source)`` without rotating a generated token.

    An explicit environment value remains authoritative. Otherwise the first
    process to start creates ``path`` with user-only permissions, and later
    starts reuse it. ``O_EXCL`` makes concurrent first starts converge on the
    same file instead of silently choosing different in-memory tokens.
    """

    if explicit_token:
        return explicit_token, "environment"

    try:
        return _read_token(path), "file"
    except FileNotFoundError:
        pass

    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    factory = token_factory or (lambda: secrets.token_urlsafe(24))
    token = factory()
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    try:
        fd = os.open(path, flags, 0o600)
    except FileExistsError:
        return _read_token(path), "file"

    with os.fdopen(fd, "w", encoding="utf-8") as token_file:
        token_file.write(token + "\n")
    return token, "file"


def control_url(host, port, token):
    return f"http://{host}:{port}/?{urlencode({'token': token})}"
