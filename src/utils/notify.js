// notify.js
import { exec } from "node:child_process";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SENDER_NAME = "CodeMCP";

/**
 * Resolves the default CodeMCP icon (icon.png) across different runtime contexts
 * (source in src/utils, compiled bundle in dist/, or current working directory).
 *
 * @returns {string} Absolute path to icon.png if found, else empty string.
 */
function getDefaultIconPath() {
  try {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const candidates = [
      path.resolve(currentDir, "../../assets/icon.png"), // from src/utils/
      path.resolve(currentDir, "../assets/icon.png"),    // from dist/ or src/
      path.resolve(currentDir, "./assets/icon.png"),
      path.resolve(currentDir, "../../icon.png"),
      path.resolve(currentDir, "../icon.png"),
      path.resolve(currentDir, "./icon.png"),
      path.resolve(process.cwd(), "assets/icon.png"),
      path.resolve(process.cwd(), "icon.png"),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  } catch {
    const cwdAssetsIcon = path.resolve(process.cwd(), "assets/icon.png");
    if (fs.existsSync(cwdAssetsIcon)) {
      return cwdAssetsIcon;
    }
    const cwdIcon = path.resolve(process.cwd(), "icon.png");
    if (fs.existsSync(cwdIcon)) {
      return cwdIcon;
    }
  }
  return "";
}

/**
 * Escapes XML special characters for Toast XML templates.
 *
 * @param {string} str
 * @returns {string}
 */
function escapeForXml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Sends a native desktop notification with the CodeMCP sender name and icon.
 *
 * Supports both argument list: notify(title, message, iconPath)
 * and options object: notify({ title, message, icon, iconPath })
 *
 * @param {string|object} [titleOrOptions="CodeMCP"]
 * @param {string} [message=""]
 * @param {string} [iconPath=""]
 */
export function notify(titleOrOptions = SENDER_NAME, message = "", iconPath = "") {
  try {
    let title = SENDER_NAME;
    let msg = "";
    let icon = "";

    if (typeof titleOrOptions === "object" && titleOrOptions !== null) {
      title = titleOrOptions.title || SENDER_NAME;
      msg = titleOrOptions.message || titleOrOptions.body || "";
      icon = titleOrOptions.icon || titleOrOptions.iconPath || "";
    } else {
      title = titleOrOptions || SENDER_NAME;
      msg = message || "";
      icon = iconPath || "";
    }

    // Resolve icon: use specified icon if valid, otherwise fallback to default CodeMCP icon
    const resolvedIcon = icon && fs.existsSync(icon)
      ? path.resolve(icon)
      : getDefaultIconPath();

    const platform = os.platform();

    if (platform === "win32") {
      notifyWindows(title, msg, resolvedIcon);
    } else if (platform === "darwin") {
      notifyMac(title, msg, resolvedIcon);
    } else if (platform === "linux") {
      notifyLinux(title, msg, resolvedIcon);
    } else {
      console.warn(`Notifications not supported on platform: ${platform}`);
    }
  } catch (err) {
    console.error("Notification failed:", err?.message || err);
  }
}

function notifyWindows(title, message, resolvedIcon) {
  try {
    const iconTag = resolvedIcon
      ? `<image placement="appLogoOverride" hint-crop="none" src="${escapeForXml(resolvedIcon)}"/>`
      : "";

    const toastXml = `<?xml version="1.0" encoding="utf-8"?>
<toast>
  <visual>
    <binding template="ToastGeneric">
      <text>${escapeForXml(title)}</text>
      <text>${escapeForXml(message)}</text>
      ${iconTag}
    </binding>
  </visual>
</toast>`;

    const xmlBase64 = Buffer.from(toastXml, "utf8").toString("base64");
    const iconBase64 = resolvedIcon
      ? Buffer.from(resolvedIcon, "utf8").toString("base64")
      : "";

    const script = `
$ErrorActionPreference = 'Stop'
$AppId = '${SENDER_NAME}'
$RegPath = "HKCU:\\Software\\Classes\\AppUserModelId\\$AppId"

try {
  if (!(Test-Path $RegPath)) {
    New-Item -Path $RegPath -Force | Out-Null
  }
  Set-ItemProperty -Path $RegPath -Name 'DisplayName' -Value '${SENDER_NAME}' -Force | Out-Null
  $iconB64 = '${iconBase64}'
  if ($iconB64) {
    $iconPath = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($iconB64))
    if (Test-Path $iconPath) {
      Set-ItemProperty -Path $RegPath -Name 'IconUri' -Value $iconPath -Force | Out-Null
    }
  }
} catch {}

[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.UI.Notifications.ToastNotification, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime] | Out-Null

$xmlBytes = [System.Convert]::FromBase64String('${xmlBase64}')
$xmlText = [System.Text.Encoding]::UTF8.GetString($xmlBytes)
$SerializedXml = New-Object Windows.Data.Xml.Dom.XmlDocument
$SerializedXml.LoadXml($xmlText)
$Toast = [Windows.UI.Notifications.ToastNotification]::new($SerializedXml)

[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($AppId).Show($Toast)
`;

    const tmpFile = path.join(os.tmpdir(), `notify-${Date.now()}-${Math.random().toString(36).slice(2)}.ps1`);
    fs.writeFileSync(tmpFile, script, "utf8");

    exec(
      `powershell -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "${tmpFile}"`,
      (err) => {
        fs.unlink(tmpFile, () => {});
        handleErr(err);
      },
    );
  } catch (err) {
    handleErr(err);
  }
}

function notifyMac(title, message, resolvedIcon) {
  try {
    const escapedTitle = escapeForAS(title || SENDER_NAME);
    const escapedMessage = escapeForAS(message);
    const script = `display notification "${escapedMessage}" with title "${escapedTitle}" subtitle "${SENDER_NAME}"`;
    exec(`osascript -e '${script}'`, handleErr);
  } catch (err) {
    handleErr(err);
  }
}

function notifyLinux(title, message, resolvedIcon) {
  try {
    const iconArg = resolvedIcon ? `-i "${escapeForShell(resolvedIcon)}"` : "";
    exec(
      `notify-send -a "${SENDER_NAME}" ${iconArg} "${escapeForShell(title || SENDER_NAME)}" "${escapeForShell(message)}"`,
      handleErr,
    );
  } catch (err) {
    handleErr(err);
  }
}

function handleErr(err) {
  if (err) console.error("Notification failed:", err.message || err);
}

function escapeForAS(str) {
  return String(str ?? "").replace(/"/g, '\\"');
}

function escapeForShell(str) {
  return String(str ?? "").replace(/"/g, '\\"');
}

