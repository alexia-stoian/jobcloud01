# CV Extraction Phase 1 - Testing Guide

## Overview
This guide helps you test the enhanced CV extraction Phase 1 implementation. The system now extracts comprehensive data from CVs including multiple jobs, education entries, skills, certifications, and profile fields.

## Quick Start

### 1. Prerequisites
- Node.js dev environment running
- Access to a sample CV (PDF or text extracted)
- Anthropic API key configured in `.env`

### 2. Start Development Server
```bash
npm run dev
```
Server will start on `http://localhost:3000` (or port 3003 if configured)

### 3. Test the Extraction Endpoint

**Using curl:**
```bash
curl -X POST http://localhost:3000/api/onboarding/cv/test \
  -H "Content-Type: application/json" \
  -d '{"cvText": "JOHN DOE\njohn@example.com\n..."}'
```

**Using PowerShell:**
```powershell
$cvText = Get-Content -Path "path/to/cv.txt" -Raw
$body = @{ cvText = $cvText } | ConvertTo-Json
Invoke-WebRequest -Uri "http://localhost:3000/api/onboarding/cv/test" `
  -Method Post -ContentType "application/json" -Body $body |
  Select-Object -ExpandProperty Content | ConvertFrom-Json |
  ConvertTo-Json -Depth 10
```

### 4. Extract PDF Text First
If you have a PDF CV:

**Using Node.js script:**
```javascript
const pdfParse = require('pdf-parse/lib/pdf-parse');
const fs = require('fs');

async function extractPdfText(filePath) {
  const dataBuffer = fs.readFileSync(filePath);
  const data = await pdfParse(dataBuffer);
  console.log(data.text);
}

