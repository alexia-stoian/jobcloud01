import { NextRequest, NextResponse } from "next/server";
import { extractCvFacts } from "@/lib/cv/extract";
import { extractCvPhase1 } from "@/lib/cv/extract-phase1";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json();
  const { cvText } = body as { cvText: string };

  if (!cvText || typeof cvText !== "string") {
    return NextResponse.json(
      { error: "cvText is required and must be a string" },
      { status: 400 }
    );
  }

  try {
    // Run Phase 1 extraction to get detailed breakdown
    const phase1Result = await extractCvPhase1(cvText);
    
    // Run legacy extraction for backward compatibility check
    const legacyResult = await extractCvFacts(cvText);

    // Comprehensive test response with detailed field counts
    return NextResponse.json({
      success: true,
      metadata: {
        cvLength: cvText.length,
        cvLines: cvText.split("\n").length,
        extractionTime: phase1Result.extractedAt
      },
      phase1: {
        workExperience: {
          count: phase1Result.workExperience?.length ?? 0,
          items: phase1Result.workExperience?.map((job, i) => ({
            index: i,
            company: job.company,
            title: job.title,
            startDate: job.startDate,
            endDate: job.endDate,
            achievementCount: job.achievements?.length ?? 0,
            technologyCount: job.technologies?.length ?? 0,
            confidence: job.confidence
          })) ?? []
        },
        education: {
          count: phase1Result.education?.length ?? 0,
          items: phase1Result.education?.map((edu, i) => ({
            index: i,
            school: edu.school,
            degree: edu.degree,
            field: edu.field,
            graduationDate: edu.graduationDate,
            honors: edu.honors,
            confidence: edu.confidence
          })) ?? []
        },
        skills: {
          count: phase1Result.skills?.length ?? 0,
          byCategory: {
            technical: phase1Result.skills?.filter(s => s.category === "technical").length ?? 0,
            soft: phase1Result.skills?.filter(s => s.category === "soft").length ?? 0,
            language: phase1Result.skills?.filter(s => s.category === "language").length ?? 0,
            tool: phase1Result.skills?.filter(s => s.category === "tool").length ?? 0,
            framework: phase1Result.skills?.filter(s => s.category === "framework").length ?? 0,
            methodology: phase1Result.skills?.filter(s => s.category === "methodology").length ?? 0
          },
          samples: phase1Result.skills?.slice(0, 10).map(s => ({
            skill: s.name,
            category: s.category,
            proficiency: s.proficiency,
            yearsExperience: s.yearsOfExperience,
            confidence: s.confidence
          })) ?? []
        },
        certifications: {
          count: phase1Result.certifications?.length ?? 0,
          items: phase1Result.certifications?.slice(0, 5).map((cert, i) => ({
            index: i,
            name: cert.name,
            issuer: cert.issuer,
            issueDate: cert.date,
            expiryDate: cert.expiryDate,
            credentialId: cert.credentialId,
            confidence: cert.confidence
          })) ?? []
        },
        profileFields: {
          fullName: phase1Result.fullName,
          email: phase1Result.email,
          phone: phase1Result.phone,
          location: phase1Result.location,
          preferredLocation: phase1Result.preferredLocation,
          currentJobSituation: phase1Result.currentJobSituation,
          employmentObjective: phase1Result.employmentObjective,
          contractPreference: phase1Result.contractPreference,
          workRate: phase1Result.workRate,
          workPermitStatus: phase1Result.workPermitStatus,
          salaryExpectation: phase1Result.salaryExpectation,
          summary: phase1Result.summary?.substring(0, 100) + (phase1Result.summary?.length ?? 0 > 100 ? "..." : "")
        }
      },
      legacy: {
        facts: legacyResult.facts,
        qualifications: {
          count: legacyResult.facts.qualifications?.length ?? 0,
          byCategory: {
            skill: legacyResult.facts.qualifications?.filter(q => q.category === "skill").length ?? 0,
            diploma: legacyResult.facts.qualifications?.filter(q => q.category === "diploma").length ?? 0,
            certification: legacyResult.facts.qualifications?.filter(q => q.category === "certification").length ?? 0,
            qualification: legacyResult.facts.qualifications?.filter(q => q.category === "qualification").length ?? 0
          },
          samples: legacyResult.facts.qualifications?.slice(0, 10).map(q => ({
            category: q.category,
            value: q.value.substring(0, 50) + (q.value.length > 50 ? "..." : "")
          })) ?? []
        }
      },
      fullPhase1Data: phase1Result
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}
