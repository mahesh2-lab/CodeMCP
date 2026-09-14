import esbuild from "esbuild";
import JavaScriptObfuscator from "javascript-obfuscator";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");

// Read package.json to get dependencies that should be kept external
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf-8"));
const pkgVersion = pkg.version || "1.1.2";
const externalDeps = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.peerDependencies || {}),
  "node:*",
];

const obfuscatorOptions = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: false,
  debugProtection: false,
  disableConsoleOutput: false,
  identifierNamesGenerator: "hexadecimal",
  log: false,
  numbersToExpressions: true,
  renameGlobals: false,
  selfDefending: false,
  simplify: true,
  splitStrings: true,
  splitStringsChunkLength: 10,
  stringArray: true,
  stringArrayCallsTransform: true,
  stringArrayEncoding: ["base64", "rc4"],
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayThreshold: 0.8,
  target: "node",
  transformObjectKeys: false,
  unicodeEscapeSequence: false,
};

async function build() {
  console.log("🧹 Cleaning dist directory...");
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
  }
  fs.mkdirSync(distDir, { recursive: true });

  const rootIcon = path.join(rootDir, "icon.png");
  if (fs.existsSync(rootIcon)) {
    fs.copyFileSync(rootIcon, path.join(distDir, "icon.png"));
    console.log("🖼 Copied icon.png to dist/icon.png");
  }

  const rootBanner = path.join(rootDir, "banner.png");
  if (fs.existsSync(rootBanner)) {
    fs.copyFileSync(rootBanner, path.join(distDir, "banner.png"));
    console.log("🖼 Copied banner.png to dist/banner.png");
  }

  console.log(`📦 Building CodeMCP v${pkgVersion} with esbuild...`);

  // 1. Build server.js -> dist/server.js
  await esbuild.build({
    entryPoints: [path.join(rootDir, "src", "server.js")],
    outfile: path.join(distDir, "server.js"),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node18",
    packages: "external",
    external: externalDeps,
    banner: {
      js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
    },
  });

  // 2. Build cli.js -> dist/cli.js
  await esbuild.build({
    entryPoints: [path.join(rootDir, "bin", "cli.js")],
    outfile: path.join(distDir, "cli.js"),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node18",
    packages: "external",
    external: [...externalDeps, "./server.js", "../src/server.js"],
    banner: {
      js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
    },
  });

  // Adjust cli.js import path from ../src/server.js to ./server.js
  let cliContent = fs.readFileSync(path.join(distDir, "cli.js"), "utf-8");
  cliContent = cliContent.replace(/import\(["']\.\.\/src\/server\.js["']\)/g, 'import("./server.js")');
  fs.writeFileSync(path.join(distDir, "cli.js"), cliContent, "utf-8");

  console.log("🔒 Obfuscating dist/server.js with JavaScriptObfuscator...");
  const serverCode = fs.readFileSync(path.join(distDir, "server.js"), "utf-8");
  const obfuscatedServer = JavaScriptObfuscator.obfuscate(serverCode, obfuscatorOptions);
  fs.writeFileSync(path.join(distDir, "server.js"), obfuscatedServer.getObfuscatedCode(), "utf-8");

  console.log("🔒 Obfuscating dist/cli.js with JavaScriptObfuscator...");
  let cliCode = fs.readFileSync(path.join(distDir, "cli.js"), "utf-8");
  // Remove all shebang lines before obfuscation
  cliCode = cliCode.replace(/^(#!.*\r?\n)+/, "");

  const obfuscatedCli = JavaScriptObfuscator.obfuscate(cliCode, obfuscatorOptions);
  fs.writeFileSync(
    path.join(distDir, "cli.js"),
    "#!/usr/bin/env node\n" + obfuscatedCli.getObfuscatedCode(),
    { encoding: "utf-8", mode: 0o755 }
  );

  console.log("✔ Compilation and obfuscation completed successfully!");
}

build().catch((err) => {
  console.error("❌ Build failed:", err);
  process.exit(1);
});
