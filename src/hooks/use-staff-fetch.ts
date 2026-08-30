"use client";

import { useAccessToken } from "@nhost/react";
import { useCallback } from "react";

export function useStaffFetch() {
  const accessToken = useAccessToken();

  return useCallback(
    async (input: string, init?: RequestInit) => {
      if (!accessToken) {
        throw new Error("Not authenticated");
      }
      const res = await fetch(input, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...(init?.headers ?? {}),
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const text = await res.text();
      let body: unknown = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = { raw: text };
      }
      if (!res.ok) {
        const message =
          typeof body === "object" && body && "error" in body
            ? String((body as { error: unknown }).error)
            : `Request failed (${res.status})`;
        throw new Error(message);
      }
      return body;
    },
    [accessToken],
  );
}
