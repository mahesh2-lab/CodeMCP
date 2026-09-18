import esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const packageDir = path.join(rootDir, "package");

// Read package.json to get dependencies that should be kept external
const pkg = JSON.parse(
  fs.readFileSync(path.join(rootDir, "package.json"), "utf-8"),
);
const pkgVersion = pkg.version || "1.1.2";
const externalDeps = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.peerDependencies || {}),
  "node:*",
];

async function build() {
  console.log("🧹 Cleaning dist directory...");
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
  }
  fs.mkdirSync(distDir, { recursive: true });

  console.log("📦 Preparing package staging folder...");
  if (fs.existsSync(packageDir)) {
    fs.rmSync(packageDir, { recursive: true, force: true });
  }
  fs.mkdirSync(packageDir, { recursive: true });

  const packageReadmeSource = path.join(rootDir, "README.md");

  if (fs.existsSync(packageReadmeSource)) {
    fs.copyFileSync(packageReadmeSource, path.join(packageDir, "README.md"));
  }

  const licenseSrc = path.join(rootDir, "LICENSE");
  if (fs.existsSync(licenseSrc)) {
    fs.copyFileSync(licenseSrc, path.join(packageDir, "LICENSE"));
  }

  // Copy assets
  const assetsDir = path.join(rootDir, "assets");
  const distAssetsDir = path.join(distDir, "assets");
  fs.mkdirSync(distAssetsDir, { recursive: true });

  const iconSrc = fs.existsSync(path.join(assetsDir, "icon.png"))
    ? path.join(assetsDir, "icon.png")
    : path.join(rootDir, "icon.png");
  if (fs.existsSync(iconSrc)) {
    fs.copyFileSync(iconSrc, path.join(distAssetsDir, "icon.png"));
    fs.copyFileSync(iconSrc, path.join(distDir, "icon.png"));
    console.log("🖼 Copied icon.png to dist/assets/icon.png & dist/icon.png");
  }

  const bannerSrc = fs.existsSync(path.join(assetsDir, "banner.png"))
    ? path.join(assetsDir, "banner.png")
    : path.join(rootDir, "banner.png");
  if (fs.existsSync(bannerSrc)) {
    fs.copyFileSync(bannerSrc, path.join(distAssetsDir, "banner.png"));
    fs.copyFileSync(bannerSrc, path.join(distDir, "banner.png"));
    console.log(
      "🖼 Copied banner.png to dist/assets/banner.png & dist/banner.png",
    );
  }

  // Copy views content (index.html, style.css)
  const viewsContentSrc = path.join(rootDir, "src", "views", "content");
  const distContentDir = path.join(distDir, "content");
  const packageContentDir = path.join(packageDir, "content");
  if (fs.existsSync(viewsContentSrc)) {
    fs.cpSync(viewsContentSrc, distContentDir, { recursive: true });
    fs.cpSync(viewsContentSrc, packageContentDir, { recursive: true });
    console.log("📄 Copied views/content to dist/content & package/content");
  }

  console.log(
    `📦 Building unified CodeMCP v${pkgVersion} bundle with esbuild...`,
  );

  // Build unified CLI & Server bundle -> dist/cli.js
  await esbuild.build({
    entryPoints: [path.join(rootDir, "bin", "cli.js")],
    outfile: path.join(distDir, "cli.js"),
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

  // Ensure cli.js has executable shebang and permissions
  let cliContent = fs.readFileSync(path.join(distDir, "cli.js"), "utf-8");
  if (!cliContent.startsWith("#!/usr/bin/env node")) {
    cliContent = "#!/usr/bin/env node\n" + cliContent;
  }
  fs.writeFileSync(path.join(distDir, "cli.js"), cliContent, {
    encoding: "utf-8",
    mode: 0o755,
  });

  // Provide dist/server.js for backward compatibility
  fs.writeFileSync(
    path.join(distDir, "server.js"),
    'import "./cli.js";\nexport * from "./cli.js";\n',
    "utf-8",
  );

  console.log("✔ Compilation completed successfully!");
}

build().catch((err) => {
  console.error("❌ Build failed:", err);
  process.exit(1);
});
