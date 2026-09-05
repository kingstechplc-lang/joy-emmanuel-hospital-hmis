#!/usr/bin/env python3
# =====================================================================
# migrate-dialog-sizes.py
#
# Migrates existing `<DialogContent className="max-w-XXX ...">` calls
# to use the new centralized `size` prop.  The mapping is based on the
# audit findings (max-w-md×58, max-w-lg×35, max-w-2xl×73, max-w-3xl×18,
# max-w-4xl×25, max-w-5xl×19) and the spec's size tiers.
#
# Mapping (per spec Section 22 — Default Content-Aware Sizing):
#   max-w-md  → size="compact"   (small confirmations)
#   max-w-lg  → size="medium"    (ordinary forms)
#   max-w-xl  → size="medium"    (slightly larger ordinary form)
#   max-w-2xl → size="large"     (standard forms)
#   max-w-3xl → size="xl"       (complex forms / small tables)
#   max-w-4xl → size="wide"     (tables / detail records)
#   max-w-5xl → size="2xl"      (complex clinical/diagnostic detail)
#   max-w-6xl → size="full"
#   max-w-7xl → size="full"
#
# Strategy:
#   - Use the brace-aware JSX tokenizer (same approach as the previous
#     Input→Textarea script) to find `<DialogContent ...>` opening tags.
#   - Extract the className attribute.
#   - If className contains a `max-w-XXX` token from the mapping,
#     strip it AND its accompanying `max-h-[NNvh]` / `h-[NNvh]` tokens
#     (those are now handled by the size preset).
#   - Add the `size="YYY"` attribute before the closing `>` or `/>`.
#   - Skip tags that already have `size=` (idempotent).
#   - Skip tags that have no `max-w-*` (let them keep their custom width).
#
# What gets preserved on the className:
#   - `flex flex-col p-0 gap-0 overflow-hidden` (the canonical body
#     shell — caller still needs this for the header/body/footer
#     scroll architecture).
#   - `DIALOG_BODY_SHELL` constant reference (if used).
#   - Custom background / border classes.
#
# What gets stripped from className:
#   - `max-w-md` / `max-w-lg` / `max-w-xl` / `max-w-2xl` / `max-w-3xl` /
#     `max-w-4xl` / `max-w-5xl` / `max-w-6xl` / `max-w-7xl`
#   - `max-h-[NNvh]` (any value)
#   - `h-[NNvh]` (any value — these force near-full-height and are
#     now expressed via the size preset's height tier)
# =====================================================================

import os
import re

ROOT = "/home/z/my-project/src/components/views"

MAX_W_TO_SIZE = {
    "max-w-md": "compact",
    "max-w-lg": "medium",
    "max-w-xl": "medium",
    "max-w-2xl": "large",
    "max-w-3xl": "xl",
    "max-w-4xl": "wide",
    "max-w-5xl": "2xl",
    "max-w-6xl": "full",
    "max-w-7xl": "full",
}

# Patterns to strip from className once size= is added.
STRIP_PATTERNS = [
    re.compile(r"\s*max-w-(?:sm|md|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl)\b"),
    re.compile(r"\s*max-h-\[\d+vh\]\b"),
    re.compile(r"\s*h-\[\d+vh\]\b"),
    re.compile(r"\s*sm:max-w-\[\d+rem\]\b"),  # sm:max-w-[NNrem] custom widths
    re.compile(r"\s*sm:max-w-(?:sm|md|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl)\b"),
]


def find_dialog_content_tags(src: str):
    """Yield (start, end, tag_text) for each <DialogContent ...> opening tag (self-closing or not)."""
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


def find_classname_attrs(tag_text: str):
    """Return list of (match_obj, quote_char, raw_value) for className attrs in tag_text."""
    results = []
    for m in re.finditer(r"""className\s*=\s*("([^"]*)"|'([^']*)')""", tag_text):
        if m.group(2) is not None:
            results.append((m, '"', m.group(2)))
        else:
            results.append((m, "'", m.group(3)))
    return results


def process_file(path: str) -> int:
    with open(path, "r", encoding="utf-8") as f:
        src = f.read()
    tags = list(find_dialog_content_tags(src))
    if not tags:
        return 0
    new_src = src
    changes = 0
    for start, end, tag_text in reversed(tags):
        # Skip if already has size=
        if re.search(r'\bsize\s*=\s*"', tag_text):
            continue
        # Find className
        cn_matches = find_classname_attrs(tag_text)
        if not cn_matches:
            continue
        # Take the first className (most tags only have one)
        cn_m, q, cn_value = cn_matches[0]
        # Determine which max-w-* is present
        detected_size = None
        for max_w, size in MAX_W_TO_SIZE.items():
            if re.search(r"(?<![\w-])" + re.escape(max_w) + r"(?![\w-])", cn_value):
                detected_size = size
                break
        if not detected_size:
            continue
        # Strip max-w-*, max-h-[NNvh], h-[NNvh] from className
        new_cn_value = cn_value
        for pat in STRIP_PATTERNS:
            new_cn_value = pat.sub("", new_cn_value)
        new_cn_value = re.sub(r"\s+", " ", new_cn_value).strip()
        # If new className is empty, drop the className attribute entirely.
        if not new_cn_value:
            new_tag = tag_text.replace(cn_m.group(0), "", 1)
        else:
            new_attr = f'className={q}{new_cn_value}{q}'
            new_tag = tag_text.replace(cn_m.group(0), new_attr, 1)
        # Add size="..." attribute.  Insert it just before the closing `>` or `/>`.
        # Find the closing position.
        if new_tag.endswith("/>"):
            close_idx = new_tag.rfind("/>")
            new_tag = new_tag[:close_idx] + f' size="{detected_size}" ' + new_tag[close_idx:]
        else:
            close_idx = new_tag.rfind(">")
            new_tag = new_tag[:close_idx] + f' size="{detected_size}"' + new_tag[close_idx:]
        new_src = new_src[:start] + new_tag + new_src[end:]
        changes += 1
    if changes > 0:
        with open(path, "w", encoding="utf-8") as f:
            f.write(new_src)
    return changes


def main():
    total_files = 0
    total_changes = 0
    for dirpath, _, filenames in os.walk(ROOT):
        for fn in filenames:
            if not fn.endswith(".tsx"):
                continue
            path = os.path.join(dirpath, fn)
            n = process_file(path)
            if n > 0:
                total_files += 1
                total_changes += n
                print(f"{os.path.relpath(path, ROOT)}: {n} DialogContent(s) migrated")
    print(f"\nDone. Migrated {total_changes} DialogContent(s) across {total_files} file(s).")


if __name__ == "__main__":
    main()
