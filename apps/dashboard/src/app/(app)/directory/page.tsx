import { requireUser } from "@/lib/auth";
import UnifiedDirectory from "./UnifiedDirectory";

export default async function DirectoryPage() {
  await requireUser();
  return <UnifiedDirectory />;
}
