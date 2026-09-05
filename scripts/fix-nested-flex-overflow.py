#!/usr/bin/env python3
# =====================================================================
# fix-nested-flex-overflow.py  (v3 — JSX-aware tokenizer)
#
# Removes the broken nested `flex-1 overflow-y-auto ... ` pattern from
# dialog bodies.
#
# Background:
#   Many dialogs in this codebase have an outer scrollable body:
#     <div className="flex-1 overflow-y-auto p-6 ...">  ← dialog body (correct)
#       <div className="flex-1 overflow-y-auto p-6 ...">  ← nested dup (BUG)
#         <Input ... />
#       </div>
#     </div>
#
#   The nested `flex-1 overflow-y-auto p-6 ...` makes each child a tiny
#   scroll container with stretched height, which clips the input
#   content and breaks the placeholder/text rendering.  The user
#   reported this as "input fields having scroll nav off" — the
#   FIRST input field on most dialogs is affected because that's
#   where the duplicate wrapper was inserted by an earlier script.
#
# Fix:
#   Walk every .tsx file in src/components/views/.  Track the depth
#   of any JSX element (div, ScrollArea, etc.) whose className contains
#   `flex-1 overflow-y-auto`.  When a `<div>` with that class is
#   encountered AND we're already inside one (depth >= 1), strip
#   `flex-1 overflow-y-auto` and the associated padding token
#   (`p-6`, `p-4`, `px-6 py-4`, etc.) from the className, leaving
#   any other classes (grid, gap, space-y, col-span, etc.) intact.
#
#   We do NOT strip from non-<div> elements (e.g. ScrollArea) because
#   those are typically the legitimate scroll container.
#
# Tokenizer notes:
#   JSX expressions like `className={x > 5 ? a : b}` contain `>` inside
#   braces.  We need a brace-depth-aware tokenizer to find the real end
#   of an opening tag, not just stop at the first `>`.
# =====================================================================

import os
import re

ROOT = "/home/z/my-project/src/components/views"

CLASSNAME_RE = re.compile(r"""className\s*=\s*("([^"]*)"|'([^']*)')""")

# Detect any className containing `flex-1 overflow-y-auto`
TARGET_DETECT_PAT = re.compile(r"(?<![\w-])flex-1 overflow-y-auto(?![\w-])")

# Strip `flex-1 overflow-y-auto` + optional padding token that follows.
STRIP_PAT = re.compile(
    r"flex-1 overflow-y-auto"
    r"(?:\s+p-\d+|"
    r"\s+px-\d+\s+py-\d+|"
    r"\s+py-\d+\s+px-\d+)?"
)


def find_classname_attrs(tag_text: str):
    """Return list of (match_obj, quote_char, raw_value) for className attrs."""
    results = []
    for m in CLASSNAME_RE.finditer(tag_text):
        if m.group(2) is not None:
            results.append((m, '"', m.group(2)))
        else:
            results.append((m, "'", m.group(3)))
    return results


