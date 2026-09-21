#!/usr/bin/env python3
"""Persistent JSONL sidecar for recommendation-only Needle 3 routing."""

from __future__ import annotations

import contextlib
import hashlib
import json
import os
import sys
from pathlib import Path
from typing import Any

os.environ.setdefault("NEEDLE_TELEMETRY", "0")
os.environ.setdefault("DO_NOT_TRACK", "1")

# Windows pipes otherwise inherit the active ANSI code page. WSR speaks UTF-8 JSONL.
for stream in (sys.stdin, sys.stdout, sys.stderr):
    reconfigure = getattr(stream, "reconfigure", None)
    if reconfigure is not None:
        reconfigure(encoding="utf-8", errors="strict")

try:
    import needle  # type: ignore
except Exception as exc:  # pragma: no cover - host without Needle
    needle = None
    _IMPORT_ERROR = f"{type(exc).__name__}: {exc}"
else:
    _IMPORT_ERROR = None

_agent: Any = None
_fingerprint: str | None = None


def _catalog_fingerprint(tools: list[dict[str, Any]]) -> str:
    encoded = json.dumps(
        tools,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _index_path(base: str | None, fingerprint: str) -> str | None:
    if not base:
        return None
    raw = Path(base)
    raw.parent.mkdir(parents=True, exist_ok=True)
    suffix = raw.suffix
    name = (
        f"{raw.stem}-{fingerprint[:12]}{suffix}"
        if suffix
        else f"{raw.name}-{fingerprint[:12]}"
    )
    return str(raw.with_name(name))


def _get_agent(tools: list[dict[str, Any]], tool_index_path: str | None):
    global _agent, _fingerprint

    fingerprint = _catalog_fingerprint(tools)
    if _agent is None or _fingerprint != fingerprint:
        kwargs: dict[str, Any] = {
            "tools": tools,
            "generation": 3,
            "auto_date": False,
        }
        scoped_index = _index_path(tool_index_path, fingerprint)
        if scoped_index:
            kwargs["tool_index_path"] = scoped_index

        # Keep stdout reserved for protocol JSONL even if the package logs.
        with contextlib.redirect_stdout(sys.stderr):
            _agent = needle.Needle(**kwargs)
        _fingerprint = fingerprint
    else:
        with contextlib.redirect_stdout(sys.stderr):
            _agent.reset()
    return _agent


def _normalise_calls(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    result: list[dict[str, Any]] = []
    for call in value:
        if not isinstance(call, dict):
            continue
        name = call.get("name")
        args = call.get("arguments")
        if isinstance(name, str) and isinstance(args, dict):
            result.append({"name": name, "arguments": args})
    return result


def _handle(message: dict[str, Any]) -> dict[str, Any]:
    request_id = message.get("id")
    if needle is None:
        return {
            "id": request_id,
            "ok": False,
            "error": f"cactus-needle import failed: {_IMPORT_ERROR}",
        }

    query = message.get("query")
    tools = message.get("tools")
    if not isinstance(query, str) or not query.strip():
        return {
            "id": request_id,
            "ok": False,
            "error": "query must be a non-empty string",
        }
    if not isinstance(tools, list) or not tools:
        return {
            "id": request_id,
            "ok": False,
            "error": "tools must be a non-empty list",
        }

    try:
        agent = _get_agent(tools, message.get("tool_index_path"))
        with contextlib.redirect_stdout(sys.stderr):
            response = agent.complete(query, max_new_tokens=256)
        if not isinstance(response, dict):
            raise TypeError("Needle complete() did not return a dict")

        return {
            "id": request_id,
            "ok": bool(response.get("success", True)),
            "error": response.get("error"),
            "function_calls": _normalise_calls(response.get("function_calls")),
            "suppressed_calls": _normalise_calls(response.get("suppressed_calls")),
            "confidence": response.get("confidence"),
            "reasoning": response.get("reasoning"),
            "escalate": bool(response.get("escalate", False)),
            "prefill_tps": response.get("prefill_tps"),
            "decode_tps": response.get("decode_tps"),
            "peak_ram_mb": response.get("peak_ram_mb"),
        }
    except Exception as exc:
        return {
            "id": request_id,
            "ok": False,
            "error": f"{type(exc).__name__}: {exc}",
        }


def main() -> int:
    for raw in sys.stdin:
        raw = raw.strip()
        if not raw:
            continue
        try:
            message = json.loads(raw)
            if not isinstance(message, dict):
                raise TypeError("request must be a JSON object")
            response = _handle(message)
        except Exception as exc:
            response = {
                "id": None,
                "ok": False,
                "error": f"{type(exc).__name__}: {exc}",
            }
        sys.stdout.write(
            json.dumps(response, ensure_ascii=False, separators=(",", ":")) + "\n"
        )
        sys.stdout.flush()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
