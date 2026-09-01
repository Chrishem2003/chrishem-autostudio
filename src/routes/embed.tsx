import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Studio } from "@/components/studio/Studio";

const search = z.object({
  vertical: z.string().optional(),
  template: z.string().optional(),
});

export const Route = createFileRoute("/embed")({
  validateSearch: search,
  head: () => ({
    meta: [
      { title: "Embedded Automation Studio" },
      {
        name: "description",
        content: "Chrome-less, white-label automation builder for embedding inside your own product dashboard.",
      },
      { property: "og:title", content: "Embedded Automation Studio" },
      {
        property: "og:description",
        content: "Drop-in automation canvas you can iframe into any SaaS dashboard.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EmbeddedStudio,
});

function EmbeddedStudio() {
  const { vertical, template } = Route.useSearch();
  return <Studio embedded initialVertical={vertical} initialTemplate={template} />;
}
