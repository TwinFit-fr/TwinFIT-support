"use client";

import { useEffect, useState } from "react";
import { useAccessToken } from "@nhost/react";
import { cn } from "@/lib/utils";

export function AuthedImage({
  fileId,
  alt,
  className,
  published = false,
}: {
  fileId: string | null | undefined;
  alt: string;
  className?: string;
  /** Public bucket files can load without auth when true. */
  published?: boolean;
}) {
  const token = useAccessToken();
  const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN;
  const region = process.env.NEXT_PUBLIC_NHOST_REGION;
  const publicSrc =
    published && fileId && subdomain && region
      ? `https://${subdomain}.storage.${region}.nhost.run/v1/files/${fileId}`
      : null;
  // Tagged with its file so a stale blob is never shown for a new fileId.
  const [blob, setBlob] = useState<{ fileId: string; url: string } | null>(null);

  useEffect(() => {
    if (!fileId || publicSrc || !token) return;
    let objectUrl: string | null = null;
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch(`/api/images/files/${fileId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(data);
        setBlob({ fileId, url: objectUrl });
      } catch {
        if (!cancelled) setBlob(null);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileId, token, publicSrc]);

  const src = publicSrc ?? (blob && blob.fileId === fileId ? blob.url : null);

  if (!src) {
    return <div className={cn("bg-zinc-100", className)} aria-label={alt} />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={className} />
  );
}
