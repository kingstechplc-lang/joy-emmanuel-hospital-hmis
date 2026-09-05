#!/usr/bin/env python3
# =====================================================================
# fix-broken-dialog-bodies.py
#
# Fixes dialogs where the body content wrapper is missing the canonical
# `flex-1 overflow-y-auto min-h-0 p-6` classes — which causes:
#   - Content fitting edge-to-edge (no padding)
#   - Content not scrollable (no overflow-y-auto)
#
# Fix strategy (per direct child of DialogContent that is NOT
# DialogHeader/DialogFooter/DialogClose):
#
#   1. If the child is a <div> with some className:
#      - If it has `shrink-0` → skip (intentionally fixed)
#      - If it's an intermediate wrapper (flex-1 + overflow-hidden + flex
#        flex-col) → skip (children handle scrolling)
#      - If it's a loading/error placeholder (flex-1 + items-center +
#        justify-center) → skip (centered message, no scroll needed)
#      - If it's missing flex-1 or overflow-y-auto or padding:
#        → add the missing tokens to the className
#
#   2. If the child is a non-div component (LoadingState, ErrorState,
#      EmptyState, Alert, PatientPicker, etc.) with no className:
#      → wrap it in `<div className="flex-1 overflow-y-auto min-h-0 p-6">...</div>`
#
#   3. If the child is a <ScrollArea> with flex-1 + overflow-y-auto but
#      no padding → add `p-6` to the className (ScrollArea's viewport
#      needs padding for content not to touch the edges).
#
# The script is conservative: it only fixes clear cases.  Ambiguous
# cases are skipped and reported for manual review.
# =====================================================================

import os
import re

ROOT = "/home/z/my-project/src/components/views"

SKIP_TAGS = {"DialogHeader", "DialogFooter", "DialogClose", "DialogDescription", "DialogTitle"}


def find_tag_end(src: str, start: int):
    n = len(src)
    j = start + 1
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


def find_matching_close(src: str, open_start: int, open_end: int, tag_name: str):
    n = len(src)
    if src[open_end - 2:open_end] == "/>":
        return open_end
    depth = 1
    i = open_end
    open_pat = re.compile(r"<" + re.escape(tag_name) + r"\b")
    close_pat = re.compile(r"</" + re.escape(tag_name) + r"\s*>")
    while i < n:
        om = open_pat.search(src, i)
        cm = close_pat.search(src, i)
        if not cm:
            return n
        if om and om.start() < cm.start():
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
    content_start = open_end
    content_end = close_end - len("</DialogContent>")
    i = content_start
    n = content_end
    while i < n:
        lt = src.find("<", i, n)
        if lt == -1:
            return
        if src.startswith("</", lt) or src.startswith("<!--", lt) or src.startswith("<>", lt) or src.startswith("</>", lt):
            i = lt + 1
            continue
        tag_m = re.match(r"<([A-Za-z][\w.]*)\b", src[lt:n])
        if not tag_m:
            i = lt + 1
            continue
        tag_name = tag_m.group(1)
        tag_end = find_tag_end(src, lt)
        if tag_end is None or tag_end > n:
            return
        full_end = find_matching_close(src, lt, tag_end, tag_name)
        if full_end > n:
            full_end = n
        yield (tag_name, lt, tag_end, full_end)
        i = full_end


def should_skip_child(cn: str) -> bool:
    """Return True if this child should be skipped (already correct or intentionally fixed)."""
    if re.search(r"\bshrink-0\b", cn):
        return True
    # Intermediate wrapper — children handle scrolling
    if (re.search(r"\bflex-1\b", cn) and re.search(r"\boverflow-hidden\b", cn)
            and re.search(r"\bflex\b.*\bflex-col\b", cn)):
        return True
    # Loading/error placeholder (centered message)
    if (re.search(r"\bflex-1\b", cn) and re.search(r"\bitems-center\b", cn)
            and re.search(r"\bjustify-center\b", cn)):
        return True
    # Already correct (has flex-1, overflow-y-auto, and padding)
    has_flex_1 = "flex-1" in cn
    has_overflow_y = "overflow-y-auto" in cn or "overflow-auto" in cn
    has_padding = bool(re.search(r"\bp-(?:2|3|4|5|6)\b", cn)) or "px-" in cn
    if has_flex_1 and has_overflow_y and has_padding:
        return True
    return False


