import { defineIndustry } from "../define";
import { ALL_ENGINES, v } from "./shared";

/**
 * Cross-industry pack: upsell and cross-sell creatives for any existing customer base.
 * Industry-specific upsell templates can also live inside each industry pack (see
 * security-cctv "amc-upgrade").
 */
export default defineIndustry({
  id: "upsell-cross-sell",
  name: "Upselling & Cross-selling",
  emoji: "📈",
  description: "Upgrades, add-ons, bundles and loyalty offers for existing customers.",
  audience: "Existing customers who already trust the brand",
  tone: "Personal, appreciative, value-focused. 'Because you're already with us'.",
  visualStyle: "Bright premium product styling, clean compositions, subtle glow on the upgraded option, lifestyle context",
  characters: [
    { id: "loyal-customer", name: "Loyal customer", description: "Happy customer in their 30s, casual smart clothing, using the product at home" },
    { id: "brand-host", name: "Brand host", description: "Charismatic presenter in their late 20s, brand-coloured outfit, speaking to camera" },
  ],
  scenes: [
    { id: "product-showcase", name: "Product showcase", description: "Minimal podium set with soft gradient background and spotlight" },
    { id: "cozy-home", name: "Cosy home", description: "Warm modern apartment living area in the evening" },
  ],
  templates: [
    {
      id: "upgrade-tier",
      name: "Upgrade to premium tier",
      goal: "upsell",
      description: "Move a customer from basic to premium.",
      brief: "Show existing {{product}} customers what they unlock by upgrading. Offer: {{offer}}.",
      variables: [v.product("e.g. Basic plan"), { key: "upgrade", label: "Upgrade to", placeholder: "e.g. Premium plan", required: true }, v.offer("e.g. First 3 months at basic price")],
      structure: ["Hook: 'You love {{product}}...'", "Side-by-side: current vs upgraded", "Top 3 unlocked benefits", "Loyalty offer", "CTA"],
      defaultCta: "Upgrade now",
      engines: ALL_ENGINES,
      suggestedCharacterIds: ["loyal-customer", "brand-host"],
      suggestedSceneId: "product-showcase",
    },
    {
      id: "frequently-bought-together",
      name: "Frequently bought together",
      goal: "cross-sell",
      description: "Recommend a complementary product.",
      brief: "Customers who bought {{product}} also love {{addon}}. Show them working together. Offer: {{offer}}.",
      variables: [v.product("e.g. Running shoes"), { key: "addon", label: "Complementary product", placeholder: "e.g. Performance socks", required: true }, v.offer("e.g. Add for ₹199")],
      structure: ["Hook: using the product they own", "Add-on enters the scene", "Better together benefit", "CTA"],
      defaultCta: "Add to your order",
      engines: ALL_ENGINES,
      suggestedCharacterIds: ["loyal-customer"],
      suggestedSceneId: "cozy-home",
    },
    {
      id: "bundle-offer",
      name: "Bundle & save",
      goal: "cross-sell",
      description: "Bundle multiple products with a single price.",
      brief: "Promote the {{product}} bundle to existing customers with {{offer}}.",
      variables: [v.product("e.g. Home + Car insurance bundle"), v.offer("e.g. Save 15% when you bundle")],
      structure: ["Hook: 'Already a customer?'", "Items come together into one bundle", "Savings reveal", "CTA"],
      defaultCta: "Get the bundle",
      engines: ALL_ENGINES,
      suggestedCharacterIds: ["brand-host"],
      suggestedSceneId: "product-showcase",
    },
  ],
  compliance: {
    disclaimer: "Offer for existing customers. T&C apply.",
    rules: ["Do not imply the customer's current product is unsafe or inadequate.", "Savings figures only from the provided offer text."],
  },
});
