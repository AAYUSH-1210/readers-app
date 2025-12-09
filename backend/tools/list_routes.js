// tools/list_routes.js (ESM version)
// Run: node tools/list_routes.js

import fs from "fs";
import path from "path";
import url from "url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

function readAllJs(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) files.push(...readAllJs(p));
    else if (e.isFile() && /\.(js|ts)$/.test(e.name)) files.push(p);
  }
  return files;
}

function findAppUses(files) {
  const mounts = [];
  const regex =
    /app\.use\s*\(\s*(['"`])([^'"`]+)\1\s*,\s*([A-Za-z0-9_$.]+)\s*\)/g;
  files.forEach((f) => {
    const txt = fs.readFileSync(f, "utf8");
    let m;
    while ((m = regex.exec(txt)) !== null) {
      mounts.push({
        file: f,
        mount: m[2],
        varName: m[3],
      });
    }
  });
  return mounts;
}

function findRouterRoutes(files) {
  const routeRegex =
    /([A-Za-z0-9_$]+)\.(get|post|put|delete|patch|all)\s*\(\s*(['"`])([^'"`]+)\3/g;

  const routes = [];
  files.forEach((f) => {
    const txt = fs.readFileSync(f, "utf8");
    let m;
    while ((m = routeRegex.exec(txt)) !== null) {
      routes.push({
        varName: m[1],
        method: m[2].toUpperCase(),
        path: m[4],
        file: f,
      });
    }
  });

  return routes;
}

// MAIN
const projectRoot = path.join(__dirname, "..");
const srcDir = path.join(projectRoot, "src");

if (!fs.existsSync(srcDir)) {
  console.error("❌ No src/ directory found!");
  process.exit(1);
}

const files = readAllJs(srcDir);
const mounts = findAppUses(files);
const routes = findRouterRoutes(files);

console.log("=========================================");
console.log("📌 app.use Mount Points Found");
console.log("=========================================");
mounts.forEach((m) =>
  console.log(`Mount: ${m.mount}  | variable: ${m.varName}  | file: ${m.file}`)
);

console.log("\n=========================================");
console.log("📌 Router-Level Routes Found");
console.log("=========================================");
routes.forEach((r) =>
  console.log(
    `[${r.method}] ${r.path}  | router variable: ${r.varName} | file: ${r.file}`
  )
);

console.log("\n=========================================");
console.log("ℹ️ Combine mount + route manually:");
console.log("Example: If mount is /api/reading and router has .get('/check')");
console.log("→ Full endpoint = /api/reading/check");
console.log("=========================================\n");
