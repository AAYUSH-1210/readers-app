import fs from "fs";
import path from "path";

const root = process.cwd();
const dirs = [path.join(root, "src"), path.join(root, "tests")];

async function tryImport(file) {
  try {
    await import(`file://${file}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err };
  }
}

(async () => {
  for (const d of dirs) {
    if (!fs.existsSync(d)) continue;
    const walk = (dir) => {
      const out = [];
      for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        const fp = path.join(dir, f.name);
        if (f.isDirectory()) out.push(...walk(fp));
        else if (f.isFile() && f.name.endsWith(".js")) out.push(fp);
      }
      return out;
    };
    const files = walk(d);
    console.log("Scanning", d, "(", files.length, "files )");
    for (const f of files) {
      process.stdout.write("Importing: " + f + " ... ");
      const res = await tryImport(f);
      if (res.ok) {
        console.log("OK");
      } else {
        console.log("FAILED");
        console.error("=== ERROR for file:", f, "===");
        console.error(res.error && (res.error.stack || res.error.toString()));
        process.exit(1);
      }
    }
  }
  console.log("All files imported successfully.");
})();