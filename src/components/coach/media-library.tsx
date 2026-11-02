"use client";

import { useId, useMemo, useRef, useState } from "react";
import { ChevronRight, FolderOpen, FolderPlus, Search, Trash2, Upload } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button, Input } from "@/components/ui/primitives";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { useStaffFetch, useStaffSWR } from "@/hooks/use-staff-fetch";
import { cn } from "@/lib/utils";
import {
  buildFolderTree,
  displayName,
  filesInFolder,
  folderOf,
  formatBytes,
  isValidFolder,
  slugsReferencing,
  validateImageFile,
  type FolderNode,
  type MediaFile,
} from "@/lib/coach/media";
import type { Suggestion } from "@/lib/coach/types";

/**
 * The coach-media library: every image in the bucket, grouped by folder (`lessons/{slug}`,
 * `prompts/{slug}`, `shared`). Staff pick an image for the answer, upload into a folder (that
 * upload reaches Storage immediately, unlike images dropped into the draft), move files between
 * folders, and delete files no answer uses. Moving a file keeps its URL, so answers never break.
 */

export type LibraryPick = { url: string; alt: string; name: string };

type Props = {
  /** Every suggestion, to show which answers use each image and to block deleting those. */
  suggestions: readonly Suggestion[];
  /** The folder opened first and offered even when empty: the suggestion's own. */
  defaultFolder: string;
  /** What picking does: insert a new image chunk, or replace the selected one's picture. */
  mode: "insert" | "replace";
  onPick: (file: LibraryPick) => void;
  onClose: () => void;
};

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

const ALL = "*";

