// Patch all simple "Input value={search} onChange={...setSearch...}" patterns to use ClearableSearch.
// Also adds the import if missing.
// Idempotent: skips files that already import ClearableSearch at the patch site.
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

// Regex to match the simple pattern (single-line Input with value={search} and setSearch)
// Captures: leading whitespace, the Input element text
const INPUT_RE = /(\s*)<Input(\s+)className="pl-8"\s+placeholder="([^"]+)"\s+value=\{search\}\s+onChange=\{\(e\)\s*=>\s*setSearch\(e\.target\.value\)\}\s*\/>/g;
const INPUT_RE_ALT = /(\s*)<Input(\s+)placeholder="([^"]+)"\s+value=\{search\}\s+onChange=\{\(e\)\s*=>\s*setSearch\(e\.target\.value\)\}\s+className="pl-8"\s*\/>/g;

const files = walk(viewsDir);
let totalPatched = 0;
const patchedFiles = [];

for (const f of files) {
  let src = fs.readFileSync(f, "utf8");
  const orig = src;

  // Count matches for both patterns
  const matches = [];
  let m;
  const re1 = new RegExp(INPUT_RE.source, "g");
  const re2 = new RegExp(INPUT_RE_ALT.source, "g");
  while ((m = re1.exec(src)) !== null) matches.push({ pattern: 1, index: m.index, full: m[0], indent: m[1], placeholder: m[3] });
  while ((m = re2.exec(src)) !== null) matches.push({ pattern: 2, index: m.index, full: m[0], indent: m[1], placeholder: m[3] });

  if (matches.length === 0) continue;

  // Apply replacements (work backwards to keep indices valid)
  matches.sort((a, b) => b.index - a.index);
  for (const match of matches) {
    const replacement = `${match.indent}<ClearableSearch value={search} onChange={setSearch} placeholder="${match.placeholder}" className="pl-0" />`;
    src = src.slice(0, match.index) + replacement + src.slice(match.index + match.full.length);
  }

  // Add import if not present
  if (!src.includes("ClearableSearch")) {
    // Find the ui-helpers import line and add ClearableSearch to it
    const importRe = /(import\s*\{[^}]*\}\s*from\s*"@\/components\/ui-helpers"\s*;?)/g;
    const importMatch = importRe.exec(src);
    if (importMatch) {
      const oldImport = importMatch[1];
      // Add ClearableSearch to the named imports (handle both with/without trailing comma)
      let newImport;
      if (oldImport.includes("ClearableSearch")) {
        newImport = oldImport; // already there somehow
      } else {
        // Insert before the closing }
        newImport = oldImport.replace(/\}(\s*from\s*")/, ", ClearableSearch }$1");
        if (!newImport.includes("ClearableSearch")) {
          // fallback: replace last } before from
          newImport = oldImport.replace(/(\s*)\}(\s*from)/, "$1, ClearableSearch }$2");
        }
      }
      src = src.replace(oldImport, newImport);
    } else {
      // No ui-helpers import — add one after the last import
      const lastImportEnd = src.lastIndexOf("from \"");
      const lineEnd = src.indexOf("\n", lastImportEnd);
      src = src.slice(0, lineEnd + 1) + `import { ClearableSearch } from "@/components/ui-helpers";\n` + src.slice(lineEnd + 1);
    }
  }

  if (src !== orig) {
    fs.writeFileSync(f, src, "utf8");
    patchedFiles.push({ file: f, count: matches.length });
    totalPatched += matches.length;
  }
}

console.log("Patched files:");
for (const p of patchedFiles) {
  console.log(`  ${p.file}: ${p.count} replacement(s)`);
}
console.log(`\nTotal replacements: ${totalPatched}`);
