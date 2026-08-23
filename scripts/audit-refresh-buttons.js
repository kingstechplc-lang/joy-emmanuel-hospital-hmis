/* eslint-disable */
/**
 * Audit script: list all view files that have a visible Refresh button
 * (onClick={... refetch()}) but don't use isFetching for visual feedback.
 *
 * For each file, print:
 *  - the useQuery destructuring lines (to see what's there)
 *  - the Refresh button lines (to see what's there)
 *
 * Usage: node scripts/audit-refresh-buttons.js
 */
const fs = require("fs");
const path = require("path");

const VIEWS_DIR = path.resolve(__dirname, "../src/components/views");

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const files = walk(VIEWS_DIR);
const issues = [];

for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  const lines = src.split("\n");

  // Find visible Refresh buttons (not ErrorState onRetry)
  const refreshButtonLines = [];
  const useQueryLines = [];
  const hasIsFetching = /isFetching/.test(src);

  lines.forEach((line, i) => {
    if (/\brefetch\s*\(/.test(line) && /onClick/.test(line)) {
      refreshButtonLines.push({ lineNo: i + 1, line: line.trim() });
    }
    if (/useQuery\s*\(/.test(line)) {
      // Look for the destructuring line above
      for (let j = Math.max(0, i - 3); j <= i; j++) {
        if (/const\s*\{.*\}\s*=\s*useQuery/.test(lines[j])) {
          useQueryLines.push({ lineNo: j + 1, line: lines[j].trim() });
          break;
        }
      }
    }
  });

  if (refreshButtonLines.length > 0 && !hasIsFetching) {
    issues.push({
      file: path.relative(process.cwd(), file),
      useQueryLines,
      refreshButtonLines,
    });
  }
}

console.log(`\n=== ${issues.length} views with refresh button but no isFetching ===\n`);
for (const issue of issues) {
  console.log(`📄 ${issue.file}`);
  console.log(`   useQuery:`);
  issue.useQueryLines.forEach((u) => console.log(`     L${u.lineNo}: ${u.line}`));
  console.log(`   refresh buttons:`);
  issue.refreshButtonLines.forEach((r) => console.log(`     L${r.lineNo}: ${r.line}`));
  console.log();
}
