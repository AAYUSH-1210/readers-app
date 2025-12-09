// listProject.js
// Run with: node listProject.js
import fs from "fs";
import path from "path";

const EXCLUDE = ["node_modules", ".git"]; // add more if needed

function listDir(dir, indent = "") {
  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    // Skip excluded folders
    if (EXCLUDE.includes(item)) continue;

    if (stat.isDirectory()) {
      console.log(`${indent}📁 ${item}/`);
      listDir(fullPath, indent + "   ");
    } else {
      console.log(`${indent}📄 ${item}`);
    }
  }
}

console.log("📂 Project Structure:\n");
listDir(process.cwd());
