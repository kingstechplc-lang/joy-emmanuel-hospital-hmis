// Patch pagination into views where items = (data?.X || []).filter(...)
const fs = require("fs");
const path = require("path");

const viewsDir = "/home/z/my-project/src/components/views";

const targets = [
  { file: "admin/roles-admin-view.tsx", pageSize: 10 },
  { file: "admin/facilities-admin-view.tsx", pageSize: 10 },
  { file: "admin/departments-admin-view.tsx", pageSize: 10 },
  { file: "admin/diagnosis-engine-view.tsx", pageSize: 15 },
  { file: "operations/tasks-view.tsx", pageSize: 10 },
  { file: "operations/incident-reports-view.tsx", pageSize: 10 },
  { file: "admin/permissions-admin-view.tsx", pageSize: 15 },
];

let totalPatched = 0;

for (const t of targets) {
  const f = path.join(viewsDir, t.file);
  if (!fs.existsSync(f)) { console.log(`SKIP (not found): ${f}`); continue; }
  let src = fs.readFileSync(f, "utf8");

  if (src.includes("usePagination")) { console.log(`SKIP (already): ${f}`); continue; }

  // 1. Add usePagination + Pagination to ui-helpers import
  const importRe = /(import\s*\{[^}]*\}\s*from\s*"@\/components\/ui-helpers"[^;]*;?)/g;
  const importMatch = importRe.exec(src);
  if (importMatch) {
    const oldImport = importMatch[1];
    if (!oldImport.includes("usePagination")) {
      let newImport = oldImport.replace(/\}(\s*from\s*")/, ", usePagination, Pagination }$1");
      if (!newImport.includes("usePagination")) {
        newImport = oldImport.replace(/(\s*)\}(\s*from)/, "$1, usePagination, Pagination }$2");
      }
      src = src.replace(oldImport, newImport);
    }
  }

  // 2. Find the FIRST `const items = ...` line that ends with `;` (could be multi-line filter)
  // We need to find the line, then find where it ends (could span multiple lines if it's a filter).
  const lines = src.split("\n");
  let itemsLineIdx = -1;
  let itemsEndIdx = -1;
  let parenDepth = 0;
  let startedCollecting = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match "const items = " (could be with type annotation too)
    if (/^\s*const\s+items\s*[:=]/.test(line) && !line.includes("useState") && !line.includes("useApp")) {
      itemsLineIdx = i;
      // Count parens to find end of statement
      parenDepth = 0;
      startedCollecting = false;
      for (let j = i; j < lines.length; j++) {
        const l = lines[j];
        for (const ch of l) {
          if (ch === "(") { parenDepth++; startedCollecting = true; }
          else if (ch === ")") parenDepth--;
        }
        // If we've started and parens are balanced AND line ends with ;
        if (startedCollecting && parenDepth === 0 && /;\s*$/.test(l)) {
          itemsEndIdx = j;
          break;
        }
        // Also handle single-line case
        if (i === j && /;\s*$/.test(l) && !l.includes("(")) {
          itemsEndIdx = j;
          break;
        }
      }
      break;
    }
  }

  if (itemsLineIdx === -1 || itemsEndIdx === -1) {
    console.log(`SKIP (no items decl): ${f}`);
    continue;
  }

  // Insert the usePagination hook AFTER the items declaration
  const insertLine = `  const { page, pageSize, totalPages, totalItems, pagedItems, setPage, setPageSize } = usePagination(items, ${t.pageSize});`;
  lines.splice(itemsEndIdx + 1, 0, insertLine);
  src = lines.join("\n");

  // 3. Replace FIRST {items.map( with {pagedItems.map(
  const mapIdx = src.indexOf("{items.map(");
  if (mapIdx !== -1) {
    src = src.slice(0, mapIdx) + "{pagedItems.map(" + src.slice(mapIdx + "{items.map(".length);
  } else {
    console.log(`WARN (no {items.map(}): ${f}`);
  }

  // 4. Add <Pagination> right after the FIRST </table>\n</div>
  const tableClosePattern = /(<\/table>\s*<\/div>)/;
  const tableCloseMatch = tableClosePattern.exec(src);
  if (tableCloseMatch) {
    const origClose = tableCloseMatch[1];
    const newClose = origClose.replace("</table>\n</div>", "</table>\n            </div>\n            <Pagination page={page} pageSize={pageSize} totalPages={totalPages} totalItems={totalItems} onPageChange={setPage} onPageSizeChange={setPageSize} />");
    src = src.replace(origClose, newClose);
  } else {
    console.log(`WARN (no </table></div>): ${f}`);
  }

  fs.writeFileSync(f, src, "utf8");
  totalPatched++;
  console.log(`  ✓ Patched: ${f}`);
}
console.log(`\nTotal files patched: ${totalPatched}`);
