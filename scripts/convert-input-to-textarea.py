#!/usr/bin/env python3
# =====================================================================
# convert-input-to-textarea.py
#
# Converts single-line `<Input>` elements bound to text-like state
# variables (description, notes, reason, comment, remarks, instructions,
# details, narrative, summary, justification, explanation, findings,
# impression, recommendations, allergies, history, presentation,
# clinicalIndication, rejectionReason, rejectionNotes, amendmentReason,
# cancelReason, voidReason, transferReason, emergencyReason,
# verificationNotes, resultNotes, approvalNotes, reasonForTransport)
# into multi-line `<Textarea rows={3}>` elements so users can type
# paragraphs of text instead of one long single-line block.
#
# What gets converted:
#   <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="..." />
#   →
#   <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="..." rows={3} />
#
# Cleanup rules applied to the converted tag:
#   - Remove `type="text"` (Textarea has no type)
#   - Remove `type="number"` and `step="..."` (numbers aren't text)
#   - Remove `min="..."` and `max="..."` (numeric constraints)
#   - Remove `h-7` / `h-8` / `h-9` / `h-10` / `h-11` from className
#     (Textarea uses min-h-16 by default; explicit h-N would clip text)
#   - Insert `rows={3}` attribute before the closing `/>`
#
# What is SKIPPED:
#   - Inputs with `type="number"` (currency, quantity, etc.)
#   - Inputs inside a horizontal flex row with an adjacent Button (inline
#     notes fields in lab-results-view.tsx and specialty-clinics-view.tsx
#     are listed in SKIP_LINES below).
#   - Inputs whose variable binding does NOT contain a text-like keyword.
#
# If a file does not yet import `Textarea`, the script adds the import
# to the existing `@/components/ui/...` import block.
# =====================================================================

import os
import re

ROOT = "/home/z/my-project/src/components/views"

# Variable-name keywords that signal "this is a text field".
TEXT_KEYWORDS = [
    "description", "notes", "reason", "comment", "remarks", "instructions",
    "details", "narrative", "summary", "justification", "explanation",
    "findings", "impression", "recommendations", "allergies", "history",
    "presentation", "clinicalIndication",
    "rejectionReason", "rejectionNotes", "amendmentReason",
    "cancelReason", "voidReason",
    "transferReason", "emergencyReason",
    "verificationNotes", "resultNotes", "approvalNotes",
    "reasonForTransport",
    "correctiveAction", "expectedOutcome", "symptoms",
]

# Skip specific (file, line_number) pairs that are inline notes fields
# in a horizontal flex row with an adjacent Button — converting them
# to Textarea would break the layout.
SKIP_LINES = {
    ("lab/lab-results-view.tsx", 790),
    ("extended/specialty-clinics-view.tsx", 887),
    ("extended/it-support-view.tsx", 317),  # subject - inline summary, one-line is fine
}

# Regex to extract the value={...} binding.
VALUE_RE = re.compile(r"""value\s*=\s*\{([^}]+)\}""")

# Regex to detect `e.target.value` (string input — what we want to convert).
STRING_ONCHANGE_RE = re.compile(r"""onChange\s*=\s*\{\s*\([^)]*\)\s*=>\s*[^}]*e\.target\.value[^}]*\}""")

# Regex to detect `type="number"` or `type='number'`.
TYPE_NUMBER_RE = re.compile(r"""type\s*=\s*["']number["']""")


def find_input_tags(src: str):
    """Yield (start, end, tag_text) for each `<Input ... />` self-closing tag.

    Uses brace-depth-aware scanning so that `>` inside JSX expressions like
    `onChange={(e) => ...}` is not mistaken for the end of the tag.
    """
    n = len(src)
    i = 0
    while i < n:
        m = re.search(r"<Input\b", src[i:])
        if not m:
            return
        start = i + m.start()
        j = start + len("<Input")
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


def is_text_like_binding(value_expr: str) -> bool:
    """Check whether the value= expression references a text-like variable."""
    # Strip whitespace and check if any text keyword appears as a substring
    # of a variable name (e.g., `form.description`, `reason`, `it.description`,
    # `r.resultNotes`).  Use word-boundary-ish matching on the keyword.
    for kw in TEXT_KEYWORDS:
        # match kw preceded by `.` or `_` or word boundary (e.g., `description` in
        # `form.description`, `resultNotes` matches `resultNotes` keyword)
        if re.search(r"(?<![\w])" + re.escape(kw) + r"(?![\w])", value_expr):
            return True
        # Also match camelCase concatenations like `resultNotes` → `result` + `Notes`
        # We rely on substring check for the keyword directly.
    return False


