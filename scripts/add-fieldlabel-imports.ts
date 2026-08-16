// Add missing FieldLabel imports to all view files that use it
import * as fs from "fs";
import { glob } from "glob";

async function main() {
  const files = await glob("src/components/views/**/*.tsx");
  let fixed = 0;

  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");

    // Skip files that don't use FieldLabel
    if (!content.includes("FieldLabel")) continue;

    // Skip files that already import it
    if (content.includes('import { FieldLabel }') || content.includes("FieldLabel } from")) continue;

    // Find the last import line
    const importLines = content.match(/^import[^;]+;\s*$/gm);
    if (!importLines || importLines.length === 0) {
      // No imports — add at top
      const newContent = 'import { FieldLabel } from "@/components/ui/required-label";\n' + content;
      fs.writeFileSync(file, newContent);
      fixed++;
      console.log(`✓ Added import to top of ${file}`);
      continue;
    }

    const lastImportLine = importLines[importLines.length - 1];
    const lastImportIdx = content.lastIndexOf(lastImportLine);
    const insertPos = lastImportIdx + lastImportLine.length;

    const newContent =
      content.slice(0, insertPos) +
      '\nimport { FieldLabel } from "@/components/ui/required-label";' +
      content.slice(insertPos);

    fs.writeFileSync(file, newContent);
    fixed++;
    console.log(`✓ Added import to ${file}`);
  }

  console.log(`\nDone. Fixed ${fixed} files.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
