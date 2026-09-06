"""Serverless runtime wrapper for the protected upstream Gacrux 1.9.57 source.

The upstream files are copied from engine/gacrux into this worker bundle at CI/deploy
time. They are never modified here. The wrapper calls the Python entry-point classes
directly because Cloudflare Python Workers do not provide subprocess execution.
"""
from __future__ import annotations

from dataclasses import dataclass
import contextlib
import io
import math
from pathlib import Path
import re
import sys
import tempfile
from typing import Any, Iterable

GACRUX_VERSION = "1.9.57"
PAIRING_RULES = "FIDE Dutch System — Gacrux 1.9.57 weighted"
TIEBREAK_RULES = "2026-03-01"
MAX_REQUEST_BYTES = 25 * 1024 * 1024
PAIRING_METHOD_RECORD = "192 FIDE_DUTCH_2025"
_DUTCH_METHOD_CODES = {"FIDE_DUTCH_2017", "FIDE_DUTCH_2025", "FIDE_DUTCH"}


class EngineRuntimeError(RuntimeError):
    pass


def _lines(trf: str) -> list[str]:
    return re.split(r"\r?\n", trf.rstrip("\r\n"))


def assert_pairing_trf_history_width(trf: str, pairing_round: int) -> None:
    completed_rounds = max(0, int(pairing_round) - 1)
    if completed_rounds == 0:
        return
    required_length = 91 + 10 * completed_rounds
    player_lines = [line for line in _lines(trf) if line.startswith("001")]
    if len(player_lines) < 2:
        raise EngineRuntimeError("The pairing TRF does not contain a valid player list.")
    short: list[int] = []
    for line in player_lines:
        if len(line) >= required_length:
            continue
        number_text = line[3:8].strip() if len(line) >= 8 else "0"
        try:
            number = int(number_text or "0")
        except ValueError:
            number = 0
        short.append(number)
    if short:
        sample = ", ".join(str(x) for x in short[:8])
        raise EngineRuntimeError(
            f"Round {pairing_round} requires {completed_rounds} complete historical round record(s) "
            f"for every player. Missing history for Pairing No.: {sample}."
        )


def sync_pairing_trf_scores(trf: str) -> tuple[str, int]:
    lines = _lines(trf)
    pab_points = 1.0
    for record in lines:
        if not record.startswith("162"):
            continue
        match = re.search(r"(?:^|\s)P\s+([0-9]+(?:[\.,][0-9]+)?)", record, flags=re.I)
        if match:
            try:
                pab_points = float(match.group(1).replace(",", "."))
            except ValueError:
                pab_points = 1.0
        break

    repairs = 0
    repaired: list[str] = []
    for line in lines:
        if not line.startswith("001") or len(line) <= 91:
            repaired.append(line)
            continue
        history = line[91:]
        score = 0.0
        for offset in range(0, len(history), 10):
            if offset + 9 >= len(history):
                break
            code = history[offset + 7]
            if code in ("F", "U"):
                score += pab_points
            elif code in ("1", "+", "W"):
                score += 1.0
            elif code in ("=", "H", "D"):
                score += 0.5
        score_text = f"{score:4.1f}"
        if len(line) >= 84 and line[80:84] != score_text:
            line = line[:80] + score_text + line[84:]
            repairs += 1
        repaired.append(line)
    return "\r\n".join(repaired) + "\r\n", repairs


