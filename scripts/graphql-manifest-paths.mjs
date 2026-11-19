// Path and line-ending helpers for graphql-manifest.mjs. TypeScript reports source file names
// with forward slashes on every OS, while node:path yields backslashes on Windows.

/** Forward-slash form of a path, so it compares equal to a TypeScript file name. */
export function toPosix(file) {
  return file.replaceAll("\\", "/");
}

/** True if both paths point to the same place, whatever the separators. */
export function samePath(a, b) {
  return toPosix(a) === toPosix(b);
}

/** Text with LF line endings only (a CRLF working copy equals the committed LF file). */
export function toLf(text) {
  return text.replaceAll("\r\n", "\n");
}
