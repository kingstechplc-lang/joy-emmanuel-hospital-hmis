// Patch pagination into remaining views that have `const items: any[] = data?.items || [];`
const fs = require("fs");
const path = require("path");

const viewsDir = "/home/z/my-project/src/components/views";

const targets = [
  { file: "billing/invoices-view.tsx", pageSize: 10 },
  { file: "billing/payments-view.tsx", pageSize: 10 },
  { file: "billing/insurance-claims-view.tsx", pageSize: 10 },
  { file: "billing/refunds-view.tsx", pageSize: 10 },
  { file: "inpatient/transfers-view.tsx", pageSize: 10 },
  { file: "inpatient/discharges-view.tsx", pageSize: 10 },
  { file: "hr/attendance-view.tsx", pageSize: 10 },
  { file: "hr/certifications-view.tsx", pageSize: 10 },
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

  // 2. Find `const items: any[] = data?.items || [];` and add usePagination after it
  const declPattern = /(const\s+items\s*:\s*any\[\]\s*=\s*data\?\.\w+\s*\|\|\s*\[\]\s*;)/;
  const declMatch = declPattern.exec(src);
  if (!declMatch) { console.log(`SKIP (no items decl): ${f}`); continue; }
  const declLine = declMatch[1];
  const newDecl = declLine + `\n  const { page, pageSize, totalPages, totalItems, pagedItems, setPage, setPageSize } = usePagination(items, ${t.pageSize});`;
  src = src.replace(declLine, newDecl);

  // 3. Replace FIRST {items.map( with {pagedItems.map(
  const mapIdx = src.indexOf("{items.map(");
  if (mapIdx !== -1) {
    src = src.slice(0, mapIdx) + "{pagedItems.map(" + src.slice(mapIdx + "{items.map(".length);
  } else {
    console.log(`WARN (no {items.map(): ${f}`);
  }

  // 4. Add <Pagination> after first </table>
  const tableClosePattern = /(<\/table>\s*<\/div>)/;
  const tableCloseMatch = tableClosePattern.exec(src);
  if (tableCloseMatch) {
    const origClose = tableCloseMatch[1];
    const newClose = origClose.replace("</table>\n</div>", "</table>\n            </div>\n            <Pagination page={page} pageSize={pageSize} totalPages={totalPages} totalItems={totalItems} onPageChange={setPage} onPageSizeChange={setPageSize} />");
    src = src.replace(origClose, newClose);
  } else {
    // Try alternative patterns
    const altPattern = /(<\/table>\s*<\/CardContent>)/;
    const altMatch = altPattern.exec(src);
    if (altMatch) {
      const origClose = altMatch[1];
      const newClose = origClose.replace("</table>", "</table>\n            </div>\n            <Pagination page={page} pageSize={pageSize} totalPages={totalPages} totalItems={totalItems} onPageChange={setPage} onPageSizeChange={setPageSize} />\n          ").replace("</CardContent>", "</CardContent>");
      src = src.replace(origClose, newClose);
    } else {
      console.log(`WARN (no </table></div>): ${f}`);
    }
  }

  fs.writeFileSync(f, src, "utf8");
  totalPatched++;
  console.log(`  ✓ Patched: ${f}`);
}
console.log(`\nTotal files patched: ${totalPatched}`);
