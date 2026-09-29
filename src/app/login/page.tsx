"use client";

import { useSignInEmailOTP, useSignInEmailPassword, useSignOut } from "@nhost/react";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { mapAuthErrorMessage } from "@/lib/auth-errors";
import { hasStaffRole } from "@/lib/nhost/jwt";
import { Button, Input } from "@/components/ui/primitives";

type Mode = "code" | "password";

const NOT_STAFF = "This account does not have staff access.";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signInEmailPassword } = useSignInEmailPassword();
  const { signInEmailOTP, verifyEmailOTP } = useSignInEmailOTP();
  const { signOut } = useSignOut();
  const [mode, setMode] = useState<Mode>("code");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get("error") === "staff_required") {
      setError("Access restricted to staff accounts.");
    }
  }, [searchParams]);

  /** Only staff/admin sessions are kept; any other account is signed out right away. */
  async function finishSignIn(result: {
    isError: boolean;
    error: { message?: string } | null;
    accessToken: string | null;
  }) {
    if (result.isError) {
      setError(mapAuthErrorMessage(result.error?.message));
      return;
    }
    if (!hasStaffRole(result.accessToken)) {
      await signOut();
      setError(NOT_STAFF);
      return;
    }
    router.replace("/");
  }

  async function run(action: () => Promise<void>) {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  const sendCode = () =>
    run(async () => {
      const result = await signInEmailOTP(email.trim());
      if (result.isError) {
        setError(mapAuthErrorMessage(result.error?.message));
        return;
      }
      setCodeSent(true);
      setCode("");
      setNotice(`We sent a sign-in code to ${email.trim()}.`);
    });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (mode === "password") {
      void run(async () => finishSignIn(await signInEmailPassword(email.trim(), password)));
    } else if (!codeSent) {
      void sendCode();
    } else {
      void run(async () => finishSignIn(await verifyEmailOTP(email.trim(), code.trim())));
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setCodeSent(false);
    setCode("");
    setError(null);
    setNotice(null);
  }

  const submitLabel =
    mode === "password"
      ? busy
        ? "Signing in…"
        : "Sign in"
      : !codeSent
        ? busy
          ? "Sending code…"
          : "Send code"
        : busy
          ? "Verifying…"
          : "Sign in";

  return (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-md space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm"
    >
      <div>
        <h1 className="text-xl font-semibold">TwinFIT Support</h1>
        <p className="mt-1 text-sm text-zinc-500">Staff sign in</p>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="email">
          Email
        </label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={codeSent}
          required
        />
      </div>
      {mode === "password" && (
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="password">
            Password
          </label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
      )}
      {mode === "code" && codeSent && (
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="code">
            Code
          </label>
          <Input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoFocus
            required
          />
          <div className="flex gap-3 text-xs">
            <button
              type="button"
              className="text-zinc-600 underline hover:text-zinc-900"
              disabled={busy}
              onClick={() => void sendCode()}
            >
              Resend code
            </button>
            <button
              type="button"
              className="text-zinc-600 underline hover:text-zinc-900"
              disabled={busy}
              onClick={() => switchMode("code")}
            >
              Change email
            </button>
          </div>
        </div>
      )}
      {notice && !error && <p className="text-sm text-zinc-600">{notice}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">
        {submitLabel}
      </Button>
      <button
        type="button"
        className="w-full text-center text-sm text-zinc-600 underline hover:text-zinc-900"
        onClick={() => switchMode(mode === "code" ? "password" : "code")}
      >
        {mode === "code" ? "Use password instead" : "Email me a code instead"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
