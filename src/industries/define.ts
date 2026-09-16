import type { IndustryPack } from "./types";

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Identity function with load-time checks, so a malformed pack fails fast at startup
 * instead of producing a broken storyboard later.
 */
export function defineIndustry(pack: IndustryPack): IndustryPack {
  const problems: string[] = [];
  if (!ID.test(pack.id)) problems.push(`id "${pack.id}" must be kebab-case`);
  if (pack.templates.length === 0) problems.push("needs at least one template");

  const characterIds = new Set(pack.characters.map((c) => c.id));
  const sceneIds = new Set(pack.scenes.map((s) => s.id));
  const templateIds = new Set<string>();

  for (const t of pack.templates) {
    if (templateIds.has(t.id)) problems.push(`duplicate template id "${t.id}"`);
    templateIds.add(t.id);
    for (const c of t.suggestedCharacterIds) {
      if (!characterIds.has(c)) problems.push(`template "${t.id}" references unknown character "${c}"`);
    }
    if (t.suggestedSceneId && !sceneIds.has(t.suggestedSceneId)) {
      problems.push(`template "${t.id}" references unknown scene "${t.suggestedSceneId}"`);
    }
    const declared = new Set(t.variables.map((v) => v.key));
    for (const [, key] of t.brief.matchAll(/\{\{(\w+)\}\}/g)) {
      if (!declared.has(key)) problems.push(`template "${t.id}" uses undeclared variable "{{${key}}}"`);
    }
  }

  if (problems.length) {
    throw new Error(`Invalid industry pack "${pack.id}":\n - ${problems.join("\n - ")}`);
  }
  return pack;
}
