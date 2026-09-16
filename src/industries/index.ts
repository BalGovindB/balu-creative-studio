import type { IndustryPack, IndustrySummary, UseCaseTemplate } from "./types";
import insurance from "./packs/insurance";
import creditRecovery from "./packs/credit-recovery";
import qsrFood from "./packs/qsr-food";
import wellness from "./packs/wellness";
import footwear from "./packs/footwear";
import staffing from "./packs/staffing";
import securityCctv from "./packs/security-cctv";
import upsellCrossSell from "./packs/upsell-cross-sell";

/**
 * To add an industry: create packs/<id>.ts with defineIndustry({...}) and append it here.
 */
const PACKS: IndustryPack[] = [
  insurance,
  creditRecovery,
  qsrFood,
  wellness,
  footwear,
  staffing,
  securityCctv,
  upsellCrossSell,
];

const byId = new Map<string, IndustryPack>();
for (const pack of PACKS) {
  if (byId.has(pack.id)) throw new Error(`Duplicate industry id "${pack.id}"`);
  byId.set(pack.id, pack);
}

export function listIndustries(): IndustrySummary[] {
  return PACKS.map(({ id, name, emoji, description }) => ({ id, name, emoji, description }));
}

/** Full packs - the studio UI needs templates, characters, scenes and compliance text. */
export function listIndustryPacks(): IndustryPack[] {
  return PACKS;
}

export function getIndustry(id: string): IndustryPack | undefined {
  return byId.get(id);
}

export function resolveTemplate(industryId: string, templateId: string): { pack: IndustryPack; template: UseCaseTemplate } {
  const pack = byId.get(industryId);
  if (!pack) throw new Error(`Unknown industry "${industryId}"`);
  const template = pack.templates.find((t) => t.id === templateId);
  if (!template) throw new Error(`Unknown template "${templateId}" for industry "${industryId}"`);
  return { pack, template };
}

/** Replace `{{key}}` with values; unknown or empty keys become a neutral phrase. */
export function fillTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key]?.trim() || `the ${key}`);
}

export type { IndustryPack, IndustrySummary, UseCaseTemplate } from "./types";
