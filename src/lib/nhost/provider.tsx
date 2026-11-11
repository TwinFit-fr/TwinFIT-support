"use client";

import { NhostReactContext, type NhostClient } from "@nhost/react";

/**
 * Drop-in for `NhostProvider` that starts the auth machine once per client and never stops it.
 *
 * `NhostProvider` starts the machine during render and also hands it to xstate's `useInterpret`,
 * whose effect stops it on unmount. React StrictMode (development) unmounts and remounts every
 * effect once, so the machine was stopped and started again 10 ms later. Each start reads the
 * refresh token from storage and posts it to `/v1/token`; refresh tokens are single use, so the
 * second post got 401 and a page reload landed on /login. Here the machine is started by
 * `AuthClient.start`, which is a no-op once started in the browser, and nothing stops it: the
 * same single running machine production already had.
 */
export function NhostSessionProvider({ nhost, children }: { nhost: NhostClient; children: React.ReactNode }) {
  nhost.auth.client.start({ devTools: nhost.devTools });
  return <NhostReactContext.Provider value={nhost}>{children}</NhostReactContext.Provider>;
}
