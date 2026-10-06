import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/oauth/gmail/return")({
  head: () => ({
    meta: [
      { title: "Connecting Gmail — Chrishem AutoStudio" },
      { name: "description", content: "Finishing your Gmail connection." },
      { property: "og:title", content: "Connecting Gmail — Chrishem AutoStudio" },
      { property: "og:description", content: "Finishing your Gmail connection." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GmailReturn,
});

function GmailReturn() {
  const [message, setMessage] = useState("Finishing connection…");
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const notify = (type: "appUserConnectorOAuthComplete" | "appUserConnectorOAuthFailed", code?: string) => {
      window.opener?.postMessage({ type, connectorId: "google_mail", code: code ?? null }, window.location.origin);
      window.close();
    };
    if (p.get("success") !== "true") {
      setMessage(p.get("error") ?? "Gmail connection didn't complete.");
      notify("appUserConnectorOAuthFailed");
      return;
    }
    const code = p.get("code");
    if (!code) {
      if (p.get("offline_access_allowed") === "false") return notify("appUserConnectorOAuthComplete");
      setMessage("Gmail connection finished without a code.");
      return notify("appUserConnectorOAuthFailed");
    }
    notify("appUserConnectorOAuthComplete", code);
  }, []);
  return <p className="p-6 text-sm text-muted-foreground">{message}</p>;
}
