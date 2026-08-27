// Patch pagination into multiple view files.
// For each file: add import, add usePagination hook, swap .map(items) → .map(pagedItems), add <Pagination> after table.
const fs = require("fs");
const path = require("path");

const viewsDir = "/home/z/my-project/src/components/views";

// Each target: { file, itemsVar, mapVarName (the variable iterated, e.g., "items" or "users"), pageSize }
const targets = [
  { file: "inventory/equipment-view.tsx", itemsVar: "items", iterateVar: "items", pageSize: 10 },
  { file: "hr/staff-view.tsx", itemsVar: "staff", iterateVar: "staff", pageSize: 10 },
  { file: "admin/users-admin-view.tsx", itemsVar: "users", iterateVar: "users", pageSize: 10 },
  { file: "admin/roles-admin-view.tsx", itemsVar: "roles", iterateVar: "roles", pageSize: 10 },
  { file: "admin/facilities-admin-view.tsx", itemsVar: "facilities", iterateVar: "facilities", pageSize: 10 },
  { file: "admin/departments-admin-view.tsx", itemsVar: "departments", iterateVar: "departments", pageSize: 10 },
  { file: "admin/permissions-admin-view.tsx", itemsVar: "permissions", iterateVar: "permissions", pageSize: 15 },
  { file: "admin/insurance-providers-admin-view.tsx", itemsVar: "providers", iterateVar: "providers", pageSize: 10 },
  { file: "admin/diagnosis-engine-view.tsx", itemsVar: "diagnoses", iterateVar: "diagnoses", pageSize: 15 },
  { file: "operations/documents-view.tsx", itemsVar: "docs", iterateVar: "docs", pageSize: 10 },
  { file: "operations/tasks-view.tsx", itemsVar: "tasks", iterateVar: "tasks", pageSize: 10 },
  { file: "operations/incident-reports-view.tsx", itemsVar: "incidents", iterateVar: "incidents", pageSize: 10 },
  { file: "lab/lab-results-view.tsx", itemsVar: "results", iterateVar: "results", pageSize: 10 },
];

let totalPatched = 0;

for (const t of targets) {
  const f = path.join(viewsDir, t.file);
  if (!fs.existsSync(f)) { console.log(`SKIP (not found): ${f}`); continue; }
  let src = fs.readFileSync(f, "utf8");

  // Skip if already paginated
  if (src.includes("usePagination")) { console.log(`SKIP (already paginated): ${f}`); continue; }

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

  // 2. Find the items declaration and inject usePagination after it
  // Pattern: const <itemsVar> = data?.items || [];  OR  const <itemsVar> = data?.<itemsVar> || [];
  const declPattern = new RegExp(`(const\\s+${t.itemsVar}\\s*=\\s*[^;\\n]+[;\\n])`);
  const declMatch = declPattern.exec(src);
  if (!declMatch) { console.log(`SKIP (no items decl): ${f}`); continue; }
  const declLine = declMatch[1];
  const newDecl = declLine + `\n  const { page, pageSize, totalPages, totalItems, pagedItems, setPage, setPageSize } = usePagination(${t.itemsVar}, ${t.pageSize});`;
  src = src.replace(declLine, newDecl);

  // 3. Replace the .map iteration: {items.map( → {pagedItems.map(
  // Only the FIRST occurrence inside the table body (be conservative)
  const mapPattern = new RegExp(`\\{${t.iterateVar}\\.map\\(`);
  if (mapPattern.test(src)) {
    src = src.replace(mapPattern, "{pagedItems.map(");
  } else {
    console.log(`WARN (no .map found for ${t.iterateVar}): ${f}`);
  }

  // 4. Add <Pagination> right after the closing </table> tag (first occurrence)
  // Pattern: </table>\n</div>
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
