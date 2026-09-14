import path from "node:path";
import pc from "picocolors";
import { findProjectConfig } from "../services/projects.js";
import { walk } from "../utils/pathGuard.js";
import { printBox } from "../utils/box.js";
import { isApprovalRequired } from "../services/approval.js";

export function infoProject(targetDir = process.cwd()) {
  const project = findProjectConfig(targetDir);
  const files = [];
  try {
    walk(project.root, "", files, project.root);
  } catch {}

  const permissionText =
    project.permission === "both"
      ? pc.green("Read & Write (both)")
      : project.permission === "write"
        ? pc.yellow("Write-only")
        : pc.cyan("Read-only");

  const approvalText = isApprovalRequired(project, "WRITE")
    ? pc.yellow("Enabled (Ask before changes)")
    : pc.dim("Disabled (Auto-apply)");

  const title = pc.bold(pc.bgCyan(pc.black(" CodeMCP - Project Info ")));
  const rows = [
    `${pc.bold("Name        :")} ${pc.green(project.name)} ${pc.dim(`(${project.id})`)}`,
    `${pc.bold("Root        :")} ${pc.dim(project.root)}`,
    `${pc.bold("Config      :")} ${
      project.configFile
        ? pc.green(path.basename(project.configFile))
        : pc.yellow("(none - using default)")
    }`,
    `${pc.bold("Description :")} ${project.description || pc.dim("(none)")}`,
    `${pc.bold("Permission  :")} ${permissionText}`,
    `${pc.bold("Approval    :")} ${approvalText}`,
    `${pc.bold("Context File:")} ${project.contextFile ? pc.green(project.contextFile) : pc.dim("(none)")}`,
    `${pc.bold("Files       :")} ${pc.cyan(String(files.length))} source files indexed`,
  ];

  printBox(title, rows);
  console.log();
}