extractPdfText('./sample-cv.pdf');
```

Then copy the extracted text and use it in the test endpoint.

## Test Endpoint: `/api/onboarding/cv/test`

### Request
```json
{
  "cvText": "<full CV text extracted from PDF or plain text>"
}
```

### Response Structure
The endpoint returns comprehensive extraction data with two views:

**Phase 1 Detailed View:**
```json
{
  "success": true,
  "metadata": {
    "cvLength": 3500,
    "cvLines": 85,
    "extractionTime": "2024-01-15T10:30:00Z"
  },
  "phase1": {
    "workExperience": {
      "count": 3,
      "items": [
        {
          "index": 0,
          "company": "TechCorp Inc.",
          "title": "Senior Software Engineer",
          "startDate": "2022-01",
          "endDate": null,
          "achievementCount": 4,
          "technologyCount": 7,
          "confidence": 0.95
        }
      ]
    },
    "education": {
      "count": 2,
      "items": [
        {
          "school": "MIT",
          "degree": "Master of Science",
          "field": "Computer Science",
          "graduationDate": "2018-05",
          "honors": "Magna Cum Laude",
          "confidence": 0.98
        }
      ]
    },
    "skills": {
      "count": 42,
      "byCategory": {
        "technical": 25,
        "soft": 5,
        "language": 3,
        "tool": 6,
        "framework": 2,
        "methodology": 1
      },
      "samples": [
        {
          "skill": "TypeScript",
          "category": "technical",
          "proficiency": "expert",
          "yearsExperience": 5,
          "confidence": 0.92
        }
      ]
    },
    "certifications": {
      "count": 3,
      "items": [
        {
          "name": "AWS Certified Solutions Architect - Professional",
          "issuer": "Amazon Web Services",
          "issueDate": "2023-01",
          "expiryDate": "2025-01",
          "credentialId": "AWS-12345",
          "confidence": 0.95
        }
      ]
    },
    "profileFields": {
      "fullName": "John Doe",
      "email": "john.doe@example.com",
      "phone": "(555) 123-4567",
      "location": "New York, NY",
      "preferredLocation": "San Francisco, CA",
      "currentJobSituation": "Employed",
      "employmentObjective": "Senior role at innovative tech company",
      "contractPreference": "Full-time",
      "workRate": "FTE",
      "workPermitStatus": "Citizen",
      "salaryExpectation": "$150,000 - $180,000",
      "summary": "Senior Full-Stack Developer with 8+ years..."
    }
  },
  "legacy": {
    "facts": { /* ExtractedCvFacts object */ },
    "qualifications": {
      "count": 47,
      "byCategory": {
        "skill": 42,
        "diploma": 2,
        "certification": 3,
        "qualification": 0
      },
      "samples": [
        {
          "category": "skill",
          "value": "TypeScript (expert) - 5 yrs"
        }
      ]
    }
  },
  "fullPhase1Data": { /* Complete extraction object */ }
}
```

## Expected Extraction Results

### What Should Be Extracted

#### Work Experience
- ✅ All jobs mentioned (internships, contracts, part-time, full-time)
- ✅ Company name
- ✅ Job title
- ✅ Employment dates (YYYY-MM format)
- ✅ Key achievements/accomplishments
- ✅ Technologies used
- ✅ Whether it's current role

**Expected count:** All positions mentioned in CV

#### Education
- ✅ All educational institutions (university, bootcamps, online courses)
- ✅ Degree/certification type
- ✅ Field of study
- ✅ Graduation date
- ✅ Honors/achievements (Magna Cum Laude, etc.)
- ✅ GPA if mentioned

**Expected count:** All education entries

#### Skills
- ✅ Technical skills (languages, libraries, platforms)
- ✅ Soft skills (leadership, communication, etc.)
- ✅ Languages (spoken languages: English, Spanish, etc.)
- ✅ Tools (software, IDEs, etc.)
- ✅ Frameworks (React, Django, etc.)
- ✅ Methodologies (Agile, Scrum, etc.)
- ✅ Proficiency levels (beginner, intermediate, advanced, expert)
- ✅ Years of experience when mentioned

**Expected count:** 40+ items (comprehensive coverage)

#### Certifications
- ✅ Certification name
- ✅ Issuing organization
- ✅ Issue date
- ✅ Expiry date (if applicable)
- ✅ Credential ID (if mentioned)

**Expected count:** All certifications mentioned

#### Profile Fields
- ✅ Full name
- ✅ Email address
- ✅ Phone number
- ✅ Current location
- ✅ Preferred location
- ✅ Job situation (employed, freelance, job-seeking, etc.)
- ✅ Employment objective
- ✅ Contract preference (full-time, part-time, contract)
- ✅ Work rate/arrangement
- ✅ Work permit status
- ✅ Salary expectations
- ✅ Professional summary/objective

## Quality Assessment

### Confidence Scores
Each extracted item has a confidence score (0.0 - 1.0):
- **0.9+** ✅ Excellent quality
- **0.7-0.9** ✅ Good quality
- **0.5-0.7** ⚠️ Moderate (review recommended)
- **<0.5** ❌ Low confidence (likely needs adjustment)

### Validation Checklist
After running extraction, check:

- [ ] Multiple jobs extracted (if CV has multiple jobs)
- [ ] All education entries present
- [ ] Skills sorted into proper categories
- [ ] Confidence scores mostly above 0.7
- [ ] Profile fields populated where applicable
- [ ] No critical information missing
- [ ] Date formats consistent (YYYY-MM)

## Debugging

### Common Issues and Solutions

#### Issue: Too few items extracted
**Solution:**
- Check CV text is properly extracted from PDF
- Verify CV has clear section headers (EXPERIENCE, EDUCATION, SKILLS, etc.)
- Ensure CV text isn't truncated

#### Issue: Incorrect dates
**Solution:**
- Dates should be in clear format (e.g., "Jan 2022", "January 2022")
- Relative dates ("2 years ago") may not extract correctly
- Check confidence score is low if dates are unusual format

#### Issue: Missing certifications
**Solution:**
- Verify certifications section exists in CV
- Check for varied section names (CERTIFICATIONS, LICENSES, CREDENTIALS)
- Ensure dates are included with certification names

#### Issue: Low confidence scores
**Solution:**
- May indicate ambiguous or unclear CV formatting
- Check original PDF extraction
- Verify text wasn't corrupted during extraction

## Next Steps After Testing

### If extraction is good (confidence >0.75 overall):
1. ✅ Proceed to production testing
2. ✅ Test database persistence
3. ✅ Verify field population in CandidateProfile

### If extraction has gaps:
1. 📊 Review which sections are missing/low-confidence
2. 🔄 Adjust prompts in `src/lib/cv/extract-phase1.ts`
3. 🧪 Re-test with sample CVs
4. 🚀 Consider Phase 2 (fine-tuning) if needed

## Useful Endpoints

### Test Extraction (No Auth Required)
```
POST /api/onboarding/cv/test
```
Detailed debugging output

### Production Extraction (Auth Required)
```
POST /api/onboarding/cv/extract
```
Clean response suitable for client apps

### Upload & Persist (Auth Required)
```
POST /api/onboarding/cv/upload
```
Extracts CV and saves to database

## Performance Notes
- Extraction typically takes 15-30 seconds
- API timeout is 50 seconds
- Retry logic handles transient failures
- Parallel extraction speeds up multi-section processing

---

**Status:** Phase 1 Enhanced (Improved Prompting)
**Branch:** feature/enhanced-cv-extraction-phase1
**Last Updated:** 2024-01-15
