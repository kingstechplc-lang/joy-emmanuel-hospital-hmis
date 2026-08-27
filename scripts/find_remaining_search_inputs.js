// Find search Input elements — those with "Search" in placeholder OR with a Search icon nearby.
// Skip form-field Inputs (which use value={someField} onChange={...setSomeField...}).
const fs = require("fs");
const path = require("path");

const viewsDir = "/home/z/my-project/src/components/views";
function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (entry.name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const files = walk(viewsDir);
const candidates = [];

for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const prev = lines[i - 1] || "";
    const next = lines[i + 1] || "";
    // Match Input with value={X} onChange={(e)=>setX(e.target.value)} pattern
    // where the placeholder contains "search" OR the previous/next line has a Search icon
    if (!line.includes("<Input")) continue;
    if (line.includes("ClearableSearch")) continue;
    if (!line.includes("value={") || !line.includes("onChange={")) continue;
    // Skip non-search types
    if (line.includes('type="date"') || line.includes('type="number"') || line.includes('type="datetime-local"') || line.includes('type="email"') || line.includes('type="time"') || line.includes('type="tel"') || line.includes('type="url"') || line.includes('type="password"')) continue;

    const isSearchPlaceholder = /placeholder="[^"]*[Ss]earch[^"]*"/.test(line);
    const hasSearchIconNearby = prev.includes("<Search") || next.includes("<Search") || prev.includes("Search className") || line.includes("pl-8") || line.includes("pl-9");
    if (isSearchPlaceholder || hasSearchIconNearby) {
      candidates.push({ file: f, line: i + 1, text: line.trim(), isSearchPlaceholder, hasSearchIconNearby });
    }
  }
}
console.log(JSON.stringify(candidates, null, 2));
console.log("\nTotal candidates:", candidates.length);
