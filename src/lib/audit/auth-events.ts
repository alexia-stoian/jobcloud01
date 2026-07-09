import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

export async function recordAuthEvent(action: string, userId?: string, metadata?: unknown): Promise<void> {
  await db.authAuditEvent.create({
    data: {
      action,
      userId,
      metadata:
        metadata === undefined
          ? undefined
          : (metadata as Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput)
    }
  });
}
