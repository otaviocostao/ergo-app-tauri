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
const destModelsWasmDir = path.join(projectRoot, "public", "models", "wasm");

export function copyWasmFiles() {
  if (!fs.existsSync(srcWasmDir)) {
    console.error(`[Error] MediaPipe WASM directory not found at: ${srcWasmDir}`);
    console.error("Please run 'npm install' first.");
    process.exit(1);
  }

  const targetDirs = [destWasmDir, destModelsWasmDir];
  const files = fs.readdirSync(srcWasmDir);

  for (const dir of targetDirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    for (const file of files) {
      const srcFile = path.join(srcWasmDir, file);
      const destFile = path.join(dir, file);
      fs.copyFileSync(srcFile, destFile);
    }
  }

  console.log(
    `[Success] Copied ${files.length} MediaPipe WASM files to public/wasm/ and public/models/wasm/`
  );
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  copyWasmFiles();
}
