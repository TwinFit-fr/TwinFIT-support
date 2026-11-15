/**
 * Backend contract this Support build speaks (TwinFIT-backend `COMPATIBILITY_CONTRACT.md`).
 * Bump only when Support adopts a breaking client-facing change published with a new backend
 * `contractVersion`.
 */
export const SUPPORT_CONTRACT_VERSION = 3;

/** Sent with every `api-info` probe: the backend counts probes per day, client and contract. No user data. */
export const PROBE_HEADERS: Readonly<Record<string, string>> = {
  "X-TwinFIT-Client": "support",
  "X-TwinFIT-Contract": String(SUPPORT_CONTRACT_VERSION),
};

export type ApiInfo = {
  contractVersion: number;
  minClientContractVersion: number;
};

export type CompatibilityStatus =
  /** No verdict yet (probe pending or failed). Not blocking. */
  | "unknown"
  | "compatible"
  /** Backend deploy is older than Support (e.g. rollback). Informational. */
  | "backend-behind"
  /** Backend dropped this Support contract. */
  | "update-required";

export function evaluateCompatibility(
  info: ApiInfo,
  clientContractVersion: number = SUPPORT_CONTRACT_VERSION,
): CompatibilityStatus {
  if (clientContractVersion < info.minClientContractVersion) return "update-required";
  if (clientContractVersion > info.contractVersion) return "backend-behind";
  return "compatible";
}

/** Reads an `api-info` payload; null when it is not a valid one (fail open upstream). */
export function parseApiInfo(payload: unknown): ApiInfo | null {
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (p.success !== true) return null;
  const { contractVersion, minClientContractVersion } = p;
  if (!Number.isInteger(contractVersion) || !Number.isInteger(minClientContractVersion)) return null;
  return {
    contractVersion: contractVersion as number,
    minClientContractVersion: minClientContractVersion as number,
  };
}
