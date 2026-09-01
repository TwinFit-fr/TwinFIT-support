"use client";

import { useSignInEmailPassword } from "@nhost/react";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { useIsStaff } from "@/hooks/use-is-staff";
import { mapAuthErrorMessage } from "@/lib/auth-errors";
import { Button, Input } from "@/components/ui/primitives";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isStaff = useIsStaff();
  const { signInEmailPassword, isLoading, isSuccess, isError, error } =
    useSignInEmailPassword();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get("error") === "staff_required") {
      setLocalError("Access restricted to staff accounts.");
    }
  }, [searchParams]);

  useEffect(() => {
    if (!isSuccess) return;
    if (!isStaff) {
      setLocalError("This account does not have staff access.");
      return;
    }
    router.replace("/");
  }, [isSuccess, isStaff, router]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLocalError(null);
    await signInEmailPassword(email, password);
  }

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
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="password">
          Password
        </label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      {(localError || isError) && (
        <p className="text-sm text-red-600">
          {localError ?? mapAuthErrorMessage(error?.message)}
        </p>
      )}
      <Button type="submit" disabled={isLoading} className="w-full">
        {isLoading ? "Signing in…" : "Sign in"}
      </Button>
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