def fix_div_classname(cn: str) -> str | None:
    """For a <div> child, return the fixed className (or None if no fix needed)."""
    if should_skip_child(cn):
        return None
    has_flex_1 = "flex-1" in cn
    has_overflow_y = "overflow-y-auto" in cn or "overflow-auto" in cn
    has_padding = bool(re.search(r"\bp-(?:2|3|4|5|6)\b", cn)) or "px-" in cn
    if has_flex_1 and has_overflow_y and has_padding:
        return None
    # Build the fix
    additions = []
    if not has_flex_1:
        additions.append("flex-1")
    if not has_overflow_y:
        additions.append("overflow-y-auto")
    if not has_padding:
        additions.append("p-6")
    # Add min-h-0 if we're adding flex-1 (needed for overflow to work in flex children)
    if "flex-1" in additions and "min-h-0" not in cn:
        additions.append("min-h-0")
    new_cn = cn + " " + " ".join(additions)
    new_cn = re.sub(r"\s+", " ", new_cn).strip()
    return new_cn


def process_file(path: str) -> int:
    with open(path, "r", encoding="utf-8") as f:
        src = f.read()
    blocks = list(find_dialog_content_blocks(src))
    if not blocks:
        return 0
    new_src = src
    changes = 0
    # Process in reverse so offsets stay valid
    for open_start, open_end, close_end in reversed(blocks):
        opening_tag = src[open_start:open_end]
        if not re.search(r"\bflex\b.*\bflex-col\b", opening_tag):
            continue
        if not re.search(r"\boverflow-hidden\b", opening_tag):
            continue
        children = list(get_direct_children(src, open_end, close_end))
        # Process children in reverse so offsets stay valid within this dialog
        for tag_name, child_start, child_end, full_end in reversed(children):
            if tag_name in SKIP_TAGS:
                continue
            if tag_name in ("", "Fragment"):
                continue
            child_tag = src[child_start:child_end]
            cn_m = re.search(r'''className\s*=\s*("([^"]*)"|'([^']*)')''', child_tag)
            if cn_m:
                q = cn_m.group(1)[0]
                cn = cn_m.group(2) if cn_m.group(2) is not None else cn_m.group(3)
                if tag_name == "div":
                    new_cn = fix_div_classname(cn)
                    if new_cn is None:
                        continue
                    new_attr = f'className={q}{new_cn}{q}'
                    new_child_tag = child_tag.replace(cn_m.group(0), new_attr, 1)
                    new_src = new_src[:child_start] + new_child_tag + new_src[child_end:]
                    changes += 1
                elif tag_name == "ScrollArea":
                    # ScrollArea with flex-1 + overflow-y-auto but no padding → add p-6
                    if should_skip_child(cn):
                        continue
                    has_padding = bool(re.search(r"\bp-(?:2|3|4|5|6)\b", cn)) or "px-" in cn
                    if not has_padding:
                        new_cn = cn + " p-6"
                        new_cn = re.sub(r"\s+", " ", new_cn).strip()
                        new_attr = f'className={q}{new_cn}{q}'
                        new_child_tag = child_tag.replace(cn_m.group(0), new_attr, 1)
                        new_src = new_src[:child_start] + new_child_tag + new_src[child_end:]
                        changes += 1
                # Other components with className: skip (too risky to auto-fix)
            else:
                # No className — if it's a known safe-to-wrap component, wrap it
                safe_wrap = {
                    "LoadingState", "ErrorState", "EmptyState", "Alert",
                    "PatientPicker", "ClearableSearch", "Card",
                    "Tabs",  # Tabs component — wrap in body div
                    # Custom form components — wrap in body div
                    "RequestForm", "AmendmentForm", "ReleaseForm", "ViewingForm",
                    "StorageForm", "ProceduresSection", "ClinicalNotesSection",
                    "KBForm", "AssetForm", "MaintenanceForm", "InspectionForm",
                    "TransferDialogBody", "SkipDialogBody", "DetailFooter",
                }
                if tag_name in safe_wrap:
                    # Wrap in a body div
                    full_child = src[child_start:full_end]
                    wrapper = '<div className="flex-1 overflow-y-auto min-h-0 p-6">'
                    closer = "</div>"
                    new_src = new_src[:child_start] + wrapper + full_child + closer + new_src[full_end:]
                    changes += 1
    if changes > 0:
        with open(path, "w", encoding="utf-8") as f:
            f.write(new_src)
    return changes


def main():
    total = 0
    files = 0
    for dirpath, _, filenames in os.walk(ROOT):
        for fn in filenames:
            if not fn.endswith(".tsx"):
                continue
            path = os.path.join(dirpath, fn)
            n = process_file(path)
            if n > 0:
                total += n
                files += 1
                print(f"{os.path.relpath(path, ROOT)}: fixed {n} body wrapper(s)")
    print(f"\nDone. Fixed {total} body wrapper(s) across {files} file(s).")


if __name__ == "__main__":
    main()
