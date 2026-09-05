#!/usr/bin/env python3
# =====================================================================
# cleanup-textarea-height.py
#
# Strips leftover `h-N` (N = 7,8,9,10,11) classes from <Textarea>
# className strings.  These were not stripped by the initial
# convert-input-to-textarea.py script because the regex required
# whitespace before `h-N` but inside `className="h-8 text-xs"` the
# `h-8` is preceded by `"`.
#
# Strategy: find every <Textarea ... className="..." ... /> tag and
# remove standalone `h-7`/`h-8`/`h-9`/`h-10`/`h-11` tokens from the
# className string (preserving everything else).
# =====================================================================

import os
import re

ROOT = "/home/z/my-project/src/components/views"

# Match a className="..." attribute value inside a Textarea tag.
CLASSNAME_RE = re.compile(r"""(className\s*=\s*")([^"]*)(")""")


def find_textarea_tags(src: str):
    """Yield (start, end, tag_text) for each <Textarea ... /> self-closing tag."""
    n = len(src)
    i = 0
    while i < n:
        m = re.search(r"<Textarea\b", src[i:])
        if not m:
            return
        start = i + m.start()
        j = start + len("<Textarea")
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


def strip_height_from_classname(value: str) -> str:
    """Remove h-7/h-8/h-9/h-10/h-11 tokens from a className string."""
    # Split on whitespace, drop tokens that are exactly `h-N` for N in our list.
    tokens = value.split()
    tokens = [t for t in tokens if not re.match(r"^h-(?:7|8|9|10|11)$", t)]
    return " ".join(tokens)


def process_file(path: str) -> int:
    with open(path, "r", encoding="utf-8") as f:
        src = f.read()
    tags = list(find_textarea_tags(src))
    if not tags:
        return 0
    new_src = src
    changes = 0
    for start, end, tag_text in reversed(tags):
        # Find className="..." inside the tag
        m = CLASSNAME_RE.search(tag_text)
        if not m:
            continue
        old_value = m.group(2)
        new_value = strip_height_from_classname(old_value)
        if new_value == old_value:
            continue
        # Rebuild the className attribute
        old_attr = m.group(0)
        new_attr = f'className="{new_value}"'
        new_tag = tag_text.replace(old_attr, new_attr, 1)
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
                print(f"{os.path.relpath(path, ROOT)}: stripped h-N from {n} Textarea(s)")
    print(f"\nDone. Cleaned {total} Textarea(s).")


if __name__ == "__main__":
    main()
