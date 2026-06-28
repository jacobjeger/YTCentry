import { requireUser } from "@/lib/auth";
import TempPinsManager from "./TempPinsManager";

export default async function TempPinsPage() {
  await requireUser();
  return <TempPinsManager />;
}
