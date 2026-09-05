#!/usr/bin/env python3
# =====================================================================
# find-broken-dialog-bodies.py
#
# Finds dialogs where the body content wrapper is missing the canonical
# `flex-1 overflow-y-auto (min-h-0) p-6` classes — which causes the
# exact symptoms the user reported:
#   - Content fits edge-to-edge on the dialog (no padding)
#   - Content is not scrollable (no overflow-y-auto)
#
# Strategy:
#   For each `<DialogContent ... flex flex-col ... overflow-hidden ...>`
#   block, walk the immediate JSX children.  A child is the "body" if
#   it's a <div>, <ScrollArea>, or <>fragment that contains non-header /
#   non-footer content.  We then check whether that child's className
#   contains `flex-1` AND `overflow-y-auto` (or `overflow-auto`).
#
#   A dialog is flagged if:
#     1. DialogContent has `flex flex-col` + `overflow-hidden`
#     2. The body child does NOT have `flex-1` OR does NOT have
#        `overflow-y-auto` / `overflow-auto`
#
#   We skip dialogs that:
#     - Don't use the flex/scroll pattern (legacy `grid gap-4 p-6` dialogs)
#     - Have no children (empty placeholder dialogs)
#     - Have a single child that IS the header/footer only (loading
#       placeholders)
#
# Output: prints file:line + the missing classes for each flagged dialog.
# =====================================================================

import os
import re

ROOT = "/home/z/my-project/src/components/views"


def find_dialog_content_blocks(src: str):
    """Yield (open_start, open_end, close_end) for each <DialogContent ...> ... </DialogContent>."""
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
        close_m = re.search(r"</DialogContent>", src[open_end:])
        if not close_m:
            return
        close_end = open_end + close_m.end()
        yield (start, open_end, close_end)
        i = close_end


def analyze_dialog_block(src: str, open_start: int, open_end: int, close_end: int):
    """Analyze one <DialogContent>...</DialogContent> block and return
    a list of issues (if any) for the body child."""
    opening_tag = src[open_start:open_end]
    # Only process dialogs with `flex flex-col` + `overflow-hidden` shell
    if not re.search(r"\bflex\b.*\bflex-col\b", opening_tag):
        return None
    if not re.search(r"\boverflow-hidden\b", opening_tag):
        return None
    # Extract className of the opening tag
    cn_m = re.search(r'''className\s*=\s*("([^"]*)"|'([^']*)')''', opening_tag)
    if not cn_m:
        return None
    cn = cn_m.group(2) if cn_m.group(2) is not None else cn_m.group(3)

    # Get the content between the opening and closing tags
    content = src[open_end:close_end - len("</DialogContent>")]

    # Find the immediate child JSX elements that are NOT DialogHeader / DialogFooter.
    # We do this by scanning for opening tags at brace_depth 0.
    body_candidates = []
    i = 0
    n = len(content)
    while i < n:
        # Find next `<`
        lt = content.find("<", i)
        if lt == -1:
            break
        # Skip if this is `</` (closing tag) or `<!--` (comment) or `<></>` (fragment)
        if content.startswith("</", lt) or content.startswith("<!--", lt):
            i = lt + 1
            continue
        # Match an opening tag name
        tag_m = re.match(r"<([A-Za-z][\w.]*)\b", content[lt:])
        if not tag_m:
            i = lt + 1
            continue
        tag_name = tag_m.group(1)
        # Find the end of this tag (brace-aware)
        j = lt + tag_m.end()
        brace_depth = 0
        in_string = None
        tag_end = None
        while j < n:
            ch = content[j]
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
                if ch == "/" and j + 1 < n and content[j + 1] == ">":
                    tag_end = j + 2
                    break
                if ch == ">":
                    tag_end = j + 1
                    break
            j += 1
        if tag_end is None:
            break
        # Skip header / footer / close button
        if tag_name in ("DialogHeader", "DialogFooter", "DialogClose", "DialogDescription", "DialogTitle"):
            # Skip to the matching close tag for this element
            close_pat = f"</{tag_name}>"
            close_idx = content.find(close_pat, tag_end)
            if close_idx == -1:
                break
            i = close_idx + len(close_pat)
            continue
        # Extract the className of this child (if any)
        child_tag = content[lt:tag_end]
        child_cn_m = re.search(r'''className\s*=\s*("([^"]*)"|'([^']*)')''', child_tag)
        child_cn = child_cn_m.group(2) if child_cn_m and child_cn_m.group(2) is not None else (child_cn_m.group(3) if child_cn_m else "")
        body_candidates.append((tag_name, child_cn, lt + open_end, tag_end + open_end))
        # Move past this element (we only care about the immediate children)
        # — to find the next sibling, jump to the matching close tag.
        close_pat = f"</{tag_name}>"
        close_idx = content.find(close_pat, tag_end)
        if close_idx == -1:
            break
        i = close_idx + len(close_pat)

    # For each body candidate, check if it has flex-1 + overflow-y-auto / overflow-auto.
    issues = []
    for tag_name, child_cn, child_start, child_end in body_candidates:
        has_flex_1 = "flex-1" in child_cn
        has_overflow_y = "overflow-y-auto" in child_cn or "overflow-auto" in child_cn or "overflow-y: auto" in child_cn
        has_padding = "p-6" in child_cn or "p-4" in child_cn or "p-3" in child_cn or "p-2" in child_cn or "px-" in child_cn
        if not has_flex_1 or not has_overflow_y or not has_padding:
            line_no = src[:child_start].count("\n") + 1
            missing = []
            if not has_flex_1:
                missing.append("flex-1")
            if not has_overflow_y:
                missing.append("overflow-y-auto")
            if not has_padding:
                missing.append("p-6 (padding)")
            issues.append((line_no, tag_name, child_cn, missing))
    return issues


def main():
    flagged_files = []
    for dirpath, _, filenames in os.walk(ROOT):
        for fn in filenames:
            if not fn.endswith(".tsx"):
                continue
            path = os.path.join(dirpath, fn)
            with open(path, "r", encoding="utf-8") as f:
                src = f.read()
            for open_start, open_end, close_end in find_dialog_content_blocks(src):
                issues = analyze_dialog_block(src, open_start, open_end, close_end)
                if issues:
                    rel = os.path.relpath(path, ROOT)
                    for line_no, tag_name, child_cn, missing in issues:
                        flagged_files.append((rel, line_no, tag_name, missing, child_cn))

    if not flagged_files:
        print("No broken dialog bodies found.")
        return

    print(f"Found {len(flagged_files)} broken dialog body wrapper(s):\n")
    for rel, line_no, tag_name, missing, child_cn in flagged_files:
        print(f"  {rel}:{line_no}  <{tag_name}>")
        print(f"    missing: {', '.join(missing)}")
        if child_cn:
            print(f"    current className: \"{child_cn}\"")
        print()


if __name__ == "__main__":
    main()
