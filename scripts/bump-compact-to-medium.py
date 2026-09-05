#!/usr/bin/env python3
# =====================================================================
# bump-compact-to-medium.py
#
# Bumps compact dialogs that contain 4+ form fields (Input/Textarea/
# Select) up to size="medium".  Compact is for confirmation dialogs
# only; a form with 4+ fields needs at least medium width to avoid
# cramped inputs.
#
# Heuristic: for each <DialogContent ... size="compact" ...> ... </DialogContent>
# block, count the number of <Input>, <Textarea>, <Select> opening
# tags inside the block.  If >= 4, change size="compact" → size="medium".
# =====================================================================

import os
import re

ROOT = "/home/z/my-project/src/components/views"


def find_dialog_content_blocks(src: str):
    """Yield (start, content_end, full_end, tag_text) for each <DialogContent ...> ... </DialogContent> block."""
    n = len(src)
    i = 0
    while i < n:
        m = re.search(r"<DialogContent\b", src[i:])
        if not m:
            return
        start = i + m.start()
        # Find the end of the opening tag
        j = start + len("<DialogContent")
        brace_depth = 0
        in_string = None
        open_end = None
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
                    open_end = j + 2
                    break
                if ch == ">":
                    open_end = j + 1
                    break
            j += 1
        if open_end is None:
            return
        # Find matching </DialogContent>
        close_m = re.search(r"</DialogContent>", src[open_end:])
        if not close_m:
            return
        content_end = open_end + close_m.start()
        full_end = open_end + close_m.end()
        yield (start, content_end, full_end)
        i = full_end


def process_file(path: str) -> int:
    with open(path, "r", encoding="utf-8") as f:
        src = f.read()
    blocks = list(find_dialog_content_blocks(src))
    if not blocks:
        return 0
    new_src = src
    changes = 0
    # Process in reverse so offsets stay valid.
    for start, content_end, full_end in reversed(blocks):
        tag_text = src[start:content_end]  # opening tag up to but excluding </DialogContent>
        # Wait, content_end is the position of </DialogContent>, so the opening tag is src[start:open_end]
        # and the content is src[open_end:content_end].  Let me re-derive.
        # Actually let me just find the opening tag's end by searching for the first '>' after start.
        # Simpler: extract the opening tag separately.
        # Find the opening tag's end (first '>' or '/>' at brace_depth 0)
        j = start + len("<DialogContent")
        brace_depth = 0
        in_string = None
        open_end = None
        while j < len(src):
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
                if ch == "/" and j + 1 < len(src) and src[j + 1] == ">":
                    open_end = j + 2
                    break
                if ch == ">":
                    open_end = j + 1
                    break
            j += 1
        if open_end is None:
            continue
        opening_tag = src[start:open_end]
        # Skip if not size="compact"
        if not re.search(r'\bsize\s*=\s*"compact"', opening_tag):
            continue
        # Count fields in the content between opening tag and </DialogContent>
        content = src[open_end:content_end]
        n_inputs = len(re.findall(r"<Input\b", content))
        n_textareas = len(re.findall(r"<Textarea\b", content))
        n_selects = len(re.findall(r"<Select\b", content))
        n_fields = n_inputs + n_textareas + n_selects
        if n_fields < 4:
            continue
        # Bump size="compact" → size="medium"
        new_opening_tag = re.sub(
            r'size\s*=\s*"compact"',
            'size="medium"',
            opening_tag,
            count=1,
        )
        new_src = new_src[:start] + new_opening_tag + new_src[open_end:]
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
                print(f"{os.path.relpath(path, ROOT)}: bumped {n} compact dialog(s) to medium")
    print(f"\nDone. Bumped {total} dialog(s).")


if __name__ == "__main__":
    main()
