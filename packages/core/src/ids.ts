/**
 * UserID allocation in the automation band.
 *
 * Policy (see CLAUDE.md "Reserved-ID policy"): automation owns UserIDs
 * >= ID_BAND_START (100000). The 832 legacy hand-managed records live at 1..832
 * and are NEVER touched. We allocate the next ID as
 *   max(existing automation Enrollee ids, ID_BAND_START - 1) + 1
 * server-side at create time, and RE-CHECK against the device's live maxUserId()
 * on the agent just before the write (a manual device edit could have bumped it).
 */
import { prisma } from "./db";
import { ID_BAND_START } from "./akuvox";

/**
 * Allocate the next free automation UserID from the database.
 *
 * NOTE: this reads the current max and returns max+1. Concurrent enrollments
 * must be serialized — call this inside the same transaction that creates the
 * Enrollee, and rely on the unique constraint on Enrollee.akuvoxUserId to reject
 * a race (retry on P2002). The agent's pre-push maxUserId() re-check is the
 * second line of defence against collisions with manual device edits.
 */
export async function allocateUserId(): Promise<number> {
  const top = await prisma.enrollee.aggregate({
    _max: { akuvoxUserId: true },
    where: { akuvoxUserId: { gte: ID_BAND_START } },
  });
  const current = top._max.akuvoxUserId ?? ID_BAND_START - 1;
  return Math.max(current, ID_BAND_START - 1) + 1;
}

export { ID_BAND_START };
