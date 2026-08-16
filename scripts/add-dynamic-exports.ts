// One-off script: Add `dynamic = "force-dynamic"` to all API route files
// that don't already have it. Idempotent — safe to re-run.
import * as fs from "fs";
import * as path from "path";
import { glob } from "glob";

const HEADER = `import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;
`;

async function main() {
  const files = await glob("src/app/api/**/route.ts");
  let added = 0;
  let skipped = 0;

  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");

    // Skip if already has the export
    if (content.includes('export const { dynamic') || content.includes('export const dynamic')) {
      skipped++;
      continue;
    }

    // Find the first import line to insert after
    const importEnd = content.indexOf("\n\n", content.lastIndexOf('import '));
    if (importEnd === -1) {
      console.error(`Could not find import block in ${file}`);
      continue;
    }

    const newContent = content.slice(0, importEnd + 2) + HEADER + "\n" + content.slice(importEnd + 2);
    fs.writeFileSync(file, newContent);
    added++;
    console.log(`✓ Added dynamic export to ${file}`);
  }

  console.log(`\nDone. Added: ${added}, Skipped (already had it): ${skipped}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
