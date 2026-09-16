import Studio from "@/components/Studio";
import { listIndustryPacks } from "@/industries";
import { describeProviders } from "@/providers/registry";
import { listBrandKits } from "@/storage/brand-kits";

// Brand kits and the resolved providers are read from disk and env on every load.
export const dynamic = "force-dynamic";

export default function Page() {
  return <Studio industries={listIndustryPacks()} brandKits={listBrandKits()} providers={describeProviders()} />;
}
