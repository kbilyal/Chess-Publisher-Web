from __future__ import annotations

from pathlib import Path
import subprocess
import sys
import tempfile

from engine_runtime import GACRUX_VERSION, assert_pairing_trf_history_width, read_pairing_text, run_pairing, sync_pairing_trf_scores

ROOT = Path(__file__).resolve().parents[3]
GACRUX = ROOT / "engine" / "gacrux" / "pairingchecker.py"

FIXTURE_R1 = """012 Chess-Publisher v1.05.00 Stable - Normal Swiss
022 London
032 ENG
042 2026/09/01
052 2026/09/05
062 8
072 8
092 Individual Swiss
102 IA David Sedgwick
122 90+30
142 5
152 W
162  W 1.0    D 0.5    L 0.0    Z 0.0    P 1.0
182 Chess-Publisher v1.05.00 Stable
001    1 m GM Carlsen, Magnus                   2832 NOR 1503014     1990/11/30  0.0    1
001    2 m GM Caruana, Fabiano                  2805 USA 24116068    1992/07/30  0.0    2
001    3 m GM Nakamura, Hikaru                  2802 USA 2020009     1987/12/09  0.0    3
001    4 m GM Anand, Viswanathan                2751 IND 5000017     1969/12/11  0.0    4
001    5 m GM Topalov, Veselin                  2727 BUL 2900084     1975/03/15  0.0    5
001    6 m GM Georgiev, Kiril                   2658 BUL 2900025     1965/11/28  0.0    6
001    7 m GM Stefanova, Antoaneta              2568 BUL 2900220     1979/04/19  0.0    7
001    8 m GM Cheparinov, Ivan                  2542 BUL 2905540     1986/11/26  0.0    8
"""


def build_beta34_player_line(*, start_no: int, name: str, rating: int, fed: str, fide_id: str, birth: str, rank: int, rounds: list[tuple[int, str, str]]) -> str:
    """Mirror beta.34 buildTRFPlayerLine exact one-based field positions."""
    line = [" "] * max(101, 91 + len(rounds) * 10)

    def set_field(start: int, length: int, value: object, right: bool = False) -> None:
        text = str(value if value is not None else "")[:length]
        text = text.rjust(length) if right else text.ljust(length)
        for offset, char in enumerate(text):
            line[start - 1 + offset] = char

    score = 0.0
    for _, _, result in rounds:
        if result in ("1", "+", "F", "U", "W"):
            score += 1.0
        elif result in ("=", "H", "D"):
            score += 0.5

    set_field(1, 3, "001")
    set_field(5, 4, start_no, True)
    set_field(10, 1, "m")
    set_field(11, 3, "GM")
    set_field(15, 33, name)
    set_field(49, 4, rating, True)
    set_field(54, 3, fed.upper()[:3])
    set_field(58, 11, fide_id, True)
    set_field(70, 10, birth)
    set_field(81, 4, f"{score:.1f}", True)
    set_field(86, 4, rank, True)
    for index, (opponent, colour, result) in enumerate(rounds):
        start = 92 + index * 10
        set_field(start, 4, opponent if opponent > 0 else "0000", True if opponent > 0 else False)
        set_field(start + 5, 1, colour if colour in ("w", "b") else "-")
        set_field(start + 7, 1, result[:1])
    return "".join(line)


