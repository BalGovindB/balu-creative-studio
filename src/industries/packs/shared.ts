import type { Engine, } from "@/core/types";
import type { TemplateVariable } from "../types";

export const ALL_ENGINES: Engine[] = ["video", "gif", "image"];

export const v = {
  product: (placeholder: string): TemplateVariable => ({ key: "product", label: "Product / service", placeholder, required: true }),
  offer: (placeholder: string): TemplateVariable => ({ key: "offer", label: "Offer / hook", placeholder }),
  audience: (placeholder: string): TemplateVariable => ({ key: "audience", label: "Target audience", placeholder }),
  city: (placeholder = "e.g. Bengaluru"): TemplateVariable => ({ key: "city", label: "City / region", placeholder }),
};
