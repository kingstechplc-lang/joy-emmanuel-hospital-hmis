// Patch all unsafe res.json() calls in client components to use safeJson()
// This fixes "Failed to execute 'json' on 'Response': Unexpected end of JSON input"
import * as fs from "fs";
import * as path from "path";

const ROOT = "/home/z/my-project/src";

// Patterns to replace:
// 1. `const data = await res.json();\n      if (!res.ok) throw new Error(data.error || ...)` → use safeJson
// 2. `const e = await res.json().catch(() => ({}));` → keep as-is (already safe)
// 3. `await res.json()` standalone in fetchJson helper → use safeJson
// 4. `return res.json();` in fetchJson helper → use safeJson

interface Patch {
  file: string;
  oldPattern: RegExp;
  newCode: string;
  description: string;
}

const patches: Patch[] = [];

// Recursively find all .tsx files
function walk(dir: string) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const full = path.join(dir, f);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full);
    else if (f.endsWith(".tsx") || f.endsWith(".ts")) {
      const content = fs.readFileSync(full, "utf8");
      if (!content.includes("res.json()") && !content.includes("response.json()")) continue;

      let modified = content;
      let changed = false;

      // Pattern 1: fetchJson helper that does `if (!res.ok) { const e = await res.json()...} return res.json()`
      // Replace the final `return res.json();` with `return safeJson(res);`
      // and ensure safeJson is imported
      if (modified.includes("return res.json();")) {
        modified = modified.replace(
          /return res\.json\(\);/g,
          "return safeJson(res);"
        );
        changed = true;
      }

      // Pattern 2: `const data = await res.json();\n      if (!res.ok) throw new Error(data.error || ...)`
      // Replace with `const data = await safeJson(res);`
      if (modified.match(/await res\.json\(\);/)) {
        modified = modified.replace(
          /const (\w+) = await res\.json\(\);/g,
          "const $1 = await safeJson(res);"
        );
        changed = true;
      }

      // Pattern 3: `const d = await res.json();` (shorter var name)
      if (modified.match(/await res\.json\(\)/)) {
        modified = modified.replace(
          /const (\w+) = await res\.json\(\)/g,
          "const $1 = await safeJson(res)"
        );
        changed = true;
      }

      // Pattern 4: `await res.json()` in catch blocks that already have `.catch(() => ({}))` — leave alone
      // (These are already safe)

      if (changed) {
        // Ensure safeJson is imported
        // Check if there's an existing import from "@/components/ui-helpers"
        if (modified.includes('from "@/components/ui-helpers"')) {
          // Add safeJson to the existing import
          modified = modified.replace(
            /import \{([^}]+)\} from "@\/components\/ui-helpers";/,
            (match, imports: string) => {
              if (imports.includes("safeJson")) return match;
              return `import {${imports.trim()}, safeJson} from "@/components/ui-helpers";`;
            }
          );
        } else if (modified.includes('from "@/components/ui-helpers"')) {
          // Multiple import lines — add safeJson to the first one
          modified = modified.replace(
            /import \{([^}]+)\} from "@\/components\/ui-helpers";/,
            (match, imports: string) => {
              if (imports.includes("safeJson")) return match;
              return `import {${imports.trim()}, safeJson} from "@/components/ui-helpers";`;
            }
          );
        } else {
          // No existing import — add one at the top (after the last import)
          const lastImportIdx = modified.lastIndexOf("import ");
          if (lastImportIdx !== -1) {
            const lineEnd = modified.indexOf("\n", lastImportIdx);
            modified = modified.slice(0, lineEnd + 1) +
              'import { safeJson } from "@/components/ui-helpers";\n' +
              modified.slice(lineEnd + 1);
          }
        }

        fs.writeFileSync(full, modified);
        patches.push({ file: full, oldPattern: /res\.json\(\)/, newCode: "safeJson(res)", description: "Patched" });
      }
    }
  }
}

walk(ROOT);

console.log(`Patched ${patches.length} files:`);
patches.slice(0, 30).forEach(p => console.log(`  ✓ ${p.file.replace(ROOT, "")}`));
if (patches.length > 30) console.log(`  ... and ${patches.length - 30} more`);
