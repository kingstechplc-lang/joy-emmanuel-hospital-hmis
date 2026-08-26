// Fix the ClearableSearch import in all files that use it but don't import it.
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
let fixed = 0;

for (const f of files) {
  let src = fs.readFileSync(f, "utf8");
  if (!src.includes("ClearableSearch")) continue; // not used
  if (src.includes("ClearableSearch") && /import\s*\{[^}]*ClearableSearch[^}]*\}\s*from\s*"@\/components\/ui-helpers"/.test(src)) continue; // already imported

  // Find the ui-helpers import
  const importRe = /import\s*\{([^}]*)\}\s*from\s*"@\/components\/ui-helpers"\s*;?/g;
  const importMatch = importRe.exec(src);
  if (importMatch) {
    const oldImport = importMatch[0];
    const namedImports = importMatch[1];
    // Add ClearableSearch if not already there
    if (!namedImports.includes("ClearableSearch")) {
      let newNamed;
      // Trim, remove trailing whitespace, append ", ClearableSearch"
      newNamed = namedImports.replace(/(\s*)$/, "") + ", ClearableSearch";
      const newImport = `import {${newNamed}} from "@/components/ui-helpers"`;
      src = src.replace(oldImport, newImport);
    }
  } else {
    // No ui-helpers import at all — add one
    // Find the last import line
    const imports = src.match(/^import\s.*;?\s*$/gm);
    if (imports && imports.length > 0) {
      const lastImport = imports[imports.length - 1];
      const idx = src.lastIndexOf(lastImport) + lastImport.length;
      src = src.slice(0, idx) + `\nimport { ClearableSearch } from "@/components/ui-helpers";` + src.slice(idx);
    } else {
      // No imports at all — prepend
      src = `import { ClearableSearch } from "@/components/ui-helpers";\n` + src;
    }
  }
  fs.writeFileSync(f, src, "utf8");
  fixed++;
  console.log(`  ✓ Fixed: ${f}`);
}
console.log(`\nTotal files fixed: ${fixed}`);
