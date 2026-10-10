import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { completeGmailConnect, disconnectGmail, getGmailStatus, sendGmailTest, startGmailConnect } from "@/lib/gmail.functions";

type GmailStatus = { connected: boolean; pendingVerification: boolean; email: string | null };

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
      else reject(new Error("Google did not finish the connection."));
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
  const test = useServerFn(sendGmailTest);
  const [state, setState] = useState<GmailStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [testRecipient, setTestRecipient] = useState("");

  useEffect(() => {
    if (user) status().then(setState).catch(() => setState({ connected: false, pendingVerification: false, email: null }));
  }, [user, status]);

  const connect = async () => {
    const popup = window.open("", "gmail-oauth", "width=600,height=720");
    if (!popup) {
      toast.error("Your browser blocked the Google window. Allow pop-ups and try again.");
      return;
    }
    setBusy(true);
    try {
      const { authorizationUrl } = await start();
      const done = waitForCode(popup);
      popup.location.href = authorizationUrl;
      const code = await done;
      if (code) await complete({ data: { code } });
      const next = await status();
      setState(next);
      if (next.connected) toast.success("Gmail send-only access is verified.");
      else if (next.pendingVerification) {
        toast.message("Gmail authorization received", {
          description: "Send a test email to an address you control to verify the send-only permission.",
        });
      } else toast.error("Gmail connection could not be confirmed.");
    } catch (e) {
      popup.close();
      toast.error(e instanceof Error ? e.message : "Could not connect Gmail.");
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!testRecipient.trim()) {
      toast.error("Enter an email address you control for the test message.");
      return;
    }
    setBusy(true);
    try {
      const result = await test({ data: { recipient: testRecipient.trim() } });
      if (!result.ok) {
        toast.error(result.detail);
        return;
      }
      const next = await status();
      setState(next);
      toast.success(result.detail);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gmail verification failed.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await disconnect();
      setState({ connected: false, pendingVerification: false, email: null });
      toast.success("Gmail disconnected.");
    } catch {
      toast.error("Could not disconnect Gmail.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-primary/40 bg-card/60 p-2.5">
      <p className="mono-label">Gmail — send real email</p>
      {!user ? (
        <p className="mt-1 text-[11px] text-muted-foreground">Sign in, then connect your own Gmail. Draft previews never send email.</p>
      ) : (
        <>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {state?.connected
              ? "Verified send-only Gmail access. Live emails are sent only by a saved automation after Preview and explicit Go live."
              : state?.pendingVerification
                ? "Gmail is authorized but not verified yet. Enter an address you control below; a real test email will be sent there. Live execution stays blocked until verification succeeds."
                : "Connect Gmail to send from your account. We request the send-only Gmail scope; we do not request permission to read your inbox."}
          </p>
          {state?.pendingVerification ? (
            <div className="mt-2 space-y-1.5">
              <label htmlFor="gmail-test-recipient" className="block text-[11px] font-medium">Test email recipient</label>
              <input
                id="gmail-test-recipient"
                type="email"
                autoComplete="email"
                value={testRecipient}
                onChange={(e) => setTestRecipient(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
              />
              <button
                onClick={verify}
                disabled={busy || !testRecipient.trim()}
                className="w-full rounded-md border border-primary/60 bg-primary/10 px-2 py-1.5 text-[11px] font-semibold text-primary disabled:opacity-60"
              >
                {busy ? "Sending test email…" : "Send test email and verify"}
              </button>
            </div>
          ) : null}
          <div className="mt-2 flex gap-1.5">
            <button onClick={connect} disabled={busy} className="flex-1 rounded-md border border-primary/60 px-2 py-1 text-[11px] font-semibold text-primary hover:bg-primary/10 disabled:opacity-60">
              {busy ? "Working…" : state?.connected || state?.pendingVerification ? "Reconnect Gmail" : "Connect Gmail"}
            </button>
            {state?.connected || state?.pendingVerification ? (
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
