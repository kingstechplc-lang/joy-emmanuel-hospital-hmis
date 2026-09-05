import re
with open('src/components/views/inpatient/beds-view.tsx') as f:
    src = f.read()
lines = src.split('\n')
# Look for lines with `<div ...` that have no closing > on the same line
# OR lines that have > inside JSX expressions in attributes
for i in range(415, 789):
    line = lines[i] if i < len(lines) else ''
    # Check if there's an opening <div without matching > on the line
    if re.search(r'<div\b', line):
        # Count > on the line
        open_count = len(re.findall(r'<div\b', line))
        close_count = len(re.findall(r'>', line))
        if open_count > close_count:
            print(f'line {i+1} ({open_count} opens, {close_count} >): {line[:120]}')
    # Check for > inside {} in a div open tag
    # Example: <div data-x={a > b ? c : d}>
    if re.search(r'<div\b[^>]*\{[^}]*>[^}]*\}', line):
        print(f'line {i+1} has > in expr: {line[:200]}')
