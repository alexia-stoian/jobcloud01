/**
 * Artifact Data Access Layer (DAL)
 * 
 * Handles storage, retrieval, and versioning of user artifacts:
 * - Cover letters
 * - Job postings
 * - Interview Q&A
 */

import { db } from '@/lib/db';

export type ArtifactType = 'cover_letter' | 'job_posting' | 'interview_qa';

export type ArtifactMetadata = Record<string, unknown>;

export interface StoredArtifactData {
  id: string;
  userId: string;
  type: ArtifactType;
  content: string;
  metadata: Record<string, unknown>;
  version: number;
  parentArtifactId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Store an artifact for a user
 * 
 * @param userId - User ID
 * @param type - Artifact type
 * @param content - Full artifact content
 * @param metadata - Additional metadata
 * @returns Created artifact with ID
 */
export async function store(
  userId: string,
  type: ArtifactType,
  content: string,
  metadata?: Record<string, unknown>
) {
  const artifact = await db.storedArtifact.create({
    data: {
      userId,
      type,
      content,
      metadata: (metadata || {}) as any,
      version: 1,
    },
  });

  return artifact;
}

/**
 * Retrieve an artifact by ID
 * 
 * @param id - Artifact ID
 * @returns Artifact data or null
 */
export async function retrieve(id: string) {
  const artifact = await db.storedArtifact.findUnique({
    where: { id },
  });

  return artifact;
}

/**
 * Find all artifacts of a type for a user, ordered by creation (newest first)
 * 
 * @param userId - User ID
 * @param type - Artifact type
 * @returns List of artifacts
 */
export async function findByUserAndType(
  userId: string,
  type: ArtifactType
) {
  const artifacts = await db.storedArtifact.findMany({
    where: {
      userId,
      type,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return artifacts;
}

/**
 * Create a new version of an artifact
 * 
 * @param parentArtifactId - ID of artifact being edited
 * @param newContent - Modified content
 * @returns New version artifact
 */
export async function createVersion(
  parentArtifactId: string,
  newContent: string
) {
  // Get the parent artifact
  const parent = await retrieve(parentArtifactId);
  if (!parent) {
    throw new Error(`Parent artifact ${parentArtifactId} not found`);
  }

  // Create new version
  const newVersion = await db.storedArtifact.create({
    data: {
      userId: parent.userId,
      type: parent.type,
      content: newContent,
      metadata: parent.metadata,
      version: parent.version + 1,
      parentArtifactId: parentArtifactId,
    },
  });

  return newVersion;
}
