// Find and replace ALL remaining literal asterisks in <Label> tags
// Handles: <Label>Foo *</Label>, <Label className="...">Foo *</Label>,
//          <Label htmlFor="...">Foo *</Label>, and combinations
import * as fs from "fs";
import { glob } from "glob";

async function main() {
  const files = await glob("src/components/views/**/*.tsx");
  let totalReplacements = 0;
  let filesChanged = 0;

  for (const file of files) {
    let content = fs.readFileSync(file, "utf8");
    let newContent = content;
    let fileReplacements = 0;

    // Pattern: <Label [optional attrs]>Text with *</Label>
    // Match any Label tag with an asterisk in its text content
    newContent = newContent.replace(
      /<Label((?:\s+[^>]*)?)>([^<]*?\*[^<]*?)<\/Label>/g,
      (match, attrs, text) => {
        // Check if this is actually a FieldLabel already (shouldn't be, but just in case)
        if (match.includes("FieldLabel")) return match;

        // Extract className if present
        const clsMatch = attrs.match(/className="([^"]+)"/);
        const cls = clsMatch ? clsMatch[1] : "";
        const htmlForMatch = attrs.match(/htmlFor="([^"]+)"/);
        const htmlFor = htmlForMatch ? htmlForMatch[1] : "";

        // Strip the asterisk (and any spaces around it) from the text
        // Also handle complex cases like "Tests * (3 selected)" → "Tests (3 selected)"
        let cleanText = text
          .replace(/\s*\*\s*\(/g, " (")   // "Tests * (3 selected)" → "Tests (3 selected)"
          .replace(/\s*\*\s*$/g, "")      // "Foo *" → "Foo"
          .replace(/\*\s*\(/g, "(")       // "Bed * (only available beds shown)" → "Bed (only available beds shown)"
          .trim();

        // Build the FieldLabel props
        const props: string[] = [`required`];
        if (cls) props.push(`className="${cls}"`);
        if (htmlFor) props.push(`htmlFor="${htmlFor}"`);

        fileReplacements++;
        return `<FieldLabel ${props.join(" ")}>${cleanText}</FieldLabel>`;
      }
    );

    if (newContent !== content) {
      // Add import if not present
      if (!newContent.includes('import { FieldLabel }') && !newContent.includes('FieldLabel } from "@/components/ui/required-label"')) {
        const importMatch = newContent.match(/^import[^;]+;\s*$/gm);
        if (importMatch && importMatch.length > 0) {
          const lastImportLine = importMatch[importMatch.length - 1];
          const lastImportIdx = newContent.lastIndexOf(lastImportLine);
          const insertPos = lastImportIdx + lastImportLine.length;
          newContent =
            newContent.slice(0, insertPos) +
            '\nimport { FieldLabel } from "@/components/ui/required-label";' +
            newContent.slice(insertPos);
        }
      }

      fs.writeFileSync(file, newContent);
      filesChanged++;
      totalReplacements += fileReplacements;
      console.log(`✓ ${file} — ${fileReplacements} replacements`);
    }
  }

  console.log(`\nDone. Replaced ${totalReplacements} remaining asterisks across ${filesChanged} files.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
