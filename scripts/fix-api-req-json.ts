// Patch all API routes to safely parse req.json() — prevents empty 500 responses
import * as fs from "fs";
import * as path from "path";

const ROOT = "/home/z/my-project/src/app/api";

let count = 0;
let skipped = 0;

function walk(dir: string) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const full = path.join(dir, f);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      walk(full);
    } else if (f === "route.ts") {
      let content = fs.readFileSync(full, "utf8");
      if (!content.includes("await req.json()")) continue;

      // Skip if already patched (has safeBody or try-catch around req.json)
      if (content.includes("safeBody") || content.includes("// Parse body safely")) {
        skipped++;
        continue;
      }

      // Replace `const body = await req.json();` with a safe version
      // Pattern: `const body = await req.json();`
      const pattern = /const body = await req\.json\(\);/;
      if (pattern.test(content)) {
        const replacement = `let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }`;

        content = content.replace(pattern, replacement);
        fs.writeFileSync(full, content);
        count++;
      } else {
        // Some files do `const body = await req.json()` without semicolon, or
        // destructure directly
        const pattern2 = /const \{([^}]+)\} = await req\.json\(\);/;
        if (pattern2.test(content)) {
          const replacement = `let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }
  const { $1 } = body;`;
          content = content.replace(pattern2, replacement);
          fs.writeFileSync(full, content);
          count++;
        }
      }
    }
  }
}

walk(ROOT);
console.log(`Patched ${count} API routes, skipped ${skipped} (already safe)`);
