// Patch pagination into multiple view files (corrected — most use 'items').
const fs = require("fs");
const path = require("path");

const viewsDir = "/home/z/my-project/src/components/views";

const targets = [
  { file: "hr/staff-view.tsx", itemsVar: "items", pageSize: 10 },
  { file: "admin/users-admin-view.tsx", itemsVar: "items", pageSize: 10 },
  { file: "admin/insurance-providers-admin-view.tsx", itemsVar: "items", pageSize: 10 },
  { file: "operations/documents-view.tsx", itemsVar: "items", pageSize: 10 },
  // These may use different vars — will be skipped if pattern doesn't match
  { file: "admin/roles-admin-view.tsx", itemsVar: "roles", pageSize: 10 },
  { file: "admin/facilities-admin-view.tsx", itemsVar: "facilities", pageSize: 10 },
  { file: "admin/departments-admin-view.tsx", itemsVar: "departments", pageSize: 10 },
  { file: "admin/permissions-admin-view.tsx", itemsVar: "permissions", pageSize: 15 },
  { file: "admin/diagnosis-engine-view.tsx", itemsVar: "diagnoses", pageSize: 15 },
  { file: "operations/tasks-view.tsx", itemsVar: "tasks", pageSize: 10 },
  { file: "operations/incident-reports-view.tsx", itemsVar: "incidents", pageSize: 10 },
  { file: "lab/lab-results-view.tsx", itemsVar: "results", pageSize: 10 },
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

  // 2. Try multiple item-var patterns
  const patterns = [
    new RegExp(`(const\\s+${t.itemsVar}\\s*=\\s*data\\?\\.[a-zA-Z]+\\s*\\|\\|\\s*\\[\\]\\s*;)`),
    new RegExp(`(const\\s+${t.itemsVar}\\s*=\\s*[a-zA-Z?\\.]+\\s*\\|\\|\\s*\\[\\]\\s*;)`),
    new RegExp(`(const\\s+${t.itemsVar}\\s*=[^;\\n]+\\|\\|\\s*\\[\\];)`),
  ];
  let declMatch = null;
  for (const p of patterns) {
    declMatch = p.exec(src);
    if (declMatch) break;
  }
  if (!declMatch) { console.log(`SKIP (no items decl for ${t.itemsVar}): ${f}`); continue; }
  const declLine = declMatch[1];
  const newDecl = declLine + `\n  const { page, pageSize, totalPages, totalItems, pagedItems, setPage, setPageSize } = usePagination(${t.itemsVar}, ${t.pageSize});`;
  src = src.replace(declLine, newDecl);

  // 3. Replace .map iteration: {<itemsVar>.map( → {pagedItems.map(
  const mapPattern = new RegExp(`\\{${t.itemsVar}\\.map\\(`);
  if (mapPattern.test(src)) {
    src = src.replace(mapPattern, "{pagedItems.map(");
  } else {
    console.log(`WARN (no .map for ${t.itemsVar}): ${f}`);
  }

  // 4. Add <Pagination> right after the first </table>\n</div>
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
