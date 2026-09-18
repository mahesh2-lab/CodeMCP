import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Load the HTML template once at module-init time. */
const TEMPLATE = readFileSync(
  join(__dirname, "content", "index.html"),
  "utf8"
);

export function renderAuthorizeHtml({
  projectName,
  clientName,
  clientId,
  redirectUri,
  codeChallenge,
  codeChallengeMethod,
  state,
  scope,
  errorMessage = "",
}) {
  const errorBox = errorMessage
    ? `<div class="error-box">
        <span class="error-icon">!</span>
        <span>${escapeHtml(errorMessage)}</span>
      </div>`
    : "";

  return TEMPLATE
    .replace(/\{\{projectName\}\}/g,         escapeHtml(projectName))
    .replace(/\{\{clientName\}\}/g,          escapeHtml(clientName))
    .replace(/\{\{clientId\}\}/g,            escapeHtml(clientId))
    .replace(/\{\{redirectUri\}\}/g,         escapeHtml(redirectUri))
    .replace(/\{\{codeChallenge\}\}/g,       escapeHtml(codeChallenge))
    .replace(/\{\{codeChallengeMethod\}\}/g, escapeHtml(codeChallengeMethod))
    .replace(/\{\{state\}\}/g,              escapeHtml(state || ""))
    .replace(/\{\{scope\}\}/g,              escapeHtml(scope || "mcp"))
    .replace(/\{\{errorBox\}\}/g,           errorBox);
}

export function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g,  "&amp;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;")
    .replace(/"/g,  "&quot;")
    .replace(/'/g,  "&#039;");
}
