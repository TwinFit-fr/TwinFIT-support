"use client";

import { useAccessToken } from "@nhost/react";
import { useCallback, useEffect, useRef } from "react";
import useSWR, { SWRConfiguration, SWRResponse } from "swr";

export function useStaffFetch() {
  const accessToken = useAccessToken();
  const tokenRef = useRef(accessToken);

  useEffect(() => {
    tokenRef.current = accessToken;
  }, [accessToken]);

  return useCallback(async (input: string, init?: RequestInit) => {
    const currentToken = tokenRef.current;
    if (!currentToken) {
      throw new Error("Not authenticated");
    }
    const res = await fetch(input, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${currentToken}`,
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
  }, []);
}

export function useStaffSWR<Data = unknown, ErrorType = Error>(
  key: string | null,
  config?: SWRConfiguration<Data, ErrorType>,
): SWRResponse<Data, ErrorType> {
  const staffFetch = useStaffFetch();
  const accessToken = useAccessToken();

  // Only query when user is authenticated
  const swrKey = accessToken && key ? key : null;

  return useSWR<Data, ErrorType>(
    swrKey,
    async (url: string) => {
      const result = await staffFetch(url);
      return result as Data;
    },
    {
      revalidateOnFocus: false,
      dedupingInterval: 5000,
      keepPreviousData: true,
      ...config,
    },
  );
}
