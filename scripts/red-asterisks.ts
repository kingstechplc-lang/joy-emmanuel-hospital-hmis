// One-off script: Replace "<Label>Foo *</Label>" with "<FieldLabel required>Foo</FieldLabel>"
// across all view files. Idempotent.
import * as fs from "fs";
import { glob } from "glob";

async function main() {
  const files = await glob("src/components/views/**/*.tsx");
  let totalReplacements = 0;
  let filesChanged = 0;

  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    let newContent = content;

    // Skip files that don't use Label
    if (!content.includes("<Label>")) continue;

    // Pattern: <Label>Some Text *</Label>  →  <FieldLabel required>Some Text</FieldLabel>
    // Also handles: <Label className="...">Text *</Label>
    // Use a non-greedy match

    // Pattern 1: <Label>Foo *</Label>
    newContent = newContent.replace(
      /<Label>([^<]+?)\s*\*<\/Label>/g,
      (_m, text) => {
        totalReplacements++;
        return `<FieldLabel required>${text}</FieldLabel>`;
      }
    );

    // Pattern 2: <Label className="...">Foo *</Label>
    newContent = newContent.replace(
      /<Label className="([^"]+)">([^<]+?)\s*\*<\/Label>/g,
      (_m, cls, text) => {
        totalReplacements++;
        return `<FieldLabel required className="${cls}">${text}</FieldLabel>`;
      }
    );

    // Pattern 3: <Label htmlFor="...">Foo *</Label>
    newContent = newContent.replace(
      /<Label htmlFor="([^"]+)">([^<]+?)\s*\*<\/Label>/g,
      (_m, htm, text) => {
        totalReplacements++;
        return `<FieldLabel required htmlFor="${htm}">${text}</FieldLabel>`;
      }
    );

    if (newContent !== content) {
      // Add import for FieldLabel if not present
      if (!newContent.includes("FieldLabel")) {
        // Find existing imports to insert after
        const importMatch = newContent.match(/^import[^;]+;\n/gm);
        if (importMatch) {
          const lastImport = importMatch[importMatch.length - 1];
          const lastImportIdx = newContent.lastIndexOf(lastImport);
          newContent =
            newContent.slice(0, lastImportIdx + lastImport.length) +
            'import { FieldLabel } from "@/components/ui/required-label";\n' +
            newContent.slice(lastImportIdx + lastImport.length);
        } else {
          // No imports — add at top
          newContent =
            'import { FieldLabel } from "@/components/ui/required-label";\n' +
            newContent;
        }
      }
      fs.writeFileSync(file, newContent);
      filesChanged++;
      console.log(`✓ ${file} — ${content.split("<Label>").length - 1} labels found`);
    }
  }

  console.log(`\nDone. Replaced ${totalReplacements} required asterisks across ${filesChanged} files.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
