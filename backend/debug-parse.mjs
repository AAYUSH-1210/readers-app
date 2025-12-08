import fs from "fs";
import path from "path";
import vm from "vm";

const file = path.resolve(process.cwd(), "src/controllers/mlrec.controller.js");
const code = fs.readFileSync(file, "utf8");

try {
  const m = new vm.SourceTextModule(code, { identifier: file });
  console.log("Parsed OK (no syntax error detected by vm.SourceTextModule).");
} catch (e) {
  console.error("SYNTAX ERROR (vm.SourceTextModule)");
  console.error("name:", e.name);
  console.error("message:", e.message);
  console.error("stack:\\n", e.stack);
  process.exit(1);
}