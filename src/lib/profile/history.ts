import { ActorType, ProfileMutationSource, Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export async function appendProfileHistoryEvent(params: {
  profileId: string;
  userId: string;
  actorType: ActorType;
  source: ProfileMutationSource;
  confirmationRef?: string;
  changeSet: Prisma.InputJsonValue | Prisma.JsonNullValueInput;
}): Promise<void> {
  await db.profileHistoryEvent.create({
    data: {
      profileId: params.profileId,
      userId: params.userId,
      actorType: params.actorType,
      source: params.source,
      confirmationRef: params.confirmationRef,
      changeSet: params.changeSet
    }
  });
}
