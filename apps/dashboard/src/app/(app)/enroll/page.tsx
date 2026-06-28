import { requireUser } from "@/lib/auth";
import EnrollForm from "./EnrollForm";

export default async function EnrollPage() {
  await requireUser();
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold">Add a person</h1>
      <p className="text-stone-500 mt-1 mb-6">
        Enter the name, then upload a photo or capture one from the webcam. We
        check the face and send them to the door.
      </p>
      <EnrollForm />
    </div>
  );
}
