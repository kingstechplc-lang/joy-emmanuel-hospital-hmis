// Patch search input patterns to use ClearableSearch across views.
// Conservative: only patches the exact "value={search} onChange={(e) => setSearch(e.target.value)}" pattern.
// Each patch must be verified manually after running.
const fs = require("fs");
const path = require("path");

const viewsDir = "/home/z/my-project/src/components/views";

// Walk the directory tree
function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (entry.name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

// Pattern: <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="..." ... className="pl-8" />
// We need to: (1) ensure ClearableSearch is imported, (2) replace the Input with ClearableSearch.
// This is risky to do via regex, so we'll only REPORT candidates and let me patch them manually.

const files = walk(viewsDir);
const candidates = [];
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  // Find lines with the exact patient/search pattern
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('value={search}') && line.includes('setSearch(e.target.value)')) {
      candidates.push({ file: f, line: i + 1, text: line.trim() });
    }
  }
}
console.log(JSON.stringify(candidates, null, 2));
console.log("\nTotal candidates:", candidates.length);
