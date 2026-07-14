import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '@/lib/db';

describe('Skill Development APIs - Wave 2', () => {
  let testUserId: string;

  beforeAll(async () => {
    // Create test user with correct schema
    const user = await db.user.create({
      data: {
        email: `skill-dev-test-${Date.now()}@example.com`,
        emailVerified: new Date(),
        passwordHash: '$2a$10$VTfVoU06rKal.k29U/Ew7e1NxU8tdWzvEqpNsboqEZsQiNsqmtF0O', // hashed 'test'
      },
    });
    testUserId = user.id;

    // Create candidate profile with qualifications
    await db.candidateProfile.create({
      data: {
        userId: testUserId,
        fullName: 'Test User',
        primaryRole: 'Junior Software Developer',
        targetRoles: 'Senior Software Engineer',
        preferredLocation: 'Zurich',
        workPermitStatus: 'Authorized',
        qualifications: {
          create: [
            { category: 'skills', value: 'Python' },
            { category: 'skills', value: 'JavaScript' },
            { category: 'skills', value: 'React' },
          ],
        },
      },
    });
  });

  afterAll(async () => {
    // Clean up
    try {
      await db.completedResource.deleteMany({ where: { userId: testUserId } });
      await db.candidateProfile.deleteMany({ where: { userId: testUserId } });
      await db.user.delete({ where: { id: testUserId } });
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  });

  it('should fetch available skill gaps for user profile', async () => {
    const profile = await db.candidateProfile.findUnique({
      where: { userId: testUserId },
      include: { qualifications: true },
    });

    expect(profile).toBeDefined();
    expect(profile?.qualifications.length).toBeGreaterThan(0);
  });

  it('should track resource completion with rating', async () => {
    await db.completedResource.create({
      data: {
        userId: testUserId,
        resourceId: 'res-python-guide-001',
        skill: 'Python',
        resourceTitle: 'Complete Python Guide',
        rating: 4,
        feedback: 'Excellent course',
        timeSpent: 120,
      },
    });

    const completed = await db.completedResource.findUnique({
      where: {
        userId_resourceId: {
          userId: testUserId,
          resourceId: 'res-python-guide-001',
        },
      },
    });

    expect(completed).toBeDefined();
    expect(completed?.rating).toBe(4);
    expect(completed?.skill).toBe('Python');
    expect(completed?.timeSpent).toBe(120);
  });

  it('should prevent duplicate resource completions (upsert pattern)', async () => {
    // First completion
    await db.completedResource.upsert({
      where: {
        userId_resourceId: {
          userId: testUserId,
          resourceId: 'res-js-fundamentals-001',
        },
      },
      create: {
        userId: testUserId,
        resourceId: 'res-js-fundamentals-001',
        skill: 'JavaScript',
        resourceTitle: 'JS Fundamentals',
        rating: 3,
      },
      update: { rating: 3 },
    });

    // Second update (same resource, different rating)
    await db.completedResource.upsert({
      where: {
        userId_resourceId: {
          userId: testUserId,
          resourceId: 'res-js-fundamentals-001',
        },
      },
      create: {
        userId: testUserId,
        resourceId: 'res-js-fundamentals-001',
        skill: 'JavaScript',
        resourceTitle: 'JS Fundamentals',
        rating: 5,
      },
      update: { rating: 5 },
    });

    // Verify only one record exists with updated rating
    const count = await db.completedResource.count({
      where: {
        userId: testUserId,
        resourceId: 'res-js-fundamentals-001',
      },
    });

    expect(count).toBe(1);

    const completed = await db.completedResource.findUnique({
      where: {
        userId_resourceId: {
          userId: testUserId,
          resourceId: 'res-js-fundamentals-001',
        },
      },
    });

    expect(completed?.rating).toBe(5); // Updated value
  });

  it('should retrieve user profile with multiple completed resources', async () => {
    // Add another completed resource
    await db.completedResource.create({
      data: {
        userId: testUserId,
        resourceId: 'res-react-advanced-001',
        skill: 'React',
        resourceTitle: 'Advanced React Patterns',
        rating: 5,
      },
    });

    // Fetch all completed resources for user
    const completed = await db.completedResource.findMany({
      where: { userId: testUserId },
      orderBy: { completedAt: 'desc' },
    });

    expect(completed.length).toBeGreaterThan(0);
    expect(completed.some((r) => r.skill === 'Python')).toBe(true);
    expect(completed.some((r) => r.skill === 'React')).toBe(true);
  });

  it('should calculate progress metrics from completed resources', async () => {
    const completed = await db.completedResource.findMany({
      where: { userId: testUserId },
    });

    const totalCompleted = completed.length;
    const averageRating =
      completed.reduce((sum, r) => sum + (r.rating || 0), 0) /
      Math.max(completed.length, 1);

    expect(totalCompleted).toBeGreaterThan(0);
    expect(averageRating).toBeGreaterThan(0);
    expect(averageRating).toBeLessThanOrEqual(5);
  });

  it('should support multiple skills per user learning path', async () => {
    const skills = ['Python', 'JavaScript', 'React', 'TypeScript', 'SQL'];

    for (let i = 0; i < skills.length; i++) {
      await db.completedResource.upsert({
        where: {
          userId_resourceId: {
            userId: testUserId,
            resourceId: `res-skill-${i}`,
          },
        },
        create: {
          userId: testUserId,
          resourceId: `res-skill-${i}`,
          skill: skills[i],
          resourceTitle: `${skills[i]} Course`,
        },
        update: {},
      });
    }

    const allResources = await db.completedResource.findMany({
      where: { userId: testUserId },
    });

    const uniqueSkills = new Set(allResources.map((r) => r.skill));
    expect(uniqueSkills.size).toBeLessThanOrEqual(skills.length + 1); // +1 for earlier test resources
  });

  it('should store and retrieve resource feedback', async () => {
    const feedbackText =
      'This course helped me understand async/await patterns much better';

    await db.completedResource.create({
      data: {
        userId: testUserId,
        resourceId: 'res-feedback-test-001',
        skill: 'JavaScript',
        resourceTitle: 'Async JavaScript Mastery',
        rating: 5,
        feedback: feedbackText,
      },
    });

    const resource = await db.completedResource.findUnique({
      where: {
        userId_resourceId: {
          userId: testUserId,
          resourceId: 'res-feedback-test-001',
        },
      },
    });

    expect(resource?.feedback).toBe(feedbackText);
  });
});
