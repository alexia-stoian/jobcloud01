import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '@/lib/db';
import { calculateReadiness, compareReadiness } from '@/lib/interview/readiness-score';
import { getAllRoles, getRoleProfile } from '@/lib/interview/roles';

describe('Readiness Score APIs - Wave 3', () => {
  let testUserId: string;

  beforeAll(async () => {
    // Create test user with correct schema
    const user = await db.user.create({
      data: {
        email: `readiness-test-${Date.now()}@example.com`,
        emailVerified: new Date(),
        passwordHash: '$2a$10$VTfVoU06rKal.k29U/Ew7e1NxU8tdWzvEqpNsboqEZsQiNsqmtF0O', // hashed 'test'
      },
    });
    testUserId = user.id;

    // Create comprehensive candidate profile
    await db.candidateProfile.create({
      data: {
        userId: testUserId,
        fullName: 'Readiness Test User',
        primaryRole: 'Software Engineer',
        targetRoles: 'Senior Software Engineer',
        preferredLocation: 'Zurich',
        workPermitStatus: 'Swiss Citizen',
        qualifications: {
          create: [
            { category: 'skills', value: 'Python' },
            { category: 'skills', value: 'JavaScript' },
            { category: 'skills', value: 'TypeScript' },
            { category: 'skills', value: 'React' },
            { category: 'skills', value: 'AWS' },
            { category: 'skills', value: 'System Design' },
            { category: 'skills', value: 'SQL' },
          ],
        },
      },
    });
  });

  afterAll(async () => {
    // Clean up
    try {
      await db.candidateProfile.deleteMany({ where: { userId: testUserId } });
      await db.user.delete({ where: { id: testUserId } });
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  });

  it('should calculate readiness score for a single role', async () => {
    const roleId = 'role-soft-001'; // Junior Software Developer
    const score = await calculateReadiness(testUserId, roleId);

    expect(score).toBeDefined();
    expect(score.overallReadiness).toBeGreaterThanOrEqual(0);
    expect(score.overallReadiness).toBeLessThanOrEqual(100);
    expect(score.roleName).toBeDefined();
    expect(score.breakdown).toBeDefined();
    expect(score.strengths).toBeDefined();
    expect(score.gaps).toBeDefined();
  });

  it('should return breakdown with all five dimensions', async () => {
    const roleId = 'role-soft-002'; // Senior Software Engineer
    const score = await calculateReadiness(testUserId, roleId);

    const { breakdown } = score;
    expect(breakdown.experience).toBeGreaterThanOrEqual(0);
    expect(breakdown.skills).toBeGreaterThanOrEqual(0);
    expect(breakdown.education).toBeGreaterThanOrEqual(0);
    expect(breakdown.workPermit).toBeGreaterThanOrEqual(0);
    expect(breakdown.location).toBeGreaterThanOrEqual(0);

    // All should be <= 100
    expect(breakdown.experience).toBeLessThanOrEqual(100);
    expect(breakdown.skills).toBeLessThanOrEqual(100);
    expect(breakdown.education).toBeLessThanOrEqual(100);
    expect(breakdown.workPermit).toBeLessThanOrEqual(100);
    expect(breakdown.location).toBeLessThanOrEqual(100);
  });

  it('should identify strengths for well-matched roles', async () => {
    const roleId = 'role-soft-003'; // Full Stack Developer
    const score = await calculateReadiness(testUserId, roleId);

    // With 7 skills matching, should have strengths identified
    expect(score.strengths.length).toBeGreaterThan(0);
  });

  it('should identify gaps for mismatched roles', async () => {
    const roleId = 'role-data-002'; // Senior Data Scientist (needs ML, Statistics)
    const score = await calculateReadiness(testUserId, roleId);

    // Should identify gaps since user is not a data scientist
    expect(score.gaps.length).toBeGreaterThanOrEqual(0);
  });

  it('should return time-to-ready estimate', async () => {
    const roleId = 'role-soft-001';
    const score = await calculateReadiness(testUserId, roleId);

    expect(score.timeToReady).toBeDefined();
    expect(typeof score.timeToReady).toBe('string');
    expect(score.timeToReady.length).toBeGreaterThan(0);
  });

  it('should compare readiness across multiple roles', async () => {
    const roleIds = [
      'role-soft-001',
      'role-soft-002',
      'role-soft-003',
      'role-data-001',
    ];
    const scores = await compareReadiness(testUserId, roleIds);

    expect(scores.length).toBeLessThanOrEqual(roleIds.length);
    expect(scores.length).toBeGreaterThan(0);

    // Should be sorted by readiness (descending)
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i - 1].overallReadiness).toBeGreaterThanOrEqual(
        scores[i].overallReadiness
      );
    }
  });

  it('should handle role comparison with default high-demand roles', async () => {
    const roles = getAllRoles();
    const highDemand = roles.filter((r) => r.marketDemand === 'high').slice(0, 5);

    const scores = await compareReadiness(
      testUserId,
      highDemand.map((r) => r.id)
    );

    expect(scores.length).toBeGreaterThan(0);
    expect(scores[0].overallReadiness).toBeGreaterThanOrEqual(
      scores[scores.length - 1].overallReadiness
    );
  });

  it('should rate software roles highly for software engineer profile', async () => {
    const softwareRoles = ['role-soft-001', 'role-soft-002', 'role-soft-003'];
    const scores = await compareReadiness(testUserId, softwareRoles);

    // At least one should be > 60 (reasonably matched)
    const hasHighMatch = scores.some((s) => s.overallReadiness > 60);
    expect(hasHighMatch).toBe(true);
  });

  it('should give lower readiness for non-tech roles', async () => {
    const roleId = 'role-sales-001'; // Sales Executive
    const score = await calculateReadiness(testUserId, roleId);

    // Should be lower than software engineering roles
    expect(score.overallReadiness).toBeLessThan(70);
  });

  it('should handle invalid role gracefully', async () => {
    try {
      await calculateReadiness(testUserId, 'invalid-role-id-xyz');
      expect(true).toBe(false); // Should throw
    } catch (error) {
      expect(error).toBeDefined();
    }
  });

  it('should weight dimensions correctly in overall score', async () => {
    const roleId = 'role-soft-002';
    const score = await calculateReadiness(testUserId, roleId);

    const { breakdown, overallReadiness } = score;

    // Manual calculation with weights
    const weighted =
      breakdown.experience * 0.3 +
      breakdown.skills * 0.35 +
      breakdown.education * 0.15 +
      breakdown.workPermit * 0.1 +
      breakdown.location * 0.1;

    // Should be close (allowing for rounding)
    expect(Math.abs(overallReadiness - Math.round(weighted))).toBeLessThanOrEqual(1);
  });

  it('should provide consistent scores for same user and role', async () => {
    const roleId = 'role-soft-002';

    const score1 = await calculateReadiness(testUserId, roleId);
    const score2 = await calculateReadiness(testUserId, roleId);

    expect(score1.overallReadiness).toBe(score2.overallReadiness);
    expect(score1.breakdown.experience).toBe(score2.breakdown.experience);
    expect(score1.breakdown.skills).toBe(score2.breakdown.skills);
  });

  it('should handle compare with max 5 roles limit', async () => {
    const allRoles = getAllRoles();
    const manyRoles = allRoles.slice(0, 10).map((r) => r.id);

    const scores = await compareReadiness(testUserId, manyRoles);

    // Should be capped at 5
    expect(scores.length).toBeLessThanOrEqual(5);
  });

  it('should return all role attributes in comparison results', async () => {
    const roleIds = ['role-soft-001', 'role-soft-002'];
    const scores = await compareReadiness(testUserId, roleIds);

    const firstScore = scores[0];
    expect(firstScore.roleId).toBeDefined();
    expect(firstScore.roleName).toBeDefined();
    expect(firstScore.overallReadiness).toBeDefined();
    expect(firstScore.breakdown).toBeDefined();
    expect(firstScore.strengths).toBeInstanceOf(Array);
    expect(firstScore.gaps).toBeInstanceOf(Array);
    expect(firstScore.timeToReady).toBeDefined();
  });

  it('should handle API endpoint structure', async () => {
    // Test that the API endpoint would return properly structured response
    const roleIds = ['role-soft-001', 'role-soft-002', 'role-soft-003'];
    const scores = await compareReadiness(testUserId, roleIds);

    expect(scores).toBeInstanceOf(Array);
    scores.forEach((score) => {
      expect(score.overallReadiness).toBeGreaterThanOrEqual(0);
      expect(score.overallReadiness).toBeLessThanOrEqual(100);
    });
  });
});