def tokenize(src: str):
    """Yield tokens: ('text', str) | ('opentag', name, full_text, start, is_self_closing) | ('closetag', name, full_text)."""
    pos = 0
    n = len(src)
    while pos < n:
        # Find next '<'
        lt = src.find("<", pos)
        if lt == -1:
            yield ("text", src[pos:])
            return
        # Text before '<'
        if lt > pos:
            yield ("text", src[pos:lt])
        # Check if this is a closing tag </Name>
        if src.startswith("</", lt):
            # Closing tag
            m = re.match(r"</([A-Za-z][\w.-]*)\s*>", src[lt:])
            if m:
                yield ("closetag", m.group(1), m.group(0))
                pos = lt + m.end()
                continue
            # Not a valid closing tag — emit '<' as text
            yield ("text", "<")
            pos = lt + 1
            continue
        # Opening tag — find the end, handling { } brace nesting
        # First, match the element name
        m = re.match(r"<([A-Za-z][\w.-]*)\b", src[lt:])
        if not m:
            yield ("text", "<")
            pos = lt + 1
            continue
        elem_name = m.group(1)
        attr_start = lt + m.end()
        # Scan attributes, tracking brace depth
        i = attr_start
        brace_depth = 0
        in_string = None  # None, '"', "'", or "`"
        end_pos = None
        is_self_closing = False
        while i < n:
            ch = src[i]
            if in_string:
                if ch == "\\":
                    i += 2
                    continue
                if ch == in_string:
                    in_string = None
                i += 1
                continue
            if ch in ('"', "'", "`"):
                in_string = ch
                i += 1
                continue
            if ch == "{":
                brace_depth += 1
                i += 1
                continue
            if ch == "}":
                if brace_depth > 0:
                    brace_depth -= 1
                i += 1
                continue
            if brace_depth == 0:
                if ch == ">":
                    end_pos = i
                    break
                if ch == "/" and i + 1 < n and src[i + 1] == ">":
                    end_pos = i
                    is_self_closing = True
                    break
            i += 1
        if end_pos is None:
            # Unterminated tag — emit as text
            yield ("text", src[lt:])
            return
        # full tag text includes the closing > or />
        full_end = end_pos + (2 if is_self_closing else 1)
        full_text = src[lt:full_end]
        yield ("opentag", elem_name, full_text, lt, is_self_closing)
        pos = full_end


def process_file(path: str) -> tuple[int, list[str]]:
    """Return (num_fixes_applied, list_of_changed_line_descriptions)."""
    with open(path, "r", encoding="utf-8") as f:
        src = f.read()

    stack = []  # list of (is_target, element_name)
    depth = 0
    out = []
    changes = []

    for tok in tokenize(src):
        if tok[0] == "text":
            out.append(tok[1])
        elif tok[0] == "opentag":
            elem_name = tok[1]
            tag_text = tok[2]
            start_pos = tok[3]
            is_self_closing = tok[4]

            cn_matches = find_classname_attrs(tag_text)
            has_target = any(
                TARGET_DETECT_PAT.search(val) for _, _, val in cn_matches
            )

            if elem_name == "div" and has_target and depth >= 1:
                # Nested duplicate.  Strip flex-1 overflow-y-auto + padding.
                new_tag = tag_text
                for cn_m, q, val in cn_matches:
                    if not TARGET_DETECT_PAT.search(val):
                        continue
                    new_val = STRIP_PAT.sub("", val)
                    new_val = re.sub(r"\s+", " ", new_val).strip()
                    old_attr = cn_m.group(0)
                    new_attr = f'className={q}{new_val}{q}'
                    new_tag = new_tag.replace(old_attr, new_attr, 1)
                out.append(new_tag)
                line_no = src[:start_pos].count("\n") + 1
                changes.append(f"  line {line_no}")
                if not is_self_closing:
                    stack.append((False, "div"))
            else:
                out.append(tag_text)
                if not is_self_closing:
                    stack.append((has_target, elem_name))
                    if has_target:
                        depth += 1
        elif tok[0] == "closetag":
            if stack:
                was_target, _ = stack.pop()
                if was_target:
                    depth -= 1
            out.append(tok[2])

    new_src = "".join(out)
    if new_src != src:
        with open(path, "w", encoding="utf-8") as f:
            f.write(new_src)
        return len(changes), changes
    return 0, []


def main():
    total_files = 0
    total_fixes = 0
    for dirpath, _, filenames in os.walk(ROOT):
        for fn in filenames:
            if not fn.endswith(".tsx"):
                continue
            path = os.path.join(dirpath, fn)
            n, changes = process_file(path)
            if n > 0:
                total_files += 1
                total_fixes += n
                print(f"{path}: {n} fix(es)")
                for c in changes[:5]:
                    print(c)
                if len(changes) > 5:
                    print(f"  ... and {len(changes) - 5} more")
    print(f"\nDone. Modified {total_files} files, applied {total_fixes} fixes.")


if __name__ == "__main__":
    main()
