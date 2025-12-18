#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MiniMax TTS (t2a_v2) helper (stdlib-only).

stdin JSON:
{
  "url": "https://api.minimax.io/v1/t2a_v2",
  "headers": {"Authorization": "Bearer ...", "Content-Type": "application/json"},
  "payload": {...},
  "timeoutMs": 30000
}

stdout: audio bytes (binary)
stderr: debug info; on failure prints `DEBUG_FILE=<abs path>`

On error: writes logs/minimax-py-error-<timestamp>.json
"""

from __future__ import annotations

import base64
import json
import os
import re
import sys
import time
import traceback
import urllib.error
import urllib.request
from typing import Any, Dict, Tuple

HEX_RE = re.compile(r"^[0-9a-fA-F]+$")


def _now_ms() -> int:
    return int(time.time() * 1000)


def _ensure_logs_dir() -> str:
    logs_dir = os.path.join(os.getcwd(), "logs")
    os.makedirs(logs_dir, exist_ok=True)
    return logs_dir


def _mask_auth(headers: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(headers or {})
    auth = out.get("Authorization") or out.get("authorization")
    if isinstance(auth, str) and auth.lower().startswith("bearer "):
        tok = auth[7:]
        out["Authorization"] = "Bearer " + (tok[:16] + "鈥?masked)" if len(tok) > 16 else "鈥?masked)")
    return out


def _write_debug_file(data: Dict[str, Any]) -> str:
    logs_dir = _ensure_logs_dir()
    filename = f"minimax-py-error-{_now_ms()}.json"
    full_path = os.path.abspath(os.path.join(logs_dir, filename))
    with open(full_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return full_path


def _read_stdin_json() -> Dict[str, Any]:
    raw = sys.stdin.buffer.read()
    if not raw:
        raise ValueError("stdin is empty (expected JSON)")
    return json.loads(raw.decode("utf-8"))


def _build_opener_from_env() -> urllib.request.OpenerDirector:
    proxies = urllib.request.getproxies()
    return urllib.request.build_opener(urllib.request.ProxyHandler(proxies))


def _http_post_json(url: str, headers: Dict[str, str], payload: Dict[str, Any], timeout_s: float) -> Tuple[int, Dict[str, str], bytes]:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url=url, data=body, method="POST")
    for k, v in headers.items():
        req.add_header(k, v)
    opener = _build_opener_from_env()
    with opener.open(req, timeout=timeout_s) as resp:
        status = getattr(resp, "status", None) or resp.getcode()
        resp_headers = {k.lower(): v for k, v in resp.headers.items()}
        resp_body = resp.read()
        return int(status), resp_headers, resp_body


def _extract_audio_bytes(resp_json: Dict[str, Any]) -> bytes:
    base_resp = resp_json.get("base_resp") or {}
    status_code = base_resp.get("status_code")
    if status_code is not None and status_code != 0:
        status_msg = base_resp.get("status_msg") or "failed"
        raise RuntimeError(f"MiniMax error ({status_code}): {status_msg}")

    data = resp_json.get("data") or {}
    audio_str = data.get("audio")
    if not isinstance(audio_str, str) or not audio_str:
        raise RuntimeError("MiniMax response has no data.audio")

    if HEX_RE.match(audio_str) and (len(audio_str) % 2 == 0):
        return bytes.fromhex(audio_str)
    return base64.b64decode(audio_str)


def main() -> int:
    request_debug: Dict[str, Any] = {}
    try:
        inp = _read_stdin_json()
        url = (inp.get("url") or "").strip()
        headers = inp.get("headers") or {}
        payload = inp.get("payload") or {}
        timeout_ms = int(inp.get("timeoutMs") or 30000)

        if not url:
            raise ValueError("missing url")
        if not isinstance(headers, dict):
            raise ValueError("headers must be object")
        if not isinstance(payload, dict):
            raise ValueError("payload must be object")

        timeout_s = max(1.0, float(timeout_ms) / 1000.0)
        request_debug = {
            "url": url,
            "headers": _mask_auth(headers),
            "payload": payload,
            "timeoutMs": timeout_ms,
        }

        _, resp_headers, resp_body = _http_post_json(
            url=url,
            headers={str(k): str(v) for k, v in headers.items()},
            payload=payload,
            timeout_s=timeout_s,
        )

        content_type = (resp_headers.get("content-type") or "").lower()
        if "application/json" in content_type or resp_body.strip().startswith(b"{"):
            resp_text = resp_body.decode("utf-8", errors="replace")
            resp_json = json.loads(resp_text)
            audio_bytes = _extract_audio_bytes(resp_json)
            sys.stdout.buffer.write(audio_bytes)
            sys.stdout.buffer.flush()
            return 0

        sys.stdout.buffer.write(resp_body)
        sys.stdout.buffer.flush()
        return 0

    except urllib.error.HTTPError as e:
        try:
            body = e.read() if hasattr(e, "read") else b""
        except Exception:
            body = b""
        debug = {
            "cwd": os.getcwd(),
            "request": request_debug,
            "httpError": {"code": getattr(e, "code", None), "reason": str(getattr(e, "reason", ""))},
            "responseBody": body[:8000].decode("utf-8", errors="replace"),
            "trace": traceback.format_exc(),
            "env": {
                "HTTP_PROXY": os.environ.get("HTTP_PROXY") or os.environ.get("http_proxy"),
                "HTTPS_PROXY": os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy"),
            },
        }
        debug_file = _write_debug_file(debug)
        sys.stderr.write(f"DEBUG_FILE={debug_file}\n")
        sys.stderr.write(f"MiniMax PY TTS failed: HTTPError {getattr(e, 'code', 'unknown')}\n")
        sys.stderr.flush()
        return 2
    except Exception as e:
        debug = {
            "cwd": os.getcwd(),
            "request": request_debug,
            "error": str(e),
            "trace": traceback.format_exc(),
            "env": {
                "HTTP_PROXY": os.environ.get("HTTP_PROXY") or os.environ.get("http_proxy"),
                "HTTPS_PROXY": os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy"),
            },
        }
        debug_file = _write_debug_file(debug)
        sys.stderr.write(f"DEBUG_FILE={debug_file}\n")
        sys.stderr.write(f"MiniMax PY TTS failed: {e}\n")
        sys.stderr.flush()
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
