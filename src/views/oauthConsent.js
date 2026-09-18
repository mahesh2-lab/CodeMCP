import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function resolveContentFile(filename) {
  const candidates = [
    join(__dirname, "content", filename),
    join(__dirname, "views", "content", filename),
    join(__dirname, "..", "src", "views", "content", filename),
    join(__dirname, "src", "views", "content", filename),
    join(process.cwd(), "src", "views", "content", filename),
    join(process.cwd(), "dist", "content", filename),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return join(__dirname, "content", filename);
}

let templateCache = null;
function getTemplate() {
  if (!templateCache) {
    const templatePath = resolveContentFile("index.html");
    templateCache = readFileSync(templatePath, "utf8");
  }
  return templateCache;
}

let cssCache = null;
export function getStyleCss() {
  if (!cssCache) {
    const cssPath = resolveContentFile("style.css");
    cssCache = existsSync(cssPath) ? readFileSync(cssPath, "utf8") : "";
  }
  return cssCache;
}

const DEFAULT_CLIENT_ICON =
  "https://raw.githubusercontent.com/mahesh2-lab/CodeMCP/refs/heads/main/assets/icon.png";

const CLIENT_ICON_MAP = [
  { match: /claude/i, icon: "https://thesvg.org/icons/claude/default.svg" },
  { match: /chatgpt|openai/i, icon: "https://thesvg.org/icons/openai-chatgpt/default.svg" },
  { match: /google|gemini/i, icon: "https://thesvg.org/icons/gemini/default.svg" },
  { match: /deepseek/i, icon: "https://thesvg.org/icons/deepseek/default.svg" },
  { match: /Grok/i, icon: "https://thesvg.org/icons/grok/light.svg" },


  { match: /cursor/i, icon: "https://thesvg.org/icons/cursor/default.svg" },
  { match: /windsurf|codeium/i, icon: "https://thesvg.org/icons/windsurf/default.svg" },
  { match: /github|copilot/i, icon: "https://thesvg.org/icons/github/default.svg" },
  { match: /vscode|visual\s*studio/i, icon: "https://thesvg.org/icons/visual-studio-code/default.svg" },
  { match: /codemcp/i, icon: "https://thesvg.org/icons/codemcp/default.svg" },
];


export function resolveClientIcon(clientName, fallback = DEFAULT_CLIENT_ICON) {
  if (!clientName || typeof clientName !== "string") return fallback;
  const trimmed = clientName.trim();
  if (/^(https?:\/\/|data:image\/)/i.test(trimmed)) {
    return trimmed;
  }
  for (const entry of CLIENT_ICON_MAP) {
    if (entry.match.test(trimmed)) {
      return entry.icon;
    }
  }
  return fallback;
}

export function renderAuthorizeHtml({
  projectName,
  clientName,
  clientId,
  redirectUri,
  codeChallenge,
  codeChallengeMethod,
  state,
  scope,
  clientIcon: customIcon,
  errorMessage = "",
}) {
  const errorBox = errorMessage
    ? `<div class="error-box">
        <span class="error-icon">!</span>
        <span>${escapeHtml(errorMessage)}</span>
      </div>`
    : "";
    
  const statusClass = errorMessage ? "is-error" : "is-success";
  const clientIcon = customIcon || resolveClientIcon(clientName);

  return getTemplate().replace(/\{\{projectName\}\}/g, escapeHtml(projectName))
    .replace(/\{\{clientName\}\}/g, escapeHtml(clientName))
    .replace(/\{\{clientId\}\}/g, escapeHtml(clientId))
    .replace(/\{\{redirectUri\}\}/g, escapeHtml(redirectUri))
    .replace(/\{\{codeChallenge\}\}/g, escapeHtml(codeChallenge))
    .replace(/\{\{codeChallengeMethod\}\}/g, escapeHtml(codeChallengeMethod))
    .replace(/\{\{state\}\}/g, escapeHtml(state || ""))
    .replace(/\{\{scope\}\}/g, escapeHtml(scope || "mcp"))
    .replace(/\{\{statusClass\}\}/g, statusClass)
    .replace(/\{\{clientIcon\}\}/g, escapeHtml(clientIcon))
    .replace(/\{\{errorBox\}\}/g, errorBox);
}

export function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
