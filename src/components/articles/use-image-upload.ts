"use client";

import { useCallback, useState } from "react";
import { useStaffFetch } from "@/hooks/use-staff-fetch";
import { validateImageFile } from "@/lib/coach/media";

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

export type UploadedImage = { id: string; url: string; name: string };

/**
 * Uploads one image straight to the `coach-media` bucket (`POST /api/coach/media`) and returns its
 * public URL. Unlike the lesson editor, an article image reaches Storage at once; the article
 * itself is still written on Save, and the library can delete an image no article uses.
 */
export function useImageUpload(folder: string) {
  const staffFetch = useStaffFetch();
  const [uploading, setUploading] = useState(false);

  const upload = useCallback(
    async (file: File): Promise<UploadedImage> => {
      const problem = validateImageFile(file);
      if (problem) throw new Error(problem);
      setUploading(true);
      try {
        return (await staffFetch("/api/coach/media", {
          method: "POST",
          body: JSON.stringify({
            mimeType: file.type || "image/png",
            data: await readFileAsBase64(file),
            folder,
            fileName: file.name,
          }),
        })) as UploadedImage;
      } finally {
        setUploading(false);
      }
    },
    [staffFetch, folder],
  );

  return { upload, uploading };
}
