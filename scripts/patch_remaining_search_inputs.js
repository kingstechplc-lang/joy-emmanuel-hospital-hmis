// Patch remaining search Input elements to use ClearableSearch.
// Handles two patterns:
//   1. Simple: <Input placeholder="Search..." value={X} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
//   2. Patient-search with side effect: <Input placeholder="Search patient..." value={X} onChange={(e) => { setX(e.target.value); setPatientId(""); }} className="pl-9" />
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

// Files + line numbers to patch (from the audit script)
const targets = [
  { file: "admin/lab-tests/test-details.tsx", line: 614, varName: "memberSearch", setter: "setMemberSearch", placeholder: "Search catalog to link as panel member...", className: "flex-1", sideEffect: null },
  { file: "billing/insurance-claims-view.tsx", line: 1509, varName: "patientQuery", setter: "setPatientQuery", placeholder: "Search patient...", className: "", sideEffect: null },
  { file: "billing/invoices-view.tsx", line: 349, varName: "patientQuery", setter: "setPatientQuery", placeholder: "Search patient...", className: "", sideEffect: null },
  { file: "billing/payments-view.tsx", line: 308, varName: "patientQuery", setter: "setPatientQuery", placeholder: "Search patient...", className: "", sideEffect: null },
  { file: "clinical/appointments-view.tsx", line: 626, varName: "patientQuery", setter: "setPatientQuery", placeholder: "Search patient by name, MRN, phone...", className: "", sideEffect: null },
  { file: "clinical/consultations-view.tsx", line: 445, varName: "patientQuery", setter: "setPatientQuery", placeholder: "Search patient...", className: "", sideEffect: null },
  { file: "extended/ambulance-view.tsx", line: 359, varName: "patientQuery", setter: "setPatientQuery", placeholder: "Search patient…", className: "", sideEffect: null, extraClass: "h-8 text-sm" },
  { file: "imaging/imaging-view.tsx", line: 303, varName: "patientQuery", setter: "setPatientQuery", placeholder: "Search patient...", className: "", sideEffect: null },
  { file: "inpatient/admissions-view.tsx", line: 767, varName: "patientQuery", setter: "setPatientQuery", placeholder: "Search by name, number, phone, Ghana Card...", className: "", sideEffect: null },
  { file: "inpatient/discharges-view.tsx", line: 226, varName: "patientQuery", setter: "setPatientQuery", placeholder: "Search patient...", className: "", sideEffect: null },
  { file: "inpatient/nursing-view.tsx", line: 373, varName: "query", setter: "setQuery", placeholder: "Search patient...", className: "", sideEffect: 'setPatientId("")' },
  { file: "inpatient/nursing-view.tsx", line: 946, varName: "searchPatient", setter: "setSearchPatient", placeholder: "Search patient for timeline...", className: "flex-1", sideEffect: 'setResolvedPatientId("")' },
  { file: "inpatient/transfers-view.tsx", line: 288, varName: "patientQuery", setter: "setPatientQuery", placeholder: "Search patient...", className: "", sideEffect: null },
  { file: "inventory/purchase-orders-view.tsx", line: 294, varName: "invQuery", setter: "setInvQuery", placeholder: "Search inventory items by name or SKU", className: "", sideEffect: null, disabled: "facilityId" },
  { file: "lab/lab-orders-view.tsx", line: 368, varName: "patientQuery", setter: "setPatientQuery", placeholder: "Search patient...", className: "", sideEffect: null },
  { file: "operations/documents-view.tsx", line: 320, varName: "patientSearch", setter: "searchPatients", placeholder: "Search patient by name or number...", className: "", sideEffect: null, isFunction: true },
  { file: "procedures/procedures-view.tsx", line: 267, varName: "patientQuery", setter: "setPatientQuery", placeholder: "Search patient...", className: "", sideEffect: null },
  { file: "procedures/procedures-view.tsx", line: 311, varName: "catalogSearch", setter: "setCatalogSearch", placeholder: "Search catalog by name or code...", className: "", sideEffect: null },
];

let totalPatched = 0;
const patchedFiles = [];

for (const t of targets) {
  const f = path.join(viewsDir, t.file);
  if (!fs.existsSync(f)) {
    console.log(`SKIP (not found): ${f}`);
    continue;
  }
  let src = fs.readFileSync(f, "utf8");
  const lines = src.split("\n");
  const lineIdx = t.line - 1;
  const origLine = lines[lineIdx];
  if (!origLine || !origLine.includes("<Input")) {
    console.log(`SKIP (line ${t.line} not Input): ${f}`);
    continue;
  }

  // Build the replacement ClearableSearch element
  // If there's a side effect, wrap in onChange callback
  let onChangeExpr;
  if (t.isFunction) {
    // setter is a function like searchPatients(v)
    onChangeExpr = `(v) => ${t.setter}(v)`;
  } else if (t.sideEffect) {
    onChangeExpr = `(v) => { ${t.setter}(v); ${t.sideEffect}; }`;
  } else {
    onChangeExpr = t.setter;
  }

  const extraClass = t.extraClass || "";
  const disabledAttr = t.disabled ? ` disabled={!${t.disabled}}` : "";
  const newLine = `            <ClearableSearch value={${t.varName}} onChange={${onChangeExpr}} placeholder="${t.placeholder}" className="${t.className}" inputClassName="${extraClass}"${disabledAttr} />`;

  lines[lineIdx] = newLine;
  src = lines.join("\n");

  // Add import if missing
  if (!src.includes("ClearableSearch")) {
    const importRe = /(import\s*\{[^}]*\}\s*from\s*"@\/components\/ui-helpers"[^;]*;?)/g;
    const importMatch = importRe.exec(src);
    if (importMatch) {
      const oldImport = importMatch[1];
      const newImport = oldImport.replace(/\}(\s*from\s*")/, ", ClearableSearch }$1");
      src = src.replace(oldImport, newImport);
    } else {
      // Insert at top after last import
      const importEnd = src.lastIndexOf("from \"");
      const lineEnd = src.indexOf("\n", importEnd);
      src = src.slice(0, lineEnd + 1) + `import { ClearableSearch } from "@/components/ui-helpers";\n` + src.slice(lineEnd + 1);
    }
  }

  fs.writeFileSync(f, src, "utf8");
  if (!patchedFiles.includes(f)) patchedFiles.push(f);
  totalPatched++;
}

console.log(`\nPatched ${totalPatched} search inputs across ${patchedFiles.length} files:`);
for (const f of patchedFiles) console.log(`  ✓ ${f}`);
