import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { completeGmailConnect, disconnectGmail, getGmailStatus, startGmailConnect } from "@/lib/gmail.functions";

function waitForCode(popup: Window) {
  return new Promise<string | null>((resolve, reject) => {
    const cleanup = () => {
      window.removeEventListener("message", onMsg);
      window.clearInterval(poll);
    };
    const onMsg = (e: MessageEvent) => {
      const t = e.data?.type;
      if (e.origin !== window.location.origin || e.source !== popup || e.data?.connectorId !== "google_mail") return;
      if (t !== "appUserConnectorOAuthComplete" && t !== "appUserConnectorOAuthFailed") return;
      cleanup();
      if (t === "appUserConnectorOAuthComplete") resolve(typeof e.data.code === "string" ? e.data.code : null);
      else reject(new Error("Google didn't finish the connection."));
    };
    window.addEventListener("message", onMsg);
    const poll = window.setInterval(() => {
      if (popup.closed) {
        cleanup();
        reject(new Error("The Google window was closed before finishing."));
      }
    }, 500);
  });
}

export function GmailConnect() {
  const { user } = useAuth();
  const start = useServerFn(startGmailConnect);
  const complete = useServerFn(completeGmailConnect);
  const status = useServerFn(getGmailStatus);
  const disconnect = useServerFn(disconnectGmail);
  const [state, setState] = useState<{ connected: boolean; email: string | null } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) status().then(setState).catch(() => setState({ connected: false, email: null }));
  }, [user, status]);

  const connect = async () => {
    const popup = window.open("", "gmail-oauth", "width=600,height=720");
    if (!popup) return toast.error("Your browser blocked the Google window. Allow pop-ups and try again.");
    setBusy(true);
    try {
      const { authorizationUrl } = await start();
      const done = waitForCode(popup);
      popup.location.href = authorizationUrl;
      const code = await done;
      const was = state?.connected;
      if (code) await complete({ data: { code } });
      const next = await status();
      setState(next);
      toast.success(was ? "Reconnected to Gmail." : `Gmail connected${next.email ? ` as ${next.email}` : ""}.`);
    } catch (e) {
      popup.close();
      toast.error(e instanceof Error ? e.message : "Couldn't connect Gmail.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    await disconnect().catch(() => toast.error("Couldn't disconnect Gmail."));
    setState({ connected: false, email: null });
    setBusy(false);
    toast.success("Gmail disconnected.");
  };

  return (
    <div className="rounded-lg border border-primary/40 bg-card/60 p-2.5">
      <p className="mono-label">Gmail — send real email</p>
      {!user ? (
        <p className="mt-1 text-[11px] text-muted-foreground">Sign in, then connect your own Gmail. Emails are sent from your address.</p>
      ) : (
        <>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {state?.connected
              ? `Connected as ${state.email ?? "your Gmail"}. "Send Gmail" steps send for real when you press Run.`
              : "Connect once, then add a “Send Gmail” step, fill in To, Subject and Message, and press Run. We only ask permission to send — never to read your inbox."}
          </p>
          <div className="mt-2 flex gap-1.5">
            <button onClick={connect} disabled={busy} className="flex-1 rounded-md border border-primary/60 px-2 py-1 text-[11px] font-semibold text-primary hover:bg-primary/10 disabled:opacity-60">
              {busy ? "Working…" : state?.connected ? "Reconnect Gmail" : "Connect Gmail"}
            </button>
            {state?.connected ? (
              <button onClick={remove} disabled={busy} className="rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-destructive">
                Disconnect
              </button>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
