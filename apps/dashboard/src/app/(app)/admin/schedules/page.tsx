import { requireAdmin } from "@/lib/auth";
import SchedulesManager from "./SchedulesManager";

export default async function SchedulesPage() {
  await requireAdmin();
  return <SchedulesManager />;
}
