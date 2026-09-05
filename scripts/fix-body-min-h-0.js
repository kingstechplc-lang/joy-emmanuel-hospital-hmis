// =====================================================================
// fix-body-min-h-0.js
//
// Adds `min-h-0` to every <div className="...flex-1 overflow-y-auto...">
// (or similar body scroll div) that doesn't already have it, inside
// DialogContent blocks in src/components/views/.
//
// The `min-h-0` is critical for flex children to shrink below their
// content's natural height.  Without it, `overflow-y-auto` on a flex
// child won't trigger a scrollbar — the child grows to its full
// content height, pushing the footer off-screen and clipping the
// last items.
//
// This is the canonical fix for the "content not scrollable" issue
// reported in the Dispense dialog and similar dialogs across the HMIS.
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

function findDialogContentBlocks(src) {
  // Find <DialogContent ...>...</DialogContent> blocks using brace-aware scanning
  const blocks = [];
  let i = 0;
  while (i < src.length) {
    const idx = src.indexOf("<DialogContent", i);
    if (idx === -1) break;
    let j = idx + "<DialogContent".length;
    let braceDepth = 0;
    let inString = null;
    let openEnd = null;
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
        if (ch === "/" && src[j + 1] === ">") { openEnd = j + 2; break; }
        if (ch === ">") { openEnd = j + 1; break; }
      }
      j++;
    }
    if (openEnd === null) break;
    const closeIdx = src.indexOf("</DialogContent>", openEnd);
    if (closeIdx === -1) break;
    blocks.push({ openStart: idx, openEnd, closeStart: closeIdx, closeEnd: closeIdx + "</DialogContent>".length });
    i = closeIdx + "</DialogContent>".length;
  }
  return blocks;
}

function fixBodyDivs(src, blockStart, blockEnd) {
  // Find all <div className="...flex-1...overflow-y-auto..."> within the block
  // that don't already have min-h-0, and add it.
  const blockSrc = src.slice(blockStart, blockEnd);
  const divRegex = /(<div\s+className\s*=\s*")([^"]*)(")/g;
  let m;
  const fixes = [];
  let offset = blockStart;
  while ((m = divRegex.exec(blockSrc)) !== null) {
    const fullMatch = m[0];
    const prefix = m[1];
    const cn = m[2];
    const suffix = m[3];

    // Check if this div has flex-1 and overflow-y-auto
    const hasFlex1 = /\bflex-1\b/.test(cn);
    const hasOverflowY = /\boverflow-y-auto\b/.test(cn);
    const hasMinH0 = /\bmin-h-0\b/.test(cn);

    if (hasFlex1 && hasOverflowY && !hasMinH0) {
      // Add min-h-0 right after overflow-y-auto
      const newCn = cn.replace(/\boverflow-y-auto\b/, "overflow-y-auto min-h-0");
      const newMatch = prefix + newCn + suffix;
      fixes.push({ original: fullMatch, replacement: newMatch });
    }
  }
  return fixes;
}

function processFile(filePath) {
  const src = fs.readFileSync(filePath, "utf-8");
  const blocks = findDialogContentBlocks(src);
  if (blocks.length === 0) return 0;

  let newSrc = src;
  let changeCount = 0;

  // Process blocks in reverse order so offsets stay valid
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i];
    const blockSrc = src.slice(block.openStart, block.closeEnd);
    const fixes = fixBodyDivs(src, block.openStart, block.closeEnd);
    if (fixes.length === 0) continue;

    // Apply fixes to the block (in reverse order within the block too)
    let newBlockSrc = blockSrc;
    for (let j = fixes.length - 1; j >= 0; j--) {
      newBlockSrc = newBlockSrc.replace(fixes[j].original, fixes[j].replacement);
    }
    newSrc = newSrc.slice(0, block.openStart) + newBlockSrc + newSrc.slice(block.closeEnd);
    changeCount += fixes.length;
  }

  if (changeCount > 0) {
    fs.writeFileSync(filePath, newSrc);
  }
  return changeCount;
}

const files = walk(ROOT);
let totalFiles = 0;
let totalChanges = 0;

for (const file of files) {
  const n = processFile(file);
  if (n > 0) {
    totalFiles++;
    totalChanges += n;
    console.log(`${path.relative(ROOT, file)}: added min-h-0 to ${n} body div(s)`);
  }
}

console.log(`\nDone. Fixed ${totalChanges} body div(s) across ${totalFiles} file(s).`);