def normalize_pairing_trf_method(trf: str) -> tuple[str, bool]:
    """Canonicalize the temporary Worker pairing TRF as FIDE Dutch.

    The production Web pairing route is intentionally Dutch-only. Desktop Gacrux is
    invoked with ``-m dutch``; this record is a second, input-level guard so the
    in-process Cloudflare runtime cannot fall back to a stale/empty parsed method.
    The protected upstream source and the user's persisted/exported TRF are untouched.
    """
    source = _lines(trf)
    normalized: list[str] = []
    found = False
    changed = False
    for line in source:
        if re.match(r"^192(?:\s|$)", line):
            method = line[3:].strip().upper()
            if method and method not in _DUTCH_METHOD_CODES:
                raise EngineRuntimeError(
                    f"Pairing TRF declares unsupported method '{method}'. "
                    "The Web Gacrux route supports FIDE Dutch System only."
                )
            if not found:
                normalized.append(PAIRING_METHOD_RECORD)
                found = True
                changed = changed or line.strip() != PAIRING_METHOD_RECORD
            else:
                changed = True
            continue
        normalized.append(line)

    if not found:
        insert_at = next((index for index, line in enumerate(normalized) if line.startswith("001")), len(normalized))
        normalized.insert(insert_at, PAIRING_METHOD_RECORD)
        changed = True

    return "\r\n".join(normalized) + "\r\n", changed


def _raise_gacrux_text_error(text: str, context: str) -> None:
    lines = [line.strip() for line in re.split(r"\r?\n", text) if line.strip()]
    if not lines:
        return
    match = re.fullmatch(r"###\s*Error\s+(\d+)\s*", lines[0], flags=re.I)
    if not match:
        return
    code = match.group(1)
    details = " ".join(lines[1:]).strip()
    suffix = f": {details}" if details else "."
    raise EngineRuntimeError(f"{context} rejected the pairing input (Error {code}){suffix}")


def read_pairing_text(text: str, context: str = "Gacrux") -> list[tuple[int, int]]:
    _raise_gacrux_text_error(text, context)
    lines = [line.strip() for line in re.split(r"\r?\n", text) if line.strip()]
    if len(lines) < 2:
        raise EngineRuntimeError(f"{context} returned no pairing.")
    try:
        pair_count = int(lines[0])
    except ValueError as exc:
        raise EngineRuntimeError(f"{context} returned an unreadable pairing count: {lines[0]}") from exc
    if pair_count < 1:
        raise EngineRuntimeError(f"{context} returned an unreadable pairing count: {lines[0]}")
    if len(lines) < pair_count + 1:
        raise EngineRuntimeError(f"{context} returned {len(lines) - 1} pair line(s); {pair_count} were expected.")
    result: list[tuple[int, int]] = []
    for line in lines[1 : pair_count + 1]:
        match = re.fullmatch(r"\s*(\d+)\s+(\d+)\s*", line)
        if not match:
            raise EngineRuntimeError(f"{context} returned an unreadable pair line: {line}")
        result.append((int(match.group(1)), int(match.group(2))))
    return result


def format_pairing_text(pairs: Iterable[tuple[int, int]]) -> str:
    one = list(pairs)
    return "\r\n".join([str(len(one)), *[f"{w} {b}" for w, b in one]])


def _run_common_main(class_name: str, argv: list[str], output_path: Path) -> tuple[int, str, str]:
    if class_name == "pairingchecker":
        from pairingchecker import pairingchecker as engine_class
    elif class_name == "tiebreakchecker":
        from tiebreakchecker import tiebreakchecker as engine_class
    else:
        raise EngineRuntimeError(f"Unsupported Gacrux entry point: {class_name}")

    old_argv = sys.argv[:]
    stdout = io.StringIO()
    stderr = io.StringIO()
    code = 1
    try:
        sys.argv = argv
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            instance = engine_class()
            if class_name == "pairingchecker":
                upstream_read_command_line = instance.read_command_line

                def read_command_line_with_worker_dutch_lock():
                    result = upstream_read_command_line()
                    if not isinstance(instance.params, dict):
                        raise EngineRuntimeError("Gacrux pairing parameters were not initialized.")
                    # Cloudflare runs the upstream class in-process rather than as the
                    # desktop executable. Reassert the exact desktop `-m dutch`
                    # contract after argparse so method resolution cannot drift to an
                    # empty/stale TRF method and trigger upstream Error 510.
                    instance.params["method"] = ["dutch"]
                    return result

                instance.read_command_line = read_command_line_with_worker_dutch_lock
            try:
                returned = instance.common_main()
                code = int(returned or 0)
            except SystemExit as exc:
                code = int(exc.code or 0)
    finally:
        sys.argv = old_argv
    if not output_path.exists():
        details = (stderr.getvalue() + "\n" + stdout.getvalue()).strip()
        raise EngineRuntimeError(f"Gacrux produced no output (exit={code}). {details}".strip())
    return code, stdout.getvalue(), stderr.getvalue()


