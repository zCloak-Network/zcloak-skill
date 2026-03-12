/**
 * Pre-flight Update Check
 *
 * Runs before every CLI command to ensure the CLI package is up-to-date.
 * Since SKILL.md is bundled inside the npm package, updating the package
 * automatically updates SKILL.md — no separate GitHub fetch is needed.
 *
 * Flow:
 *   1. Read ~/.config/zcloak/.last-update-check timestamp
 *   2. If last check was < 15 minutes ago → skip (return immediately)
 *   3. If >= 15 minutes or file missing →
 *      a. Query npm registry for latest published version
 *      b. Compare with local package.json version
 *      c. If outdated → attempt `npm install -g @zcloak/ai-agent@latest`
 *      d. Write current timestamp to .last-update-check
 *
 * Design principles:
 *   - Network failures are silently ignored (never block command execution)
 *   - All output goes to stderr (never pollute stdout / command output)
 *   - Timeout on npm commands (10s for version query, 60s for install)
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

// ---------------------------------------------------------------------------
// Path constants
// ---------------------------------------------------------------------------

/** ESM equivalent of __dirname */
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Package root directory (one level up from dist/) */
const PACKAGE_ROOT = path.resolve(__dirname, '..');

/** Local package.json path */
const LOCAL_PACKAGE_JSON = path.join(PACKAGE_ROOT, 'package.json');

/** Directory for zCloak configuration files */
const CONFIG_DIR = path.join(os.homedir(), '.config', 'zcloak');

/** Timestamp file recording when we last checked for updates */
const CHECK_FILE = path.join(CONFIG_DIR, '.last-update-check');

// ---------------------------------------------------------------------------
// Tuning constants
// ---------------------------------------------------------------------------

/** Minimum interval between update checks: 15 minutes (in milliseconds) */
const CHECK_INTERVAL_MS = 15 * 60 * 1000;

/** npm view timeout (milliseconds) */
const NPM_VIEW_TIMEOUT_MS = 10_000;

/** npm install timeout (milliseconds) */
const NPM_INSTALL_TIMEOUT_MS = 60_000;

/** npm package name for version queries */
const NPM_PACKAGE_NAME = '@zcloak/ai-agent';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result returned by preCheck() to the caller (cli.ts) */
export interface PreCheckResult {
  /** Whether the CLI package was updated (requires re-execution) */
  updated: boolean;
  /** Human / agent-readable message (empty string when nothing changed) */
  message: string;
}

// ---------------------------------------------------------------------------
// Local version helper
// ---------------------------------------------------------------------------

/**
 * Read the local CLI version from package.json.
 * Returns null if the file doesn't exist or can't be parsed.
 */
function getLocalCliVersion(): string | null {
  try {
    const pkg = JSON.parse(fs.readFileSync(LOCAL_PACKAGE_JSON, 'utf-8'));
    return pkg.version ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Timestamp management
// ---------------------------------------------------------------------------

/**
 * Determine whether we should perform an update check right now.
 *
 * Returns true when:
 *   - The timestamp file doesn't exist (first run)
 *   - The file content is invalid
 *   - More than CHECK_INTERVAL_MS has elapsed since the last check
 */
function shouldCheck(): boolean {
  try {
    if (!fs.existsSync(CHECK_FILE)) return true;
    const raw = fs.readFileSync(CHECK_FILE, 'utf-8').trim();
    const timestamp = parseInt(raw, 10);
    if (isNaN(timestamp)) return true;
    return Date.now() - timestamp >= CHECK_INTERVAL_MS;
  } catch {
    return true;
  }
}

/**
 * Record the current time as the last-check timestamp.
 * Creates the config directory if it doesn't exist yet.
 */
function recordCheckTime(): void {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CHECK_FILE, String(Date.now()), 'utf-8');
  } catch {
    // Non-critical — silently ignore write failures
  }
}

// ---------------------------------------------------------------------------
// npm helpers
// ---------------------------------------------------------------------------

/**
 * Query the npm registry for the latest published version of the CLI package.
 *
 * Uses `npm view <pkg> version` which is fast and doesn't require authentication.
 * Returns null on any failure (network, timeout, npm not found).
 */
function getNpmLatestVersion(): string | null {
  try {
    const output = execSync(`npm view ${NPM_PACKAGE_NAME} version`, {
      stdio: 'pipe',
      timeout: NPM_VIEW_TIMEOUT_MS,
      encoding: 'utf-8',
    });
    return output.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Attempt to update the globally-installed CLI package via npm.
 *
 * This may fail if the user doesn't have write permissions to the global
 * node_modules directory (e.g. needs sudo). In that case we return false
 * and the caller will suggest a manual update command.
 */
function updateCli(): boolean {
  try {
    execSync(`npm install -g ${NPM_PACKAGE_NAME}@latest`, {
      stdio: 'pipe',       // suppress npm output
      timeout: NPM_INSTALL_TIMEOUT_MS,
    });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Run the pre-flight update check.
 *
 * Called by cli.ts before dispatching any sub-command. If an update is
 * detected and applied, the returned result contains a descriptive message
 * (for stderr) and `updated: true`.
 *
 * When `updated` is true the caller should exit and prompt the agent /
 * user to re-run the command (the running binary and SKILL.md are stale).
 */
export async function preCheck(): Promise<PreCheckResult> {
  // --- Gate: skip if last check was recent enough ---
  if (!shouldCheck()) {
    return { updated: false, message: '' };
  }

  // --- Read local version from package.json ---
  const localVersion = getLocalCliVersion();

  // --- Query npm registry for latest version ---
  const remoteVersion = getNpmLatestVersion();

  // Query failed → network unreachable; record time and move on
  if (!remoteVersion) {
    recordCheckTime();
    return { updated: false, message: '' };
  }

  // --- Already up-to-date ---
  if (remoteVersion === localVersion) {
    recordCheckTime();
    return { updated: false, message: '' };
  }

  // --- Version mismatch → attempt auto-update ---
  const updated = updateCli();

  // Record the check time regardless of outcome
  recordCheckTime();

  if (updated) {
    // Auto-update succeeded — caller should exit and re-run
    return {
      updated: true,
      message: [
        '[zcloak-ai] Version update detected!',
        `[zcloak-ai] CLI: ${localVersion ?? 'unknown'} → ${remoteVersion} (updated)`,
        '[zcloak-ai] Updates applied. Please re-read the SKILL.md file and re-execute the command.',
      ].join('\n'),
    };
  }

  // Auto-update failed — inform user but don't block command execution
  // (updated remains false so the caller continues normally)
  console.error(
    `[zcloak-ai] CLI update available: ${localVersion ?? 'unknown'} → ${remoteVersion}` +
    ` (run: npm install -g ${NPM_PACKAGE_NAME}@latest)`,
  );
  return { updated: false, message: '' };
}
