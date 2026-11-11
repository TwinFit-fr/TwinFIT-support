"use client";

import { useSignInEmailOTP, useSignInEmailPassword, useSignOut } from "@nhost/react";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, use, useState } from "react";
import { mapAuthErrorMessage } from "@/lib/auth-errors";
import { isStudioPath, safeNextPath } from "@/lib/auth-next";
import { hasStaffRole } from "@/lib/nhost/jwt";
import { Button, Input } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

type Mode = "code" | "password";

const NOT_STAFF = "This account does not have staff access.";

/** Class names of the sign-in screen: Support's light look, or the Studio's dark one. */
const LIGHT = {
  page: "bg-zinc-50",
  card: "border-zinc-200 bg-white shadow-sm",
  title: "",
  muted: "text-zinc-500",
  label: "",
  input: "",
  button: "",
  link: "text-zinc-600 hover:text-zinc-900",
  notice: "text-zinc-600",
  error: "text-red-600",
};
const DARK: typeof LIGHT = {
  page: "studio-root bg-(--m3-surface-dim) text-(--m3-on-surface)",
  card: "border-(--m3-outline-variant) bg-(--m3-surface-container-low) shadow-2xl",
  title: "text-(--m3-on-surface)",
  muted: "text-(--m3-on-surface-variant)",
  label: "text-(--m3-on-surface)",
  input:
    "border-(--m3-outline) bg-(--m3-surface-container) text-(--m3-on-surface) placeholder:text-(--m3-on-surface-variant) focus:border-(--m3-primary) focus:ring-(--m3-primary)/60 disabled:opacity-70",
  button: "rounded-full bg-(--m3-primary) text-(--m3-on-primary) hover:bg-(--m3-primary)/90 active:bg-(--m3-primary)/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--m3-primary)",
  link: "text-(--m3-on-surface-variant) hover:text-(--m3-on-surface)",
  notice: "text-(--m3-on-surface-variant)",
  error: "text-(--m3-error)",
};

function LoginForm({ next }: { next: string }) {
  const studio = isStudioPath(next);
  const t = studio ? DARK : LIGHT;
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
  const [error, setError] = useState<string | null>(() =>
    searchParams.get("error") === "staff_required" ? "Access restricted to staff accounts." : null,
  );

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
    router.replace(next);
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
      className={cn("w-full max-w-md space-y-4 rounded-xl border p-6", t.card)}
    >
      <div>
        <h1 className={cn("text-xl font-semibold", t.title)}>{studio ? "TwinFIT 3D Studio" : "TwinFIT Support"}</h1>
        <p className={cn("mt-1 text-sm", t.muted)}>{studio ? "Sign in with your staff account to open the Studio" : "Staff sign in"}</p>
      </div>
      <div className="space-y-2">
        <label className={cn("text-sm font-medium", t.label)} htmlFor="email">
          Email
        </label>
        <Input
          className={t.input}
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
          <label className={cn("text-sm font-medium", t.label)} htmlFor="password">
            Password
          </label>
          <Input
            className={t.input}
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
          <label className={cn("text-sm font-medium", t.label)} htmlFor="code">
            Code
          </label>
          <Input
            className={t.input}
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
              className={cn("underline", t.link)}
              disabled={busy}
              onClick={() => void sendCode()}
            >
              Resend code
            </button>
            <button
              type="button"
              className={cn("underline", t.link)}
              disabled={busy}
              onClick={() => switchMode("code")}
            >
              Change email
            </button>
          </div>
        </div>
      )}
      {notice && !error && <p className={cn("text-sm", t.notice)}>{notice}</p>}
      {error && (
        <p role="alert" className={cn("text-sm", t.error)}>
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy} className={cn("w-full", t.button)}>
        {submitLabel}
      </Button>
      <button
        type="button"
        className={cn("w-full text-center text-sm underline", t.link)}
        onClick={() => switchMode(mode === "code" ? "password" : "code")}
      >
        {mode === "code" ? "Use password instead" : "Email me a code instead"}
      </button>
    </form>
  );
}

export default function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // Read from the page's own params, so the server already paints the right (light or dark) page.
  const raw = use(searchParams).next;
  const next = safeNextPath(typeof raw === "string" ? raw : null);
  const t = isStudioPath(next) ? DARK : LIGHT;
  return (
    <main className={cn("flex min-h-screen items-center justify-center px-4", t.page)}>
      <Suspense fallback={<p className={cn("text-sm", t.muted)}>Loading…</p>}>
        <LoginForm next={next} />
      </Suspense>
    </main>
  );
}