def build_beta34_multi_round_fixture() -> str:
    players = [
        (1, "Carlsen, Magnus", 2832, "NOR", "1503014", "1990/11/30", [(5, "w", "1"), (2, "b", "1"), (3, "w", "1")]),
        (2, "Caruana, Fabiano", 2805, "USA", "24116068", "1992/07/30", [(6, "b", "1"), (1, "w", "0"), (7, "b", "1")]),
        (3, "Nakamura, Hikaru", 2802, "USA", "2020009", "1987/12/09", [(7, "w", "1"), (4, "b", "1"), (1, "b", "0")]),
        (4, "Anand, Viswanathan", 2751, "IND", "5000017", "1969/12/11", [(8, "b", "1"), (3, "w", "0"), (5, "b", "=")]),
        (5, "Topalov, Veselin", 2727, "BUL", "2900084", "1975/03/15", [(1, "b", "0"), (8, "w", "1"), (4, "w", "=")]),
        (6, "Georgiev, Kiril", 2658, "BUL", "2900025", "1965/11/28", [(2, "w", "0"), (7, "b", "0"), (8, "w", "1")]),
        (7, "Stefanova, Antoaneta", 2568, "BUL", "2900220", "1979/04/19", [(3, "b", "0"), (6, "w", "1"), (2, "w", "0")]),
        (8, "Cheparinov, Ivan", 2542, "BUL", "2905540", "1986/11/26", [(4, "w", "0"), (5, "b", "0"), (6, "b", "0")]),
    ]
    lines = ["012 Chess-Publisher beta.34 exact-column multi-round fixture", "142 7", "152 W", "192 FIDE_DUTCH_2025"]
    for rank, (start_no, name, rating, fed, fide_id, birth, rounds) in enumerate(players, start=1):
        lines.append(build_beta34_player_line(start_no=start_no, name=name, rating=rating, fed=fed, fide_id=fide_id, birth=birth, rank=rank, rounds=rounds))
    return "\r\n".join(lines) + "\r\n"


FIXTURE_R4 = build_beta34_multi_round_fixture()


def direct_gacrux(trf: str, round_no: int, announced_rounds: int) -> list[tuple[int, int]]:
    synced, _ = sync_pairing_trf_scores(trf)
    with tempfile.TemporaryDirectory(prefix="cp-direct-gacrux-") as temp_name:
        temp = Path(temp_name)
        inp = temp / "input.trf"
        out = temp / "output.txt"
        inp.write_bytes(synced.encode("latin-1", errors="replace"))
        command = [
            sys.executable, str(GACRUX), "-p", "-m", "dutch",
            "-i", str(inp), "-o", str(out), "-f", "TRF", "-F", "TXT", "-d", "T",
            "-n", str(round_no), "-N", str(announced_rounds), "-t", "W", "-x", "weighted",
        ]
        result = subprocess.run(command, cwd=GACRUX.parent, text=True, capture_output=True, timeout=20)
        if result.returncode != 0:
            raise AssertionError(f"direct Gacrux failed: {result.stderr}\n{result.stdout}")
        raw = out.read_text(encoding="latin-1", errors="replace")
        if raw.lstrip().startswith("### Error"):
            raise AssertionError(f"direct Gacrux rejected the fixture: {raw}\n{result.stderr}\n{result.stdout}")
        return read_pairing_text(raw, "direct Gacrux")


def assert_worker_matches_desktop(trf: str, round_no: int, announced_rounds: int) -> None:
    expected = direct_gacrux(trf, round_no, announced_rounds)
    worker = run_pairing(trf, round_no, announced_rounds, "W", [])
    actual = read_pairing_text(worker["output"], "Worker Gacrux")
    assert actual == expected, f"Worker/Desktop mismatch: {actual} != {expected}"
    assert worker["engine"] == "Gacrux 1.9.57"
    assert worker["checker"]["state"] == "pass"
    assert worker["independentChecker"]["state"] == "unavailable"


def main() -> None:
    assert GACRUX_VERSION == "1.9.57"
    assert GACRUX.exists(), GACRUX
    version_text = (GACRUX.parent / "version.py").read_text(encoding="utf-8")
    assert '"version": "1.9.57"' in version_text

    assert_pairing_trf_history_width(FIXTURE_R4, 4)
    synced, repairs = sync_pairing_trf_scores(FIXTURE_R4)
    assert synced.endswith("\r\n")
    assert repairs == 0, f"beta.34 exact-column fixture unexpectedly needed {repairs} score repair(s)"
    synced_again, second_repairs = sync_pairing_trf_scores(synced)
    assert synced_again == synced
    assert second_repairs == 0
    print("PASS: beta.34 exact-column multi-round TRF is score-stable")

    assert_worker_matches_desktop(FIXTURE_R1, 1, 5)
    print("PASS: Web Worker wrapper matches desktop Gacrux on Round 1 fixture")
    assert_worker_matches_desktop(FIXTURE_R4, 4, 7)
    print("PASS: Web Worker wrapper matches desktop Gacrux on beta.34 exact-column multi-round fixture")
    print("Web engine runtime parity: PASS")


if __name__ == "__main__":
    main()
