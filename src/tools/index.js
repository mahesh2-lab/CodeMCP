import { registerListFilesTool } from "./listFiles.js";
import { registerReadFileTool } from "./readFile.js";
import { registerWriteFileTool } from "./writeFile.js";
import { registerSearchCodeTool } from "./searchCode.js";
import { registerDeleteFileTool } from "./deleteFile.js";
import { registerExecuteCommandTool } from "./executeCommand.js";
import { registerProjectContextTool } from "./projectContext.js";

export function registerTools(server, project) {
  const permission = (project?.permission || "both").toLowerCase();

  // Always register context tool
  if (project) {
    registerProjectContextTool(server, project);
  }

  // Read tools
  if (permission === "read" || permission === "both") {
    registerListFilesTool(server, project);
    registerReadFileTool(server, project);
    registerSearchCodeTool(server, project);
  }

  // Write & execution tools
  if (permission === "write" || permission === "both") {
    registerWriteFileTool(server, project);
    registerDeleteFileTool(server, project);
    registerExecuteCommandTool(server, project);
  }
}

export {
  registerListFilesTool,
  registerReadFileTool,
  registerWriteFileTool,
  registerSearchCodeTool,
  registerDeleteFileTool,
  registerExecuteCommandTool,
  registerProjectContextTool,
};
