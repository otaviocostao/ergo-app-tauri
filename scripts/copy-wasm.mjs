import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const srcWasmDir = path.join(
  projectRoot,
  "node_modules",
  "@mediapipe",
  "tasks-vision",
  "wasm"
);
const destWasmDir = path.join(projectRoot, "public", "wasm");

function copyWasmFiles() {
  if (!fs.existsSync(srcWasmDir)) {
    console.error(`[Error] MediaPipe WASM directory not found at: ${srcWasmDir}`);
    console.error("Please run 'npm install' first.");
    process.exit(1);
  }

  if (!fs.existsSync(destWasmDir)) {
    fs.mkdirSync(destWasmDir, { recursive: true });
  }

  const files = fs.readdirSync(srcWasmDir);
  for (const file of files) {
    const srcFile = path.join(srcWasmDir, file);
    const destFile = path.join(destWasmDir, file);
    fs.copyFileSync(srcFile, destFile);
  }

  console.log(`[Success] Copied ${files.length} MediaPipe WASM files to public/wasm/`);
}

copyWasmFiles();
