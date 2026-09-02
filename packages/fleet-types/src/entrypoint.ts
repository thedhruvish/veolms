import { existsSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Determines whether the given module (identified by its `import.meta.url`) is
 * the main entry point executed by Node.js.
 *
 * Handles cross-platform differences such as:
 * - Windows backslashes (`\`) vs file URL forward slashes (`/`)
 * - Windows drive letter casing differences (`c:` vs `C:`)
 * - Relative vs absolute paths passed to `process.argv[1]`
 * - Symlinks and pnpm virtual paths via realpath comparison
 */
export function isMainModule(
  importMetaUrl: string,
  argv1: string | undefined = process.argv[1],
): boolean {
  if (!argv1) {
    return false;
  }

  try {
    const scriptPath = resolve(argv1);
    const modulePath = fileURLToPath(importMetaUrl);

    // 1. Direct path comparison
    if (scriptPath === modulePath) {
      return true;
    }

    // 2. Case-insensitive path comparison (crucial for Windows drive letters & paths)
    if (
      process.platform === "win32" &&
      scriptPath.toLowerCase() === modulePath.toLowerCase()
    ) {
      return true;
    }

    // 3. File URL comparison
    if (pathToFileURL(scriptPath).href === importMetaUrl) {
      return true;
    }

    // 4. Symlink / realpath comparison
    if (existsSync(scriptPath) && existsSync(modulePath)) {
      const realScript = realpathSync(scriptPath);
      const realModule = realpathSync(modulePath);
      if (realScript === realModule) {
        return true;
      }
      if (
        process.platform === "win32" &&
        realScript.toLowerCase() === realModule.toLowerCase()
      ) {
        return true;
      }
    }
  } catch {
    // Ignore URL/path parsing errors and fallback to normalized segment matching
  }

  // 5. Fallback for normalized path segment matching across platforms
  const normalizedArgv = argv1.replace(/\\/g, "/");
  const normalizedUrl = importMetaUrl.replace(/\\/g, "/");
  const cleanArgv = normalizedArgv.replace(/^\.?\//, "");

  return (
    normalizedUrl.toLowerCase().endsWith(`/${cleanArgv.toLowerCase()}`) ||
    normalizedUrl.toLowerCase() === cleanArgv.toLowerCase()
  );
}
