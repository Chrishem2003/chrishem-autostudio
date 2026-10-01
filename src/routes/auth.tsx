import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Chrishem AutoStudio" },
      { name: "description", content: "Sign in to save your automations, versions and run history." },
      { property: "og:title", content: "Sign in — Chrishem AutoStudio" },
      { property: "og:description", content: "Sign in to save your automations, versions and run history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/workspace" });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s) navigate({ to: "/workspace" });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res =
      mode === "in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
    setBusy(false);
    if (res.error) return setMsg(res.error.message);
    if (mode === "up" && !res.data.session) setMsg("Check your email to confirm your account.");
  };

  const google = async () => {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/auth" });
    if (r.error) setMsg(r.error.message ?? "Google sign-in failed");
  };

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4 text-foreground">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6">
        <Link to="/" className="mono-label">← Back to studio</Link>
        <h1 className="mt-3 font-display text-xl font-semibold">
          {mode === "in" ? "Sign in to AutoStudio" : "Create your account"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Save flows to the cloud, keep every version, and see run history.</p>
        <button onClick={google} className="mt-5 w-full rounded-lg border border-border bg-surface-raised py-2 text-sm hover:border-primary/60">
          Continue with Google
        </button>
        <div className="my-4 text-center text-xs text-muted-foreground">or</div>
        <form onSubmit={submit} className="space-y-3">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email"
            className="w-full rounded-lg border border-input bg-surface-raised px-3 py-2 text-sm outline-none focus:border-primary" />
          <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password"
            className="w-full rounded-lg border border-input bg-surface-raised px-3 py-2 text-sm outline-none focus:border-primary" />
          <button disabled={busy} className="w-full rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
            {busy ? "…" : mode === "in" ? "Sign in" : "Sign up"}
          </button>
        </form>
        {msg && <p className="mt-3 text-sm text-muted-foreground">{msg}</p>}
        <button onClick={() => setMode(mode === "in" ? "up" : "in")} className="mt-4 text-xs text-primary">
          {mode === "in" ? "New here? Create an account" : "Have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