export function MediaLibraryDialog({ suggestions, defaultFolder, mode, onPick, onClose }: Props) {
  const titleId = useId();
  const staffFetch = useStaffFetch();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, error, isLoading, mutate } = useStaffSWR<{ files: MediaFile[] }>("/api/coach/media");
  const files = useMemo(() => data?.files ?? [], [data]);
  const [folder, setFolder] = useState(defaultFolder);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newFolder, setNewFolder] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const tree = useMemo(() => buildFolderTree(files, ["lessons", "prompts", "shared", defaultFolder]), [files, defaultFolder]);
  const shown = useMemo(() => {
    const inFolder = folder === ALL ? files : filesInFolder(files, folder);
    const q = query.trim().toLowerCase();
    return q ? inFolder.filter((f) => f.name.toLowerCase().includes(q)) : inFolder;
  }, [files, folder, query]);
  const selected = files.find((f) => f.id === selectedId) ?? null;
  const usage = useMemo(() => new Map(files.map((f) => [f.id, slugsReferencing(suggestions, f.url)])), [files, suggestions]);
  const uploadTarget = folder === ALL ? defaultFolder : folder;

  async function upload(picked: File[]) {
    const accepted = picked.filter((file) => {
      const problem = validateImageFile(file);
      if (problem) toast.error(problem, "Not uploaded");
      return !problem;
    });
    if (accepted.length === 0) return;
    setBusy(true);
    try {
      let lastId: string | null = null;
      for (const file of accepted) {
        const result = (await staffFetch("/api/coach/media", {
          method: "POST",
          body: JSON.stringify({
            mimeType: file.type || "image/png",
            data: await readFileAsBase64(file),
            folder: uploadTarget,
            fileName: file.name,
          }),
        })) as { id: string };
        lastId = result.id;
      }
      await mutate();
      if (lastId) setSelectedId(lastId);
      toast.success(`Uploaded ${accepted.length} image${accepted.length === 1 ? "" : "s"} to ${uploadTarget}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function moveSelected(target: string) {
    if (!selected || !isValidFolder(target) || target === folderOf(selected.name)) return;
    setBusy(true);
    try {
      const leaf = selected.name.slice(selected.name.lastIndexOf("/") + 1);
      await staffFetch("/api/coach/media", {
        method: "PATCH",
        body: JSON.stringify({ id: selected.id, name: `${target}/${leaf}` }),
      });
      await mutate();
      setFolder(target);
      toast.success(`Moved to ${target}. Its URL is unchanged.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Move failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteSelected() {
    if (!selected) return;
    const used = usage.get(selected.id) ?? [];
    if (used.length > 0) {
      toast.error(`Used by ${used.join(", ")}. Remove it from those answers first.`, "Not deleted");
      return;
    }
    const ok = await confirm({
      title: `Delete ${displayName(selected.name)} from Storage?`,
      description: "No saved answer uses this image. This cannot be undone.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await staffFetch(`/api/coach/media?id=${encodeURIComponent(selected.id)}`, { method: "DELETE" });
      setSelectedId(null);
      await mutate();
      toast.success("Deleted.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  function pick(file: MediaFile) {
    onPick({ url: file.url, alt: displayName(file.name).replace(/\.[^.]+$/, ""), name: file.name });
  }

  const folderOptions = useMemo(() => {
    const out: string[] = [];
    const walk = (node: FolderNode) => {
      if (node.path) out.push(node.path);
      node.children.forEach(walk);
    };
    walk(tree);
    return out;
  }, [tree]);

  return (
    <Modal onClose={onClose} labelledBy={titleId} dismissible={!busy} className="h-[min(90vh,720px)] max-w-5xl">
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 border-b border-zinc-200 px-4 py-3">
          <h2 id={titleId} className="font-medium">
            Image library · coach-media
          </h2>
          <span className="text-xs text-zinc-500">
            {mode === "insert" ? "Pick an image to insert" : "Pick an image to replace the selected one"}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <label className="relative">
              <Search className="pointer-events-none absolute left-2 top-2.5 h-3.5 w-3.5 text-zinc-400" />
              <Input
                aria-label="Search images by name"
                placeholder="Search"
                className="h-8 w-48 pl-7 text-xs"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
              Close
            </Button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)]">
          <nav aria-label="Folders" className="overflow-y-auto border-r border-zinc-200 p-2 text-sm">
            <FolderButton active={folder === ALL} depth={0} label={`All images (${tree.total})`} onClick={() => setFolder(ALL)} />
            {tree.count > 0 && (
              <FolderButton active={folder === ""} depth={0} label={`(no folder) (${tree.count})`} onClick={() => setFolder("")} />
            )}
            {tree.children.map((node) => (
              <FolderTree key={node.path} node={node} depth={0} current={folder} onSelect={setFolder} />
            ))}
            <div className="mt-2 border-t border-zinc-200 pt-2">
              {newFolder === null ? (
                <button
                  type="button"
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100"
                  onClick={() => setNewFolder(folder === ALL ? "shared/" : `${folder}/`)}
                >
                  <FolderPlus className="h-3.5 w-3.5" /> New folder
                </button>
              ) : (
                <form
                  className="flex flex-col gap-1"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const value = newFolder.replace(/\/+$/, "");
                    if (!isValidFolder(value)) {
                      toast.error("Use lower-case letters, digits, - and _, up to four levels (lessons/app_overview).", "Invalid folder");
                      return;
                    }
                    setFolder(value);
                    setNewFolder(null);
                  }}
                >
                  <Input
                    aria-label="New folder path"
                    className="h-7 text-xs"
                    value={newFolder}
                    autoFocus
                    onChange={(e) => setNewFolder(e.target.value.toLowerCase())}
                  />
                  <span className="text-[11px] text-zinc-500">A folder exists once a file is uploaded into it.</span>
                  <div className="flex gap-1">
                    <Button type="submit" className="h-7 px-2 text-xs">
                      Open
                    </Button>
                    <Button type="button" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setNewFolder(null)}>
                      Cancel
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </nav>

          <div className="flex min-h-0 flex-col">
            <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 px-3 py-2 text-xs text-zinc-600">
              <FolderOpen className="h-4 w-4 text-zinc-400" />
              <span className="font-medium text-zinc-800">{folder === ALL ? "All images" : folder || "(no folder)"}</span>
              <span>
                {shown.length} file{shown.length === 1 ? "" : "s"}
              </span>
              <div className="ml-auto flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="h-7 px-2 text-xs"
                  disabled={busy}
                  onClick={() => fileRef.current?.click()}
                  title="Uploads to Storage now (the answer itself is still written on Save)"
                >
                  <Upload className="h-3.5 w-3.5" /> Upload to {uploadTarget}
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  aria-label={`Upload images to ${uploadTarget}`}
                  onChange={(event) => {
                    void upload(Array.from(event.target.files ?? []));
                    event.target.value = "";
                  }}
                />
              </div>
            </div>

            <div
              className="min-h-0 flex-1 overflow-y-auto p-3"
              onDragOver={(event) => {
                if (Array.from(event.dataTransfer.types).includes("Files")) event.preventDefault();
              }}
              onDrop={(event) => {
                const dropped = Array.from(event.dataTransfer.files ?? []);
                if (dropped.length === 0) return;
                event.preventDefault();
                void upload(dropped);
              }}
            >
              {error ? (
                <p className="text-sm text-red-600">{error.message}</p>
              ) : isLoading && files.length === 0 ? (
                <p className="text-sm text-zinc-500">Loading…</p>
              ) : shown.length === 0 ? (
                <p className="text-sm text-zinc-500">
                  No images here yet. Upload to {uploadTarget}, or drop files into this area.
                </p>
              ) : (
                <ul role="listbox" aria-label="Images" className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
                  {shown.map((file) => {
                    const used = usage.get(file.id) ?? [];
                    const active = file.id === selectedId;
                    return (
                      <li key={file.id} role="option" aria-selected={active}>
                        <button
                          type="button"
                          className={cn(
                            "flex w-full flex-col gap-1 rounded-lg border p-1.5 text-left text-xs hover:border-zinc-400",
                            active ? "border-zinc-900 ring-1 ring-zinc-900" : "border-zinc-200",
                          )}
                          onClick={() => setSelectedId(file.id)}
                          onDoubleClick={() => pick(file)}
                          title={file.name}
                        >
                          <span className="flex aspect-square w-full items-center justify-center overflow-hidden rounded bg-zinc-100">
                            {/* eslint-disable-next-line @next/next/no-img-element -- storage URLs, no optimisation */}
                            <img src={file.url} alt="" loading="lazy" className="max-h-full max-w-full object-contain" />
                          </span>
                          <span className="truncate font-medium text-zinc-800">{displayName(file.name)}</span>
                          <span className="flex justify-between text-[11px] text-zinc-500">
                            <span>{formatBytes(file.size)}</span>
                            <span title={used.length ? `Used by ${used.join(", ")}` : "Not used by any saved answer"}>
                              {used.length ? `used ×${used.length}` : "unused"}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-zinc-200 px-3 py-2 text-xs">
              {selected ? (
                <>
                  <span className="min-w-0 flex-1 truncate text-zinc-600" title={selected.name}>
                    {selected.name}
                    {(usage.get(selected.id) ?? []).length > 0 && ` · used by ${(usage.get(selected.id) ?? []).join(", ")}`}
                  </span>
                  <label className="flex items-center gap-1 text-zinc-600">
                    Move to
                    <select
                      aria-label="Move the selected image to a folder"
                      className="rounded-md border border-zinc-300 bg-white px-1.5 py-1"
                      value={folderOf(selected.name)}
                      disabled={busy}
                      onChange={(e) => void moveSelected(e.target.value)}
                    >
                      {!folderOptions.includes(folderOf(selected.name)) && (
                        <option value={folderOf(selected.name)}>{folderOf(selected.name) || "(no folder)"}</option>
                      )}
                      {folderOptions.map((path) => (
                        <option key={path} value={path}>
                          {path}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-7 px-2 text-xs text-red-600"
                    disabled={busy || (usage.get(selected.id) ?? []).length > 0}
                    title={(usage.get(selected.id) ?? []).length > 0 ? "Used by a saved answer" : "Delete from Storage"}
                    onClick={deleteSelected}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </Button>
                  <Button type="button" className="h-7 px-3 text-xs" disabled={busy} onClick={() => pick(selected)}>
                    {mode === "insert" ? "Insert image" : "Use this image"}
                  </Button>
                </>
              ) : (
                <span className="text-zinc-500">Select an image. Double-click picks it.</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function FolderTree({
  node,
  depth,
  current,
  onSelect,
}: {
  node: FolderNode;
  depth: number;
  current: string;
  onSelect: (path: string) => void;
}) {
  const [open, setOpen] = useState(depth === 0 || current.startsWith(`${node.path}/`));
  const expanded = open || current.startsWith(`${node.path}/`);
  return (
    <div>
      <div className="flex items-center">
        {node.children.length > 0 ? (
          <button
            type="button"
            aria-label={expanded ? `Collapse ${node.path}` : `Expand ${node.path}`}
            aria-expanded={expanded}
            className="rounded p-0.5 text-zinc-500 hover:bg-zinc-100"
            style={{ marginLeft: depth * 12 }}
            onClick={() => setOpen(!expanded)}
          >
            <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-90")} />
          </button>
        ) : (
          <span className="inline-block w-[18px]" style={{ marginLeft: depth * 12 }} />
        )}
        <FolderButton active={current === node.path} depth={0} label={`${node.name} (${node.total})`} onClick={() => onSelect(node.path)} />
      </div>
      {expanded && node.children.map((child) => <FolderTree key={child.path} node={child} depth={depth + 1} current={current} onSelect={onSelect} />)}
    </div>
  );
}

function FolderButton({ active, depth, label, onClick }: { active: boolean; depth: number; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-current={active || undefined}
      className={cn(
        "flex min-w-0 flex-1 items-center gap-1 truncate rounded px-2 py-1 text-left text-xs",
        active ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-100",
      )}
      style={{ marginLeft: depth * 12 }}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
