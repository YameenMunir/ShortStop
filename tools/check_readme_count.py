"""
Check that README.md states the number of automated checks the tests ran.

    python tests/run_tests.py > test-output.txt
    python tools/check_readme_count.py test-output.txt

Exits with an error naming the right number when the README is out of date.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
README = ROOT / "README.md"


def main():
    if len(sys.argv) != 2:
        sys.exit("usage: python tools/check_readme_count.py <test output file>")
    output = Path(sys.argv[1]).read_text(encoding="utf-8")
    match = re.search(r"^(\d+)/(\d+) checks passed$", output, re.M)
    if not match or match.group(1) != match.group(2):
        sys.exit("No passing '<n>/<n> checks passed' line in the test output, so there's no count to compare.")
    expected = f"{int(match.group(2)):,}"

    # "and 1,715\n  automated checks" and "# 1,715 checks in headless ...".
    stated = re.findall(r"(\d[\d,]*)\s+(?:automated\s+)?checks\b", README.read_text(encoding="utf-8"))
    if not stated:
        sys.exit("README.md doesn't state a number of checks any more; update tools/check_readme_count.py.")
    wrong = sorted({number for number in stated if number != expected})
    if wrong:
        print(
            f"::error file=README.md::README.md says {' and '.join(wrong)} checks, but the tests ran {expected}. "
            f"Update every mention to {expected}."
        )
        sys.exit(1)
    print(f"README.md states the right number of checks ({expected}).")


if __name__ == "__main__":
    main()
