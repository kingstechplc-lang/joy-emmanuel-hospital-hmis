#!/usr/bin/env python3
# =====================================================================
# fix-duplicate-classnames.py
#
# Merges adjacent duplicate `className="..."` attributes on the same
# JSX element into a single `className="A B"` attribute.
#
# Background:
#   An earlier script added `className="text-white"` to DialogTitle
#   elements but did not merge with the existing `className="..."`
#   attribute, producing JSX like:
#     <DialogTitle className="text-white" className="capitalize">...
#   This is invalid JSX (TS17001: JSX elements cannot have multiple
#   attributes with the same name) and the second className is
#   silently dropped by React.  The visible effect: capitalize / flex
#   layout / icon gaps are missing.
# =====================================================================

import os
import re

ROOT = "/home/z/my-project/src/components/views"

# Match `className="A" className="B"` (with optional whitespace between).
# Capture the two values.
DUP_CLASSNAME_RE = re.compile(
    r'className\s*=\s*"([^"]*)"\s+className\s*=\s*"([^"]*)"'
)


def process_file(path: str) -> int:
    with open(path, "r", encoding="utf-8") as f:
        src = f.read()
    new_src = DUP_CLASSNAME_RE.sub(lambda m: f'className="{m.group(1)} {m.group(2)}"', src)
    if new_src != src:
        with open(path, "w", encoding="utf-8") as f:
            f.write(new_src)
        return src.count('className="text-white" className="')
    return 0


def main():
    total = 0
    for dirpath, _, filenames in os.walk(ROOT):
        for fn in filenames:
            if not fn.endswith(".tsx"):
                continue
            path = os.path.join(dirpath, fn)
            n = process_file(path)
            if n > 0:
                total += n
                print(f"{path}: {n} duplicate className merged")
    print(f"\nDone. Merged {total} duplicate className attributes.")


if __name__ == "__main__":
    main()
