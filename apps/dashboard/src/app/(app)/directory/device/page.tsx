import { requireUser } from "@/lib/auth";
import DeviceList from "./DeviceList";

export default async function DeviceDirectoryPage() {
  await requireUser();
  return <DeviceList />;
}
