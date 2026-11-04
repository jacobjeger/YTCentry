import { requirePagePerm } from "@/lib/access";
import TempPinsManager from "./TempPinsManager";

export default async function TempPinsPage() {
  await requirePagePerm("temp_pins", "page.tempPins");
  return <TempPinsManager />;
}
