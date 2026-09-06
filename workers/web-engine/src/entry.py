from __future__ import annotations

import asyncio
import hashlib
import time
from urllib.parse import urlparse

import aiohttp
from workers import Response, WorkerEntrypoint

from engine_runtime import EngineRuntimeError, GACRUX_VERSION, MAX_REQUEST_BYTES, run_pairing, run_tiebreak

_ENGINE_LOCK = asyncio.Lock()
_AUTH_CACHE: dict[str, float] = {}
_AUTH_CACHE_TTL = 60.0


def _header(request, name: str) -> str:
    try:
        return str(request.headers.get(name) or "").strip()
    except Exception:
        return ""


def _cors_headers(origin: str, allowed_origin: str) -> dict[str, str]:
    headers = {"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"}
    if origin == allowed_origin:
        headers.update({
            "Access-Control-Allow-Origin": allowed_origin,
            "Access-Control-Allow-Credentials": "false",
            "Access-Control-Allow-Headers": "Authorization, Content-Type",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Vary": "Origin",
        })
    return headers


def _json(payload: dict, status: int, origin: str, allowed_origin: str):
    return Response.json(payload, status=status, headers=_cors_headers(origin, allowed_origin))


async def _validate_token(token: str, hub_api_base: str) -> tuple[bool, bool]:
    if not token:
        return False, True
    cache_key = hashlib.sha256(token.encode("utf-8")).hexdigest()
    now = time.monotonic()
    if _AUTH_CACHE.get(cache_key, 0.0) > now:
        return True, True
    timeout = aiohttp.ClientTimeout(total=7)
    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(
                hub_api_base.rstrip("/") + "/api/v1/cloud/workspace",
                headers={"Accept": "application/json", "Authorization": f"Bearer {token}"},
            ) as response:
                if response.status not in (200, 204):
                    return False, True
    except Exception:
        return False, False
    _AUTH_CACHE[cache_key] = now + _AUTH_CACHE_TTL
    if len(_AUTH_CACHE) > 500:
        for key, until in list(_AUTH_CACHE.items()):
            if until <= now:
                _AUTH_CACHE.pop(key, None)
    return True, True


class Default(WorkerEntrypoint):
    async def fetch(self, request):
        origin = _header(request, "Origin")
        allowed_origin = str(self.env.WEB_ORIGIN)
        hub_api_base = str(self.env.HUB_API_BASE)
        path = urlparse(str(request.url)).path
        method = str(request.method).upper()

        if method == "OPTIONS":
            if origin != allowed_origin:
                return _json({"ok": False, "error": "origin_not_allowed"}, 403, origin, allowed_origin)
            return Response("", status=204, headers=_cors_headers(origin, allowed_origin))

        if path == "/api/engine/health" and method == "GET":
            return _json({"ok": True, "service": "Chess-Publisher Web Engine", "engine": "Gacrux", "version": GACRUX_VERSION}, 200, origin, allowed_origin)

        if origin and origin != allowed_origin:
            return _json({"ok": False, "error": "origin_not_allowed"}, 403, origin, allowed_origin)

        authorization = _header(request, "Authorization")
        token = authorization[7:].strip() if authorization.lower().startswith("bearer ") else ""
        authenticated, auth_service_ok = await _validate_token(token, hub_api_base)
        if not authenticated:
            status = 401 if auth_service_ok else 503
            error = "organizer_auth_required" if auth_service_ok else "organizer_auth_unavailable"
            message = "A valid Organizer Token is required for Web engine operations." if auth_service_ok else "Organizer authentication is temporarily unavailable. Pairing was not attempted."
            return _json({"ok": False, "error": error, "message": message}, status, origin, allowed_origin)

        if path == "/api/engine/capabilities" and method == "GET":
            return _json({
                "ok": True,
                "pairing": {"ready": True, "engine": "Gacrux", "version": GACRUX_VERSION, "authoritative": True},
                "tieBreak": {"ready": True, "checker": "Gacrux Tie-Break Checker", "version": GACRUX_VERSION, "authoritative": True},
                "independentPairingChecker": {"ready": False, "present": False, "verified": False, "checker": "bbpPairings", "version": "6.0.0", "message": "Optional native BBP checker is unavailable in the WebAssembly Worker runtime."},
            }, 200, origin, allowed_origin)

        if path in ("/api/engine/pairing-checker/status", "/api/engine/pairing-checker/install"):
            return _json({
                "ok": True,
                "ready": False,
                "present": False,
                "verified": False,
                "checker": "bbpPairings",
                "version": "6.0.0",
                "message": "Optional native BBP checker is not available in the WebAssembly Worker runtime. Gacrux deterministic verification remains active.",
            }, 200, origin, allowed_origin)

        if path in ("/api/engine/tiebreak-checker/status", "/api/engine/tiebreak-checker/install"):
            return _json({
                "ok": True,
                "ready": True,
                "present": True,
                "verified": True,
                "checker": "Gacrux Tie-Break Checker",
                "version": GACRUX_VERSION,
                "message": "Protected Gacrux 1.9.57 Python source is active in the Web engine Worker.",
            }, 200, origin, allowed_origin)

        if method != "POST":
            return _json({"ok": False, "error": "not_found"}, 404, origin, allowed_origin)

        content_length = _header(request, "Content-Length")
        try:
            if content_length and int(content_length) > MAX_REQUEST_BYTES:
                return _json({"ok": False, "error": "request_too_large"}, 413, origin, allowed_origin)
        except ValueError:
            pass

        try:
            body = await request.json()
        except Exception:
            return _json({"ok": False, "error": "invalid_json"}, 400, origin, allowed_origin)

        try:
            if path == "/api/engine/pair":
                trf = str(body.get("trf") or "")
                if len(trf.encode("utf-8", errors="replace")) > MAX_REQUEST_BYTES:
                    raise EngineRuntimeError("The pairing request is too large.")
                async with _ENGINE_LOCK:
                    result = run_pairing(
                        trf=trf,
                        pairing_round=int(body.get("round") or 0),
                        announced_rounds=int(body.get("rounds") or 0),
                        top_color=str(body.get("topColor") or "W"),
                        unpaired=body.get("unpaired") or [],
                    )
                return _json(result, 200, origin, allowed_origin)

            if path in ("/api/engine/tiebreak-checker/check", "/api/engine/trf26-exchange/check"):
                trf = str(body.get("trf") or "")
                if len(trf.encode("utf-8", errors="replace")) > MAX_REQUEST_BYTES:
                    raise EngineRuntimeError("The tie-break checker request is too large.")
                use_trf = path.endswith("trf26-exchange/check")
                async with _ENGINE_LOCK:
                    result = run_tiebreak(
                        trf=trf,
                        round_no=int(body.get("round") or 0),
                        mode=str(body.get("mode") or "swiss"),
                        tie_breaks=[] if use_trf else list(body.get("tieBreaks") or []),
                        expected=list(body.get("expected") or []),
                        use_trf_descriptors=use_trf,
                        unrated_rating=body.get("unratedRating"),
                    )
                if use_trf:
                    result["source"] = "TRF26-202-212"
                return _json(result, 200, origin, allowed_origin)

            return _json({"ok": False, "error": "not_found"}, 404, origin, allowed_origin)
        except EngineRuntimeError as exc:
            return _json({"ok": False, "error": "engine_error", "message": str(exc)}, 422, origin, allowed_origin)
        except Exception:
            return _json({"ok": False, "error": "engine_runtime_error", "message": "Gacrux Web engine failed. No pairing/check result was committed."}, 500, origin, allowed_origin)
