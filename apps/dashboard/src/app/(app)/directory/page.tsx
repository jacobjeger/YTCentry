import { requirePagePerm } from "@/lib/access";
import UnifiedDirectory from "./UnifiedDirectory";

export default async function DirectoryPage() {
  await requirePagePerm("view", "page.directory");
  return <UnifiedDirectory />;
}