def convert_input_to_textarea(tag_text: str) -> str:
    """Convert `<Input ... />` to `<Textarea ... rows={3} />` with cleanup."""
    inner = tag_text[len("<Input"):-len("/>")].rstrip()
    # Remove type="text" / type="number" / step / min / max
    inner = re.sub(r"""\s*type\s*=\s*["']text["']""", "", inner)
    inner = re.sub(r"""\s*type\s*=\s*["']number["']""", "", inner)
    inner = re.sub(r"""\s*step\s*=\s*["'][^"']*["']""", "", inner)
    inner = re.sub(r"""\s*min\s*=\s*["'][^"']*["']""", "", inner)
    inner = re.sub(r"""\s*max\s*=\s*["'][^"']*["']""", "", inner)
    # Remove h-N height classes from className (Textarea uses min-h-16 by default)
    inner = re.sub(r"(\s+h-(?:7|8|9|10|11)\b)", "", inner)
    # Insert rows={3} if not already present
    if not re.search(r"\brows\s*=\s*\{", inner):
        inner = inner + " rows={3}"
    return f"<Textarea{inner} />"


def ensure_textarea_import(src: str) -> str:
    """Add Textarea to the existing `@/components/ui/textarea` or related import block."""
    # Check if Textarea is already imported.
    if re.search(r"\bTextarea\b", src):
        # Verify it's actually imported as a component
        if re.search(r"""import\s+\{[^}]*\bTextarea\b[^}]*\}\s+from\s+["']@/components/ui/textarea["']""", src):
            return src
        if re.search(r"""import\s+\{[^}]*\bTextarea\b[^}]*\}""", src):
            return src  # already imported somewhere
    # Try to add Textarea to the existing textarea import line.
    m = re.search(r"""import\s+\{([^}]*)\}\s+from\s+["']@/components/ui/textarea["']""", src)
    if m:
        # Already has a textarea import — add Textarea to it.
        old_import = m.group(0)
        names = m.group(1).split(",")
        names = [n.strip() for n in names if n.strip()]
        if "Textarea" not in names:
            names.append("Textarea")
        new_import = f'import {{ {", ".join(names)} }} from "@/components/ui/textarea"'
        return src.replace(old_import, new_import)
    # Otherwise, add a new import after the last existing `@/components/ui/...` import.
    matches = list(re.finditer(r"""import\s+\{[^}]*\}\s+from\s+["']@/components/ui/[a-z-]+["']\s*;?\n""", src))
    if matches:
        last = matches[-1]
        new_import = 'import { Textarea } from "@/components/ui/textarea";\n'
        return src[:last.end()] + new_import + src[last.end():]
    # Fallback — add after the first `import ...` line.
    matches = list(re.finditer(r"""^import\s+[^;]+;\s*$""", src, re.MULTILINE))
    if matches:
        last = matches[-1]
        new_import = 'import { Textarea } from "@/components/ui/textarea";\n'
        return src[:last.end()] + "\n" + new_import + src[last.end():]
    return src  # give up — manual fix needed


def process_file(path: str) -> int:
    rel = os.path.relpath(path, ROOT)
    with open(path, "r", encoding="utf-8") as f:
        src = f.read()
    # Build a list of (start, end, tag_text) using the brace-aware tokenizer.
    matches = list(find_input_tags(src))
    if not matches:
        return 0

    new_src = src
    changes = 0
    # Process in reverse so offsets stay valid.
    for start, end, tag_text in reversed(matches):
        line_no = src[:start].count("\n") + 1
        # Check skip list
        if (rel, line_no) in SKIP_LINES:
            continue
        # Extract value= binding
        vmatch = VALUE_RE.search(tag_text)
        if not vmatch:
            continue
        value_expr = vmatch.group(1)
        if not is_text_like_binding(value_expr):
            continue
        # Skip if it's a number input
        if TYPE_NUMBER_RE.search(tag_text):
            continue
        # Skip if onChange is not a string onChange (e.g., numeric Number() coercion)
        if not STRING_ONCHANGE_RE.search(tag_text):
            # Check if the onChange has Number(...) coercion — skip if so
            if re.search(r"""onChange\s*=\s*\{[^}]*Number\(""", tag_text):
                continue
            # Otherwise, the onChange might be a custom handler. Still convert if
            # it uses e.target.value somewhere.
            if not re.search(r"""e\.target\.value""", tag_text):
                continue
        # Convert
        new_tag = convert_input_to_textarea(tag_text)
        if new_tag != tag_text:
            new_src = new_src[:start] + new_tag + new_src[end:]
            changes += 1

    if changes > 0:
        # Ensure Textarea is imported
        new_src = ensure_textarea_import(new_src)
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
                print(f"{os.path.relpath(path, ROOT)}: {n} Input(s) → Textarea")
    print(f"\nDone. Converted {total_changes} Input(s) to Textarea across {total_files} file(s).")


if __name__ == "__main__":
    main()
