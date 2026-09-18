import fs from "node:fs";
import path from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";

const CONTEXT_HEADER = "<!-- This file provides AI context and guidelines for this project. -->";

const DEFAULT_MCPIGNORE = `# MCP security ignore file - sensitive files blocked from AI assistants
.env
.env.*
node_modules
.git
dist
build
.DS_Store
`;

export async function initProject(targetDir = process.cwd(), options = {}) {
  const resolvedDir = path.resolve(targetDir);
  const configJsonPath = path.join(resolvedDir, "codemcp.json");
  const mcpIgnorePath = path.join(resolvedDir, ".mcpignore");
  const gitIgnorePath = path.join(resolvedDir, ".gitignore");
  const contextFilePath = path.join(resolvedDir, "CONTEXT.md");
  const isSilent = Boolean(options.silent);

  if (!isSilent) {
    p.intro(pc.bgCyan(pc.black(" CodeMCP - Project Init ")));
  }

  const existingConfig = fs.existsSync(configJsonPath)
    ? configJsonPath
    : null;

  if (existingConfig && !options.yes) {
    if (isSilent) return;
    const shouldOverwrite = await p.confirm({
      message: `${path.basename(existingConfig)} already exists in ${pc.dim(resolvedDir)}. Overwrite?`,
      initialValue: false,
    });

    if (p.isCancel(shouldOverwrite) || !shouldOverwrite) {
      p.cancel("Initialization cancelled.");
      return;
    }
  }



  // Detect fallback name from directory
  let folderName = path.basename(resolvedDir);
  if (!folderName || folderName === "." || folderName === "/" || folderName === "\\") {
    folderName = "project";
  }

  let defaultName = folderName;
  let defaultDesc = "Project overview and guidelines for AI assistants.";

  // Pre-detect from package.json if present
  const pkgPath = path.join(resolvedDir, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      if (pkg.name && typeof pkg.name === "string" && pkg.name.trim()) {
        defaultName = pkg.name.trim();
      }
      if (pkg.description && typeof pkg.description === "string" && pkg.description.trim()) {
        defaultDesc = pkg.description.trim();
      }
    } catch (err) {
      if (!isSilent) {
        console.warn(pc.yellow(`Warning: Could not parse ${pkgPath}: ${err.message}`));
      }
    }
  }

  let name = defaultName;
  let description = defaultDesc;
  let permission = "both";

  if (!options.yes && process.stdin.isTTY) {
    const nameRes = await p.text({
      message: "Project name:",
      placeholder: defaultName,
      defaultValue: defaultName,
    });
    if (p.isCancel(nameRes)) {
      p.cancel("Init cancelled.");
      return;
    }
    name = (typeof nameRes === "string" && nameRes.trim()) ? nameRes.trim() : defaultName;

    const descRes = await p.text({
      message: "Project description:",
      placeholder: defaultDesc,
      defaultValue: defaultDesc,
    });
    if (p.isCancel(descRes)) {
      p.cancel("Init cancelled.");
      return;
    }
    description = (typeof descRes === "string" && descRes.trim()) ? descRes.trim() : defaultDesc;

    const permRes = await p.select({
      message: "Select tool permissions for AI assistants:",
      options: [
        {
          value: "both",
          label: "Read and Write (Recommended)",
          hint: "AI assistants can inspect code and write edits",
        },
        {
          value: "read",
          label: "Read-only",
          hint: "AI assistants can only list and read files",
        },
        {
          value: "write",
          label: "Write-only",
          hint: "AI assistants can only write/create files",
        },
      ],
      initialValue: "both",
    });
    if (p.isCancel(permRes)) {
      p.cancel("Init cancelled.");
      return;
    }
    permission = permRes || "both";
  }

  let s = null;
  if (!isSilent) {
    s = p.spinner();
    s.start("Initializing project configuration...");
  }

  // 1. Create .mcpignore if missing
  if (!fs.existsSync(mcpIgnorePath)) {
    fs.writeFileSync(mcpIgnorePath, DEFAULT_MCPIGNORE, "utf8");
  } else {
    const current = fs.readFileSync(mcpIgnorePath, "utf8");
    if (!current.includes(".env")) {
      fs.appendFileSync(mcpIgnorePath, "\n.env\n.env.*\n", "utf8");
    }
  }

  // If .gitignore exists, make sure .env is also ignored there
  if (fs.existsSync(gitIgnorePath)) {
    const currentGitIgnore = fs.readFileSync(gitIgnorePath, "utf8");
    if (!currentGitIgnore.includes(".env")) {
      fs.appendFileSync(gitIgnorePath, "\n.env\n.env.*\n", "utf8");
    }
  }

  // 2. Create or update CONTEXT.md with AI context header
  if (!fs.existsSync(contextFilePath)) {
    const initialContext = `${CONTEXT_HEADER}
# ${name}

${description}

## Project Context & Architecture
<!-- Write your architecture notes, key components, coding conventions, and gotchas here. AI assistants read this file automatically as project context. -->
`;
    fs.writeFileSync(contextFilePath, initialContext, "utf8");
  } else {
    const existingContent = fs.readFileSync(contextFilePath, "utf8");
    if (!existingContent.includes(CONTEXT_HEADER)) {
      fs.writeFileSync(contextFilePath, `${CONTEXT_HEADER}\n\n${existingContent}`, "utf8");
    }
  }

  // 3. Create codemcp.json
  const sanitizedId = (name || defaultName || "project")
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  const manifest = {
    id: sanitizedId || "project",
    name: name || defaultName,
    description: description || defaultDesc,
    permission,
    approval: false,
    contextFile: "CONTEXT.md",
  };

  fs.writeFileSync(configJsonPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  if (s) {

    s.stop(pc.green("Project initialized successfully!"));
  }

  if (!isSilent) {
    p.note(
      [
        `Config     : ${configJsonPath}`,
        `Ignore file: ${mcpIgnorePath}`,
        `Context    : ${contextFilePath}`,
        `Permission : ${permission}`,
      ].join("\n"),
      pc.cyan("Setup Summary")
    );

    p.outro(
      `[OK] Ready! Run ${pc.bold(pc.cyan("codemcp"))} in this directory to serve this project to AI assistants.`
    );
  }

}

