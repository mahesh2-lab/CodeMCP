import fs from "node:fs";
import path from "node:path";
import { getEnv } from "../utils/env.js";

let activeProject = null;

function loadContextFromFile(projectRoot, contextFilename = "CONTEXT.md") {
  let contextPath = path.join(projectRoot, contextFilename);
  if (!fs.existsSync(contextPath) && contextFilename === "CONTEXT.md") {
    contextPath = path.join(projectRoot, "README.md");
  }

  if (fs.existsSync(contextPath)) {
    try {
      return fs.readFileSync(contextPath, "utf8").trim();
    } catch {
      console.warn(`[projects] Warning: Failed to read context file ${contextPath}`);
    }
  }
  return "";
}

export function findProjectConfig(targetDir) {
  const candidate = targetDir || getEnv("PROJECT_ROOT");
  const projectRoot = path.resolve(
    candidate && candidate !== "start" ? candidate : "."
  );

  const defaultContextFile = fs.existsSync(path.join(projectRoot, "CONTEXT.md"))
    ? "CONTEXT.md"
    : fs.existsSync(path.join(projectRoot, "README.md"))
    ? "README.md"
    : "CONTEXT.md";

  const codemcpPath = path.join(projectRoot, "codemcp.json");
  const manifestPath = fs.existsSync(codemcpPath)
    ? codemcpPath
    : null;

  if (manifestPath) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      const contextFile = manifest.contextFile || defaultContextFile;
      const fileContext = loadContextFromFile(projectRoot, contextFile);

      return {
        id: manifest.id || path.basename(projectRoot),
        name: manifest.name || path.basename(projectRoot),
        description: manifest.description || "",
        permission: manifest.permission || "both",
        approval: manifest.approval ?? false,
        contextFile,
        context: fileContext || manifest.context || "",
        root: projectRoot,
        configFile: manifestPath,
      };
    } catch (err) {
      console.warn(`[projects] Warning: Failed to parse ${manifestPath}: ${err.message}`);
    }
  }

  const pkgPath = path.join(projectRoot, "package.json");
  const fallbackContext = loadContextFromFile(projectRoot, defaultContextFile);

  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      return {
        id: pkg.name || path.basename(projectRoot),
        name: pkg.name || path.basename(projectRoot),
        description: pkg.description || "",
        permission: "both",
        contextFile: defaultContextFile,
        context: fallbackContext,
        root: projectRoot,
        configFile: null,
      };
    } catch (err) {
      console.warn(`[projects] Warning: Failed to parse ${pkgPath}: ${err.message}`);
    }
  }

  return {
    id: path.basename(projectRoot),
    name: path.basename(projectRoot),
    description: "",
    permission: "both",
    contextFile: defaultContextFile,
    context: fallbackContext,
    root: projectRoot,
    configFile: null,
  };

}

export function getActiveProject() {
  if (!activeProject) {
    activeProject = findProjectConfig();
  }
  return activeProject;
}

function setActiveProject(project) {
  activeProject = project;
}

export function resetActiveProject() {
  activeProject = null;
}

