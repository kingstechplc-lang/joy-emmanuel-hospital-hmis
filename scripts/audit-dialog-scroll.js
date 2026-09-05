// =====================================================================
// audit-dialog-scroll.js
//
// Audits every <DialogContent> in src/components/views/ to find dialogs
// where the body scroll architecture might be broken.
// =====================================================================

const fs = require("fs");
const path = require("path");

const ROOT = "/home/z/my-project/src/components/views";

function walk(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walk(full));
    else if (entry.name.endsWith(".tsx")) results.push(full);
  }
  return results;
}

function findDialogContents(src) {
  // Find <DialogContent ...> opening tags using brace-aware scanning
  const tags = [];
  let i = 0;
  while (i < src.length) {
    const idx = src.indexOf("<DialogContent", i);
    if (idx === -1) break;
    let j = idx + len("<DialogContent");
    let braceDepth = 0;
    let inString = null;
    let endPos = null;
    while (j < src.length) {
      const ch = src[j];
      if (inString) {
        if (ch === "\\") { j += 2; continue; }
        if (ch === inString) inString = null;
        j++;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") { inString = ch; j++; continue; }
      if (ch === "{") { braceDepth++; j++; continue; }
      if (ch === "}") { if (braceDepth > 0) braceDepth--; j++; continue; }
      if (braceDepth === 0) {
        if (ch === "/" && src[j + 1] === ">") { endPos = j + 2; break; }
        if (ch === ">") { endPos = j + 1; break; }
      }
      j++;
    }
    if (endPos === null) break;
    const tagText = src.slice(idx, endPos);
    const lineNo = src.slice(0, idx).split("\n").length;
    tags.push({ start: idx, end: endPos, tag: tagText, line: lineNo });
    i = endPos;
  }
  return tags;
}

function len(s) { return s.length; }

function findDialogContentBlock(src, openTagEnd) {
  // Find matching </DialogContent>
  const closeIdx = src.indexOf("</DialogContent>", openTagEnd);
  if (closeIdx === -1) return null;
  return src.slice(openTagEnd, closeIdx);
}

function checkDialog(file, src, tagInfo) {
  const issues = [];
  const { tag, line, start, end } = tagInfo;

  // Extract className from the opening tag
  const cnMatch = tag.match(/className\s*=\s*"([^"]*)"/);
  if (!cnMatch) return issues;
  const cn = cnMatch[1];

  // Check 1: has size= but no flex flex-col
  const hasSize = /\bsize\s*=\s*"/.test(tag);
  const hasFlexCol = /\bflex\s+flex-col\b/.test(cn);
  const hasOverflow = /\boverflow-hidden\b/.test(cn);

  if (hasSize && !hasFlexCol) {
    issues.push("size= set but no 'flex flex-col' in className — body's flex-1 won't work");
  }

  // Check 2 & 3: flex flex-col but no overflow-hidden
  if (hasFlexCol && !hasOverflow) {
    issues.push("has 'flex flex-col' but no 'overflow-hidden' — content can overflow dialog bounds");
  }

  // Get the block content between opening tag and </DialogContent>
  const block = findDialogContentBlock(src, end);
  if (!block) return issues;

  // Check 4 & 5: look for body divs with flex-1 or overflow-y-auto
  const bodyDivs = [];
  // Find <div className="...flex-1...overflow-y-auto..."> or <div className="...overflow-y-auto...flex-1...">
  const divRegex = /<div\s+className\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = divRegex.exec(block)) !== null) {
    const divCn = m[1];
    const hasFlex1 = /\bflex-1\b/.test(divCn);
    const hasOverflowY = /\boverflow-y-auto\b/.test(divCn);
    const hasMinH0 = /\bmin-h-0\b/.test(divCn);
    if (hasFlex1 || hasOverflowY) {
      bodyDivs.push({ cn: divCn, hasFlex1, hasOverflowY, hasMinH0 });
    }
  }

  if (hasFlexCol && bodyDivs.length > 0) {
    for (const bd of bodyDivs) {
      if (bd.hasFlex1 && !bd.hasOverflowY) {
        issues.push(`body div has 'flex-1' but no 'overflow-y-auto' — content will overflow without scrollbar`);
      }
      if (bd.hasOverflowY && !bd.hasFlex1) {
        issues.push(`body div has 'overflow-y-auto' but no 'flex-1' — body may not fill space correctly`);
      }
      if (bd.hasFlex1 && bd.hasOverflowY && !bd.hasMinH0) {
        issues.push(`body div has 'flex-1 overflow-y-auto' but no 'min-h-0' — body may not shrink, scroll may not work`);
      }
    }
  }

  // Check 6: DialogContent with NO max-h and NO size= — content can grow unbounded
  if (!hasSize && !/\bmax-h-/.test(cn)) {
    issues.push("no size= and no max-h in className — content can grow beyond viewport");
  }

  return issues;
}

const files = walk(ROOT);
let totalIssues = 0;
let filesWithIssues = 0;

for (const file of files) {
  const src = fs.readFileSync(file, "utf-8");
  const tags = findDialogContents(src);
  if (tags.length === 0) continue;

  const fileIssues = [];
  for (const tag of tags) {
    const issues = checkDialog(file, src, tag);
    if (issues.length > 0) {
      fileIssues.push(`  line ${tag.line}: ${issues.join("; ")}`);
      totalIssues += issues.length;
    }
  }

  if (fileIssues.length > 0) {
    filesWithIssues++;
    const rel = path.relative(ROOT, file);
    console.log(`${rel}:`);
    fileIssues.forEach((i) => console.log(i));
  }
}

console.log(`\n${totalIssues} issue(s) across ${filesWithIssues} file(s).`);
