// Find all views that render a <table> with .map() but do NOT use DataTable or usePagination.
// These are candidates for adding pagination.
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

  // Skip files that already use DataTable or usePagination
  if (src.includes("usePagination") || src.includes("<DataTable") || src.includes("<Pagination ")) continue;

  // Find <table> with .map( — indicates a list table
  const tableMatches = src.match(/<table[^>]*>/g) || [];
  const mapMatches = src.match(/\.map\(\(/g) || [];
  if (tableMatches.length === 0 || mapMatches.length === 0) continue;

  // Check if any of the typical "items" arrays are present
  const itemArrays = ["items", "patients", "admissions", "encounters", "appointments", "prescriptions", "invoices", "payments", "claims", "orders", "results", "staff", "users", "roles", "documents", "notes", "logs", "entries", "records", "transfers", "discharges", "beds", "wards", "facilities", "departments", "suppliers", "equipment", "medications", "diagnoses", "procedures", "referrals", "trips", "incidents", "tasks", "tickets", "units", "transfusions", "admit", "body"].some(name =>
    new RegExp(`\\b${name}\\.map\\(`).test(src) || new RegExp(`\\b${name}\\.filter\\(`).test(src)
  );

  if (!itemArrays) continue;

  // Count table+map pairs
  const lineCount = src.split("\n").length;
  candidates.push({ file: f.replace("/home/z/my-project/src/components/views/", ""), tables: tableMatches.length, maps: mapMatches.length, lines: lineCount });
}
candidates.sort((a, b) => b.maps - a.maps);
console.log(JSON.stringify(candidates, null, 2));
console.log("\nTotal candidate files:", candidates.length);
