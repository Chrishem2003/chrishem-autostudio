import { createFileRoute } from "@tanstack/react-router";
import { Studio } from "@/components/studio/Studio";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Automation Studio — Describe It, We Build The Pipeline" },
      {
        name: "description",
        content:
          "Intent-driven automation: type an outcome, get a validated multi-tool pipeline with semantic mapping, autonomous healing and time-travel debugging.",
      },
      { property: "og:title", content: "Automation Studio — Describe It, We Build The Pipeline" },
      {
        property: "og:description",
        content:
          "A copilot-first automation builder across 24 industries, 180+ apps and 3,500+ steps, exportable to n8n.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <Studio />,
});
