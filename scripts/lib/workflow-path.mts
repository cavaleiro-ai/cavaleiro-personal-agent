// Cavaleiro Personal Agent parks upstream workflows that publish, sign, or need upstream
// credentials in .github/workflows-disabled/ (see its README); CI tooling and tests still read them.
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ACTIVE_WORKFLOW_DIR = ".github/workflows";
const PARKED_WORKFLOW_DIR = ".github/workflows-disabled";
const activeWorkflowSegment = /(^|[\\/])\.github([\\/])workflows(?=[\\/])/u;
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

/**
 * Redirects a path inside `.github/workflows/` to the same file in `.github/workflows-disabled/`
 * when only the parked copy exists. Any other path, or one whose file exists, is returned
 * unchanged, so a missing workflow still fails at its original path.
 * @param filePath - Absolute path, or a path relative to `root`.
 * @param root - Directory that relative paths resolve against; defaults to the working directory.
 */
export function resolveWorkflowPath(filePath: string, root = process.cwd()): string {
  if (existsSync(path.resolve(root, filePath))) {
    return filePath;
  }
  const parked = filePath.replace(activeWorkflowSegment, "$1.github$2workflows-disabled");
  return parked !== filePath && existsSync(path.resolve(root, parked)) ? parked : filePath;
}

/**
 * Repository-relative path of the workflow file `name`: `.github/workflows/<name>` when it
 * exists, otherwise `.github/workflows-disabled/<name>` when that exists.
 * @param root - Repository root; defaults to the checkout that contains this module.
 */
export function workflowRepoPath(name: string, root = repoRoot): string {
  return resolveWorkflowPath(`${ACTIVE_WORKFLOW_DIR}/${name}`, root);
}

/** Sorted names of the workflow files (`*.yml`, `*.yaml`) in both directories under `root`. */
export function listWorkflowFileNames(root = process.cwd()): string[] {
  const names = new Set<string>();
  for (const directory of [ACTIVE_WORKFLOW_DIR, PARKED_WORKFLOW_DIR]) {
    const absolute = path.resolve(root, directory);
    if (existsSync(absolute)) {
      for (const name of readdirSync(absolute)) {
        if (/\.ya?ml$/u.test(name)) {
          names.add(name);
        }
      }
    }
  }
  return [...names].toSorted();
}