def run_pairing(trf: str, pairing_round: int, announced_rounds: int, top_color: str = "W", unpaired: Iterable[int] | None = None) -> dict[str, Any]:
    pairing_round = int(pairing_round)
    announced_rounds = int(announced_rounds)
    if pairing_round < 1:
        raise EngineRuntimeError("Pairing round must be positive.")
    if announced_rounds < pairing_round:
        raise EngineRuntimeError("Announced round count cannot be lower than the requested pairing round.")
    if not trf.strip():
        raise EngineRuntimeError("Gacrux received an empty TRF.")
    assert_pairing_trf_history_width(trf, pairing_round)
    synced_trf, repairs = sync_pairing_trf_scores(trf)
    synced_trf, method_repaired = normalize_pairing_trf_method(synced_trf)
    colour = "B" if str(top_color).upper() == "B" else "W"
    unpaired_numbers = sorted({int(x) for x in (unpaired or []) if int(x) > 0})

    def one_run() -> list[tuple[int, int]]:
        with tempfile.TemporaryDirectory(prefix="cp-gacrux-") as temp_name:
            temp = Path(temp_name)
            input_path = temp / "tournament.trf"
            output_path = temp / "pairing.txt"
            input_path.write_bytes(synced_trf.encode("latin-1", errors="replace"))
            argv = ["pairingchecker.py", "-p", "-m", "dutch", "-i", str(input_path), "-o", str(output_path), "-f", "TRF", "-F", "TXT", "-d", "T", "-n", str(pairing_round), "-N", str(announced_rounds), "-t", colour, "-x", "weighted"]
            if unpaired_numbers:
                argv.extend(["-u", *[str(x) for x in unpaired_numbers]])
            code, stdout, stderr = _run_common_main("pairingchecker", argv, output_path)
            raw = output_path.read_text(encoding="latin-1", errors="replace")
            pairs = read_pairing_text(raw, "Gacrux 1.9.57")
            if code != 0:
                details = (stderr + "\n" + stdout).strip()
                raise EngineRuntimeError(f"Gacrux pairing failed (exit={code}). {details}".strip())
            return pairs

    pairs = one_run()
    verify_pairs = one_run()
    if pairs != verify_pairs:
        raise EngineRuntimeError("Gacrux deterministic verification failed: repeated generation produced a different pairing.")

    return {
        "ok": True,
        "output": format_pairing_text(pairs),
        "engine": f"Gacrux {GACRUX_VERSION}",
        "version": GACRUX_VERSION,
        "rules": PAIRING_RULES,
        "scoreRepairs": repairs,
        "methodCanonicalized": method_repaired,
        "checker": {"available": True, "ok": True, "check": True, "state": "pass", "checker": "Gacrux deterministic regeneration", "version": GACRUX_VERSION, "round": pairing_round, "message": "Gacrux repeated the same pairing from the same protected TRF input."},
        "independentChecker": {"available": False, "ok": False, "check": None, "state": "unavailable", "checker": "bbpPairings", "version": "6.0.0", "round": pairing_round, "message": "The optional independent BBP native checker is not available inside the WebAssembly Worker runtime; Gacrux deterministic verification completed."},
    }


