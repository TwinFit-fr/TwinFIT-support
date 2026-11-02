/**
 * Images for Coach answers live in the `coach-media` Storage bucket. Storage has no folders: the
 * object name carries the path (`lessons/{slug}/{file}`), and the library groups files by that
 * prefix. Pending images (picked in the editor, not uploaded yet) are uploaded on Save into the
 * suggestion's own folder; the library can also upload straight into any folder for reuse.
 */
import { COACH_MEDIA_MAX_BYTES, type Suggestion, type SuggestionKind } from "./types.ts";

/** An image picked in the editor and not uploaded yet; `objectUrl` previews it locally. */
export type PendingImage = { id: string; file: File; objectUrl: string };

/** A file of the coach-media bucket, as the library lists it. */
export type MediaFile = {
  id: string;
  /** Object name, e.g. `lessons/app_overview/1730000000000-squat.png`. */
  name: string;
  /** Public URL the app loads it from. */
  url: string;
  mimeType: string | null;
  size: number | null;
  createdAt: string;
  updatedAt: string;
};

/** Checks a picked file before it enters the draft; returns the error to show, or null. */
export function validateImageFile(file: Pick<File, "name" | "type" | "size">): string | null {
  if (!file.type.startsWith("image/")) {
    return `${file.name || "This file"} is not an image. Only image files can be embedded.`;
  }
  if (file.size > COACH_MEDIA_MAX_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return `${file.name || "This image"} is ${mb} MB; the limit is ${COACH_MEDIA_MAX_BYTES / (1024 * 1024)} MB.`;
  }
  return null;
}

/** The alt text a new image chunk starts with: the file name without its extension. */
export function altFromFileName(name: string): string {
  return displayName(name)
    .replace(/\.[^.]+$/, "")
    .replace(/[[\]\n]/g, " ")
    .trim();
}

// ---- Folders -----------------------------------------------------------------------------------

/** Top-level folders the library always offers. */
export const ROOT_FOLDERS = ["lessons", "prompts", "shared"] as const;

/** `lessons/app_overview`: lower-case segments, up to four deep, no dots or leading slashes. */
const FOLDER_PATTERN = /^[a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9_-]*){0,3}$/;

export function isValidFolder(folder: string): boolean {
  return FOLDER_PATTERN.test(folder);
}

/** The folder a suggestion's own uploads go to: `lessons/{slug}` or `prompts/{slug}`. */
export function suggestionFolder(kind: SuggestionKind, slug: string): string {
  const safeSlug = slug.toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^[^a-z0-9]+/, "") || "untitled";
  return `${kind === "lesson" ? "lessons" : "prompts"}/${safeSlug}`;
}

/** A file name safe for an object name: ASCII letters, digits, `.`, `_`, `-`; never empty or hidden. */
export function safeFileName(fileName: string): string {
  const cleaned = fileName
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 120);
  return cleaned || "image.png";
}

/** The object name of a new upload: the folder, a timestamp so names never collide, the file name. */
export function mediaObjectName(folder: string, fileName: string, now: number = Date.now()): string {
  return `${folder}/${now}-${safeFileName(fileName)}`;
}

/** Validates a full object name for a rename or move. */
export function isValidObjectName(name: string): boolean {
  const slash = name.lastIndexOf("/");
  if (slash <= 0) return false;
  const folder = name.slice(0, slash);
  const file = name.slice(slash + 1);
  return isValidFolder(folder) && file.length > 0 && safeFileName(file) === file;
}

/** The folder part of an object name ("" for the bucket root). */
export function folderOf(name: string): string {
  const slash = name.lastIndexOf("/");
  return slash < 0 ? "" : name.slice(0, slash);
}

/** The file name without the folder and without the upload timestamp prefix. */
export function displayName(name: string): string {
  const leaf = name.slice(name.lastIndexOf("/") + 1);
  return leaf.replace(/^\d{10,14}-/, "");
}

export type FolderNode = {
  /** Full path, "" for the root. */
  path: string;
  /** Last segment. */
  name: string;
  /** Files directly inside. */
  count: number;
  /** Files inside, including subfolders. */
  total: number;
  children: FolderNode[];
};

/**
 * The folder tree of a file list. `always` lists folders shown even when empty (the suggestion's
 * own folder and the root folders), so an upload can target them.
 */
export function buildFolderTree(files: readonly { name: string }[], always: readonly string[] = ROOT_FOLDERS): FolderNode {
  const root: FolderNode = { path: "", name: "", count: 0, total: 0, children: [] };
  const ensure = (path: string): FolderNode => {
    if (path === "") return root;
    let node = root;
    let current = "";
    for (const segment of path.split("/")) {
      current = current ? `${current}/${segment}` : segment;
      let child = node.children.find((c) => c.path === current);
      if (!child) {
        child = { path: current, name: segment, count: 0, total: 0, children: [] };
        node.children.push(child);
        node.children.sort((a, b) => a.name.localeCompare(b.name));
      }
      node = child;
    }
    return node;
  };
  for (const folder of always) if (isValidFolder(folder)) ensure(folder);
  for (const file of files) {
    const folder = folderOf(file.name);
    ensure(folder).count++;
    let path = "";
    root.total++;
    for (const segment of folder === "" ? [] : folder.split("/")) {
      path = path ? `${path}/${segment}` : segment;
      ensure(path).total++;
    }
  }
  return root;
}

/** Files whose folder is `folder` (or inside it when `recursive`). */
export function filesInFolder<T extends { name: string }>(files: readonly T[], folder: string, recursive = false): T[] {
  return files.filter((file) => {
    const own = folderOf(file.name);
    return own === folder || (recursive && (folder === "" || own.startsWith(`${folder}/`)));
  });
}

/** Slugs of the suggestions whose answers embed `url`. */
export function slugsReferencing(suggestions: readonly Suggestion[], url: string): string[] {
  return suggestions
    .filter((row) => row.localizations.some((loc) => (loc.answer_md ?? "").includes(url)))
    .map((row) => row.slug);
}

export function formatBytes(size: number | null): string {
  if (size === null) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
