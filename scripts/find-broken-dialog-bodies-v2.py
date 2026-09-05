#!/usr/bin/env python3
# =====================================================================
# find-broken-dialog-bodies-v2.py
#
# v2: only looks at DIRECT children of DialogContent (not nested divs).
# A direct child is one whose opening tag is at brace_depth 0 in the
# content between <DialogContent> and </DialogContent>.
#
# A dialog is flagged if:
#   1. DialogContent has `flex flex-col` + `overflow-hidden`
#   2. A DIRECT child (not DialogHeader/DialogFooter/DialogClose) does
#      NOT have `flex-1` OR does NOT have `overflow-y-auto`/`overflow-auto`
#      OR does NOT have padding (`p-6`, `p-4`, `p-3`, `p-2`, `px-N py-N`).
# =====================================================================

import os
import re

ROOT = "/home/z/my-project/src/components/views"

SKIP_TAGS = {"DialogHeader", "DialogFooter", "DialogClose", "DialogDescription", "DialogTitle"}


def find_tag_end(src: str, start: int) -> int | None:
    """Find the end of the opening tag starting at `start` (position of `<`)."""
    n = len(src)
    j = start + 1
    # Skip tag name
    while j < n and (src[j].isalnum() or src[j] == "." or src[j] == "-"):
        j += 1
    brace_depth = 0
    in_string = None
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
                return j + 2
            if ch == ">":
                return j + 1
        j += 1
    return None


def find_matching_close(src: str, open_start: int, open_end: int, tag_name: str) -> int:
    """Find the position of the matching close tag `</tag_name>` for the
    opening tag at [open_start, open_end).  Returns the index AFTER the
    close tag.  Handles nested same-name tags."""
    n = len(src)
    # If self-closing, the close is the open_end itself.
    if src[open_end - 2:open_end] == "/>":
        return open_end
    # Walk forward tracking nesting of <tag_name> ... </tag_name>.
    depth = 1
    i = open_end
    open_pat = re.compile(r"<" + re.escape(tag_name) + r"\b")
    close_pat = re.compile(r"</" + re.escape(tag_name) + r"\s*>")
    while i < n:
        om = open_pat.search(src, i)
        cm = close_pat.search(src, i)
        if not cm:
            return n  # no matching close — return end of file
        if om and om.start() < cm.start():
            # Nested open — check if it's actually an opening tag (not self-closing)
            nested_end = find_tag_end(src, om.start())
            if nested_end and src[nested_end - 2:nested_end] != "/>":
                depth += 1
            i = nested_end or om.end()
        else:
            depth -= 1
            if depth == 0:
                return cm.end()
            i = cm.end()
    return n


def find_dialog_content_blocks(src: str):
    """Yield (open_start, open_end, close_end) for each <DialogContent ...> ... </DialogContent>."""
    n = len(src)
    i = 0
    while i < n:
        m = re.search(r"<DialogContent\b", src[i:])
        if not m:
            return
        start = i + m.start()
        open_end = find_tag_end(src, start)
        if open_end is None:
            return
        close_m = re.search(r"</DialogContent>", src[open_end:])
        if not close_m:
            return
        close_end = open_end + close_m.end()
        yield (start, open_end, close_end)
        i = close_end


def get_direct_children(src: str, open_end: int, close_end: int):
    """Yield (tag_name, tag_start, tag_end, full_end) for each direct child
    element inside [open_end, close_end - len('</DialogContent>')]."""
    content_start = open_end
    content_end = close_end - len("</DialogContent>")
    i = content_start
    n = content_end
    while i < n:
        # Find next `<`
        lt = src.find("<", i, n)
        if lt == -1:
            return
        # Skip closing tags, comments, fragments
        if src.startswith("</", lt) or src.startswith("<!--", lt) or src.startswith("<>", lt) or src.startswith("</>", lt):
            i = lt + 1
            continue
        # Match an opening tag name
        tag_m = re.match(r"<([A-Za-z][\w.]*)\b", src[lt:n])
        if not tag_m:
            i = lt + 1
            continue
        tag_name = tag_m.group(1)
        tag_end = find_tag_end(src, lt)
        if tag_end is None or tag_end > n:
            return
        # Find matching close (or itself if self-closing)
        full_end = find_matching_close(src, lt, tag_end, tag_name)
        if full_end > n:
            full_end = n
        yield (tag_name, lt, tag_end, full_end)
        i = full_end