def get_trf26_tie_break_descriptors(trf: str) -> list[str]:
    matching = [line for line in _lines(trf) if re.match(r"^(202|212)\s+", line)]
    if len(matching) != 1:
        raise EngineRuntimeError("TRF26 exchange checker requires exactly one record 202 or 212.")
    line = matching[0]
    code = line[:3]
    items = [item.strip() for item in line[4:].strip().split(",") if item.strip()]
    if code == "212":
        if not items or items[0].upper() != "PTS":
            raise EngineRuntimeError("TRF26 record 212 must start with PTS.")
    else:
        items.insert(0, "PTS")
    return list(dict.fromkeys(items))


def get_expected_ranks_from_trf(trf: str) -> dict[int, int]:
    result: dict[int, int] = {}
    for line in _lines(trf):
        if not line.startswith("001") or len(line) < 89:
            continue
        try:
            start_no = int(line[4:8].strip() or "0")
            rank = int(line[85:89].strip() or "0")
        except ValueError:
            continue
        if start_no > 0 and rank > 0:
            result[start_no] = rank
    return result


@dataclass
class TieRow:
    rank: int
    start_no: int
    values: dict[str, str]


def parse_tiebreak_text(text: str) -> tuple[list[str], list[TieRow], bool | None]:
    lines = re.split(r"\r?\n", text)
    headers: list[str] = []
    header_index = -1
    check: bool | None = None
    for index, line in enumerate(lines):
        match = re.fullmatch(r"Check:\s*(True|False)\s*", line)
        if match:
            check = match.group(1) == "True"
        if header_index < 0 and re.match(r"^(Rank|StartNo)\t(StartNo|Rank)(\t|$)", line):
            header_index = index
            headers = line.split("\t")
    if header_index < 0:
        raise EngineRuntimeError("Tie-Break Checker output has no Rank/StartNo header.")
    try:
        rank_index = headers.index("Rank")
        start_index = headers.index("StartNo")
    except ValueError as exc:
        raise EngineRuntimeError("Tie-Break Checker output header is incomplete.") from exc
    rows: list[TieRow] = []
    for line in lines[header_index + 1 :]:
        if not line.strip() or line.startswith("Check:"):
            continue
        parts = line.split("\t")
        if len(parts) < 2 or max(rank_index, start_index) >= len(parts):
            continue
        try:
            rank = int(parts[rank_index].strip())
            start = int(parts[start_index].strip())
        except ValueError:
            continue
        values = {headers[j]: parts[j].strip() for j in range(2, min(len(headers), len(parts)))}
        rows.append(TieRow(rank=rank, start_no=start, values=values))
    if not rows:
        raise EngineRuntimeError("Tie-Break Checker output contains no competitor rows.")
    return headers, rows, check


