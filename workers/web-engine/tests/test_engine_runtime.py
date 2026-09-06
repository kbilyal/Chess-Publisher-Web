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

FIXTURE_R4 = """012 Chess-Publisher v1.05.00 Stable - Multi-Round Masters
022 Wijk aan Zee
032 NED
042 2026/09/01
052 2026/09/07
062 8
072 8
092 Individual Swiss
102 IA Pavel Votruba
122 90+30
142 7
152 W
162  W 1.0    D 0.5    L 0.0    Z 0.0    P 1.0
182 Chess-Publisher v1.05.00 Stable
001    1 m GM Carlsen, Magnus                   2832 NOR 1503014     1990/11/30  3.0    1    0005 w 1    0002 b 1    0003 w 1
001    2 m GM Caruana, Fabiano                  2805 USA 24116068    1992/07/30  2.0    3    0006 b 1    0001 w 0    0007 b 1
001    3 m GM Nakamura, Hikaru                  2802 USA 2020009     1987/12/09  2.0    2    0007 w 1    0004 b 1    0001 b 0
001    4 m GM Anand, Viswanathan                2751 IND 5000017     1969/12/11  1.5    4    0008 b 1    0003 w 0    0005 b =
001    5 m GM Topalov, Veselin                  2727 BUL 2900084     1975/03/15  1.5    5    0001 b 0    0008 w 1    0004 w =
001    6 m GM Georgiev, Kiril                   2658 BUL 2900025     1965/11/28  1.0    6    0002 w 0    0007 b 0    0008 w 1
001    7 m GM Stefanova, Antoaneta              2568 BUL 2900220     1979/04/19  1.0    7    0003 b 0    0006 w 1    0002 w 0
001    8 m GM Cheparinov, Ivan                  2542 BUL 2905540     1986/11/26  0.0    8    0004 w 0    0005 b 0    0006 b 0
"""


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
        return read_pairing_text(out.read_text(encoding="latin-1", errors="replace"), "direct Gacrux")


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
    assert repairs >= 0
    synced_again, second_repairs = sync_pairing_trf_scores(synced)
    assert synced_again == synced
    assert second_repairs == 0, "desktop score reconciliation must be idempotent after the first normalization"
    print(f"PASS: desktop-compatible TRF score reconciliation is idempotent (initial repairs={repairs})")

    assert_worker_matches_desktop(FIXTURE_R1, 1, 5)
    print("PASS: Web Worker wrapper matches desktop Gacrux on Round 1 fixture")
    assert_worker_matches_desktop(FIXTURE_R4, 4, 7)
    print("PASS: Web Worker wrapper matches desktop Gacrux on multi-round fixture")
    print("Web engine runtime parity: PASS")


if __name__ == "__main__":
    main()
