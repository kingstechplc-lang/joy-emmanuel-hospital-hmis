#!/usr/bin/env python3
# =====================================================================
# cleanup-dialog-max-height.py
#
# Strips leftover `max-h-[NNvh]` from DialogContent className strings
# after the dialog-size migration.  The size preset now owns the
# viewport-aware max-height, so the caller's `max-h-[NNvh]` is redundant
# (and could conflict if the caller picked a smaller value than the
# preset — e.g. caller said `max-h-[80vh]` but size="2xl" provides
# `max-h-[94vh]`; Tailwind last-wins ordering is non-deterministic
# across builds when both have the same specificity, so we strip the
# caller's value and trust the preset).
# =====================================================================

import os
import re

ROOT = "/home/z/my-project/src/components/views"


def find_dialog_content_tags(src: str):
    n = len(src)
    i = 0
    while i < n:
        m = re.search(r"<DialogContent\b", src[i:])
        if not m:
            return
        start = i + m.start()
        j = start + len("<DialogContent")
        brace_depth = 0
        in_string = None
        end_pos = None
        while j < n:
            ch = src[j]
            if in_string:
                if ch == "\\":
                    j += 2
                    continue
                if ch == in_string:
                    in_string = None
                j += 1
                continue
            if ch in ('"', "'", "`"):
                in_string = ch
                j += 1
                continue
            if ch == "{":
                brace_depth += 1
                j += 1
                continue
            if ch == "}":
                if brace_depth > 0:
                    brace_depth -= 1
                j += 1
                continue
            if brace_depth == 0:
                if ch == "/" and j + 1 < n and src[j + 1] == ">":
                    end_pos = j + 2
                    break
                if ch == ">":
                    end_pos = j + 1
                    break
            j += 1
        if end_pos is None:
            return
        yield (start, end_pos, src[start:end_pos])
        i = end_pos


def process_file(path: str) -> int:
    with open(path, "r", encoding="utf-8") as f:
        src = f.read()
    tags = list(find_dialog_content_tags(src))
    if not tags:
        return 0
    new_src = src
    changes = 0
    for start, end, tag_text in reversed(tags):
        # Only process tags that have size=
        if not re.search(r'\bsize\s*=\s*"', tag_text):
            continue
        # Find className="..." in this tag
        m = re.search(r'''className\s*=\s*("([^"]*)"|'([^']*)')''', tag_text)
        if not m:
            continue
        cn_value = m.group(2) if m.group(2) is not None else m.group(3)
        # Strip max-h-[NNvh] from the className value.
        # Use lookahead for whitespace or end-of-string since \b doesn't
        # work after `]` (a non-word character).
        new_cn = re.sub(r"\s*max-h-\[\d+vh\](?=\s|$)", "", cn_value)
        new_cn = re.sub(r"\s+", " ", new_cn).strip()
        if new_cn == cn_value:
            continue
        # Rebuild the className attribute
        q = m.group(1)[0]  # the quote character
        new_attr = f'className={q}{new_cn}{q}'
        new_tag = tag_text.replace(m.group(0), new_attr, 1)
        new_src = new_src[:start] + new_tag + new_src[end:]
        changes += 1
    if changes > 0:
        with open(path, "w", encoding="utf-8") as f:
            f.write(new_src)
    return changes


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
                print(f"{os.path.relpath(path, ROOT)}: stripped max-h from {n} DialogContent(s)")
    print(f"\nDone. Cleaned {total} DialogContent(s).")


if __name__ == "__main__":
    main()