def analyze_dialog(src: str, open_start: int, open_end: int, close_end: int):
    """Return list of issues for the dialog's body child (if any)."""
    opening_tag = src[open_start:open_end]
    if not re.search(r"\bflex\b.*\bflex-col\b", opening_tag):
        return None
    if not re.search(r"\boverflow-hidden\b", opening_tag):
        return None

    issues = []
    for tag_name, child_start, child_end, full_end in get_direct_children(src, open_end, close_end):
        if tag_name in SKIP_TAGS:
            continue
        # Skip fragments (tag_name might be empty for <>)
        if tag_name in ("", "Fragment"):
            continue
        # Get className of this child
        child_tag = src[child_start:child_end]
        cn_m = re.search(r'''className\s*=\s*("([^"]*)"|'([^']*)')''', child_tag)
        if not cn_m:
            # No className — if it's a div/ScrollArea containing content, flag it
            line_no = src[:child_start].count("\n") + 1
            issues.append((line_no, tag_name, "", ["flex-1", "overflow-y-auto", "p-6"]))
            continue
        cn = cn_m.group(2) if cn_m.group(2) is not None else cn_m.group(3)

        # Skip if explicitly shrink-0 (intentionally fixed element like a banner/toolbar)
        if re.search(r"\bshrink-0\b", cn):
            continue
        # Skip if it's an intermediate wrapper (flex-1 + overflow-hidden + flex flex-col)
        # — its children handle their own scrolling
        if re.search(r"\bflex-1\b", cn) and re.search(r"\boverflow-hidden\b", cn) and re.search(r"\bflex\b.*\bflex-col\b", cn):
            continue
        # Skip if it's a loading/error placeholder that just centers a message
        # (has flex-1 + items-center + justify-center)
        if re.search(r"\bflex-1\b", cn) and re.search(r"\bitems-center\b", cn) and re.search(r"\bjustify-center\b", cn):
            continue

        has_flex_1 = "flex-1" in cn
        has_overflow_y = "overflow-y-auto" in cn or "overflow-auto" in cn
        has_padding = bool(re.search(r"\bp-(?:2|3|4|5|6)\b", cn)) or "px-" in cn
        if not has_flex_1 or not has_overflow_y or not has_padding:
            line_no = src[:child_start].count("\n") + 1
            missing = []
            if not has_flex_1:
                missing.append("flex-1")
            if not has_overflow_y:
                missing.append("overflow-y-auto")
            if not has_padding:
                missing.append("p-6")
            issues.append((line_no, tag_name, cn, missing))
    return issues


def main():
    flagged = []
    for dirpath, _, filenames in os.walk(ROOT):
        for fn in filenames:
            if not fn.endswith(".tsx"):
                continue
            path = os.path.join(dirpath, fn)
            with open(path, "r", encoding="utf-8") as f:
                src = f.read()
            for open_start, open_end, close_end in find_dialog_content_blocks(src):
                issues = analyze_dialog(src, open_start, open_end, close_end)
                if issues:
                    rel = os.path.relpath(path, ROOT)
                    for line_no, tag_name, cn, missing in issues:
                        flagged.append((rel, line_no, tag_name, cn, missing))

    if not flagged:
        print("No broken dialog bodies found.")
        return

    print(f"Found {len(flagged)} broken dialog body wrapper(s):\n")
    for rel, line_no, tag_name, cn, missing in flagged:
        print(f"  {rel}:{line_no}  <{tag_name}>")
        print(f"    missing: {', '.join(missing)}")
        if cn:
            print(f"    current className: \"{cn}\"")
        print()


if __name__ == "__main__":
    main()