def run_tiebreak(trf: str, round_no: int, mode: str, tie_breaks: list[str], expected: list[dict[str, Any]], use_trf_descriptors: bool = False, unrated_rating: int | None = None) -> dict[str, Any]:
    round_no = int(round_no)
    if round_no < 1:
        raise EngineRuntimeError("Tie-Break Checker requires at least one completed round.")
    if not trf.strip():
        raise EngineRuntimeError("Tie-Break Checker received an empty TRF.")
    requested = get_trf26_tie_break_descriptors(trf) if use_trf_descriptors else [str(x).strip() for x in tie_breaks if str(x).strip()]
    requested = list(dict.fromkeys(requested))
    if not requested or requested[0].upper() != "PTS":
        requested = ["PTS", *[x for x in requested if x.upper() != "PTS"]]
    if unrated_rating is not None:
        unrated_rating = int(unrated_rating)
        if unrated_rating <= 0 or unrated_rating > 4000:
            raise EngineRuntimeError(f"Invalid Gacrux unrated substitute rating '{unrated_rating}'.")

    with tempfile.TemporaryDirectory(prefix="cp-gacrux-tb-") as temp_name:
        temp = Path(temp_name)
        input_path = temp / "tiebreak-input.trf"
        output_path = temp / "tiebreak-output.txt"
        input_path.write_bytes(trf.encode("latin-1", errors="replace"))
        argv = ["tiebreakchecker.py", "-i", str(input_path), "-o", str(output_path), "-f", "TRF", "-F", "TXT", "-n", str(round_no), "-c", "-r", "-d", "T"]
        argv.append("-p" if mode == "rr" else "-s")
        if not use_trf_descriptors:
            argv.extend(["-t", *requested])
            if unrated_rating is not None:
                argv.extend(["-u", str(unrated_rating)])
        code, stdout, stderr = _run_common_main("tiebreakchecker", argv, output_path)
        text = output_path.read_text(encoding="latin-1", errors="replace")
        if code not in (0, 1):
            details = (stderr + "\n" + stdout).strip()
            raise EngineRuntimeError(f"Tie-Break Checker failed (exit={code}). {details}".strip())

    _, rows, check = parse_tiebreak_text(text)
    by_start = {row.start_no: row for row in rows}
    trf_ranks = get_expected_ranks_from_trf(trf)
    expected_rows = list(expected or [])
    if not expected_rows:
        expected_rows = [{"startNo": key, "rank": value, "values": None} for key, value in trf_ranks.items()]
    expected_rows.sort(key=lambda row: (int(row.get("rank", 0)), int(row.get("startNo", 0))))
    mismatches: list[str] = []
    last_checker_rank = 0
    for exp in expected_rows:
        start_no = int(exp.get("startNo", 0))
        checker_row = by_start.get(start_no)
        if checker_row is None:
            mismatches.append(f"StartNo {start_no} is missing from the Gacrux output.")
            continue
        if last_checker_rank > 0 and checker_row.rank < last_checker_rank:
            mismatches.append(f"Rank-group order differs at StartNo {start_no}: Gacrux rank group {checker_row.rank} follows group {last_checker_rank} in Chess-Publisher order.")
        if checker_row.rank > last_checker_rank:
            last_checker_rank = checker_row.rank
        values = exp.get("values")
        if isinstance(values, dict):
            for descriptor, expected_raw in values.items():
                try:
                    expected_number = float(expected_raw)
                except (TypeError, ValueError):
                    continue
                raw_value = checker_row.values.get(str(descriptor))
                if raw_value is None:
                    mismatches.append(f"StartNo {start_no}: Gacrux output is missing tie-break value {descriptor}.")
                    continue
                try:
                    actual_number = float(raw_value)
                except ValueError:
                    mismatches.append(f"StartNo {start_no}: Gacrux returned non-numeric {descriptor} value '{raw_value}'.")
                    continue
                if math.fabs(actual_number - expected_number) > 0.011:
                    mismatches.append(f"StartNo {start_no}: {descriptor} Chess-Publisher={expected_number}, Gacrux={actual_number}")
    if len(rows) != len(expected_rows):
        mismatches.append(f"Competitor count differs: Chess-Publisher {len(expected_rows)}, Gacrux {len(rows)}")

    ok = not mismatches
    rules = "TRF26-212 / 2026-03-01" if use_trf_descriptors else TIEBREAK_RULES
    if ok:
        message = (f"Gacrux Tie-Break Checker {GACRUX_VERSION} computed the same tie-break values/rank-group order through Round {round_no}. Exact ties may be resolved by Chess-Publisher's persistent drawing of lots." if check is False else f"Gacrux Tie-Break Checker {GACRUX_VERSION} independently computed the same tie-break values and ranking through Round {round_no}.")
    else:
        message = f"Tie-break validation differs through Round {round_no}. " + "; ".join(mismatches[:8])
    return {"ok": True, "available": True, "state": "pass" if ok else "fail", "check": check, "checker": "Gacrux Tie-Break Checker", "version": GACRUX_VERSION, "round": round_no, "rules": rules, "message": message, "mismatches": mismatches, "output": text}
