import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { SiteNav } from "@/routes/marketplace";
import { TEMPLATES, VERTICALS } from "@/lib/automation-catalog";

export const Route = createFileRoute("/sdk")({
  head: () => ({
    meta: [
      { title: "Embed SDK — Drop The Automation Builder Into Your App" },
      {
        name: "description",
        content:
          "White-label embed: iframe snippet, web component and query params to ship a branded automation builder inside your own dashboard.",
      },
      { property: "og:title", content: "Embed SDK — White-Label Automation Builder" },
      {
        property: "og:description",
        content: "Copy one snippet and your product has a full automation engine inside it.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SdkPage,
});

function SdkPage() {
  const [vertical, setVertical] = useState("");
  const [template, setTemplate] = useState("");
  const [height, setHeight] = useState(820);

  const base = typeof window !== "undefined" ? window.location.origin : "https://your-app.lovable.app";
  const src = useMemo(() => {
    const q = new URLSearchParams();
    if (vertical) q.set("vertical", vertical);
    if (template) q.set("template", template);
    const qs = q.toString();
    return `${base}/embed${qs ? `?${qs}` : ""}`;
  }, [base, vertical, template]);

  const iframeSnippet = `<iframe
  src="${src}"
  title="Automation Studio"
  style="width:100%;height:${height}px;border:0;border-radius:12px"
  allow="clipboard-write"
></iframe>`;

  const streamlitSnippet = `import streamlit.components.v1 as components

components.iframe(
    "${src}",
    height=${height},
    scrolling=True,
)`;

  const webComponentSnippet = `<automation-studio
  vertical="${vertical || "sales"}"
  template="${template || "lead-router"}"
  height="${height}"
></automation-studio>

<script>
class AutomationStudio extends HTMLElement {
  connectedCallback() {
    const q = new URLSearchParams();
    for (const k of ["vertical", "template"]) {
      const v = this.getAttribute(k);
      if (v) q.set(k, v);
    }
    const frame = document.createElement("iframe");
    frame.src = "${base}/embed?" + q.toString();
    frame.style.cssText =
      "width:100%;border:0;border-radius:12px;height:" + (this.getAttribute("height") || 820) + "px";
    frame.allow = "clipboard-write";
    this.attachShadow({ mode: "open" }).append(frame);
  }
}
customElements.define("automation-studio", AutomationStudio);
</script>`;

  const copy = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied.`);
    } catch {
      toast.message("Copy blocked by the browser", { description: "Select the snippet and copy manually." });
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster />
      <SiteNav current="/sdk" />

      <header className="border-b border-border bg-surface px-5 py-10">
        <div className="mx-auto max-w-6xl">
          <p className="mono-label">Embedded white-label SDK</p>
          <h1 className="mt-2 max-w-2xl font-display text-3xl font-semibold leading-tight sm:text-4xl">
            Your product, with an automation engine inside it.
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
            The <code className="rounded bg-muted px-1">/embed</code> route renders the full builder with no site
            chrome, so it drops straight into a dashboard tab, a Streamlit page or any iframe.
          </p>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-5 py-8 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <aside className="space-y-4 rounded-xl border border-border bg-card/60 p-4">
          <h2 className="font-display text-base font-semibold">Configure the embed</h2>

          <label className="block space-y-1.5">
            <span className="mono-label">Preselected section</span>
            <select
              value={vertical}
              onChange={(e) => setVertical(e.target.value)}
              className="w-full rounded-lg border border-input bg-surface-raised px-2.5 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="">Let the user choose</option>
              {VERTICALS.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.glyph} {v.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1.5">
            <span className="mono-label">Starter template</span>
            <select
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              className="w-full rounded-lg border border-input bg-surface-raised px-2.5 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="">Default (lead router)</option>
              {TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1.5">
            <span className="mono-label">Height · {height}px</span>
            <input
              type="range"
              min={520}
              max={1400}
              step={20}
              value={height}
              onChange={(e) => setHeight(Number(e.target.value))}
              className="w-full accent-primary"
            />
          </label>

          <div className="rounded-lg border border-border p-3">
            <p className="mono-label">Embed URL</p>
            <p className="mt-1 break-all text-xs text-muted-foreground">{src}</p>
            <button
              onClick={() => copy("Embed URL", src)}
              className="mt-2 w-full rounded-lg border border-border px-2.5 py-1.5 text-xs transition-colors hover:border-primary/60"
            >
              Copy URL
            </button>
          </div>
        </aside>

        <section className="space-y-5">
          <Snippet title="HTML iframe" code={iframeSnippet} onCopy={() => copy("iframe snippet", iframeSnippet)} />
          <Snippet
            title="Streamlit (your Notion analyzer app)"
            code={streamlitSnippet}
            onCopy={() => copy("Streamlit snippet", streamlitSnippet)}
          />
          <Snippet
            title="Web component (drop-in tag)"
            code={webComponentSnippet}
            onCopy={() => copy("Web component snippet", webComponentSnippet)}
          />

          <div className="rounded-xl border border-border bg-card/60 p-4">
            <h2 className="font-display text-base font-semibold">Live preview</h2>
            <p className="mono-label mt-0.5">Exactly what your users will see</p>
            <iframe
              key={src}
              src={src}
              title="Embedded Automation Studio preview"
              className="mt-3 w-full rounded-lg border border-border"
              style={{ height: Math.min(height, 720) }}
            />
          </div>
        </section>
      </main>
    </div>
  );
}

function Snippet({ title, code, onCopy }: { title: string; code: string; onCopy: () => void }) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-base font-semibold">{title}</h2>
        <button
          onClick={onCopy}
          className="rounded-lg border border-border px-2.5 py-1.5 text-xs transition-colors hover:border-primary/60"
        >
          Copy
        </button>
      </div>
      <pre className="mt-3 overflow-x-auto rounded-lg bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
        <code>{code}</code>
      </pre>
    </div>
  );
}
