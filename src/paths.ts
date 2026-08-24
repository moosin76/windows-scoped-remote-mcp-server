import path from "node:path";

/**
 * Normalizes Windows & POSIX paths:
 * - Converts forward slashes to backslashes on Windows
 * - Removes redundant separators and '.'/'..' relative segments
 * - Normalizes drive letter case (e.g. d:\ vs D:\)
 */
export function normalizeCanonicalPath(p: string): string {
  const normalized = path.normalize(path.resolve(p));
  if (process.platform === "win32" && /^[a-zA-Z]:\\/.test(normalized)) {
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }
  return normalized;
}

/**
 * Resolves a given path against a base directory and normalizes it.
 */
export function expandPath(input: string, baseDirectory: string): string {
  if (!input || input.trim() === "") {
    return normalizeCanonicalPath(baseDirectory);
  }
  const trimmed = input.trim();
  if (path.isAbsolute(trimmed)) {
    return normalizeCanonicalPath(trimmed);
  }
  return normalizeCanonicalPath(path.resolve(baseDirectory, trimmed));
}
