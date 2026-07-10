#!/bin/bash
# Quick testing script for CV extraction Phase 1
# Usage: bash test-extraction.sh

echo "🚀 Starting CV Extraction Phase 1 Tests"
echo "======================================="
echo ""

# Step 1: Start dev server
echo "📌 Step 1: Starting development server..."
npm run dev &
SERVER_PID=$!
sleep 3

# Step 2: Create sample CV text (basic example)
SAMPLE_CV='
JOHN DOE
john.doe@example.com | (555) 123-4567 | New York, NY
LinkedIn: linkedin.com/in/johndoe | GitHub: github.com/johndoe

PROFESSIONAL SUMMARY
Senior Full-Stack Developer with 8+ years of experience building scalable web applications.
Expert in React, Node.js, and cloud infrastructure. Passionate about clean code and team collaboration.

WORK EXPERIENCE

Senior Software Engineer
TechCorp Inc., San Francisco, CA | Jan 2022 - Present
- Led development of microservices architecture handling 1M+ daily users
- Mentored team of 5 junior developers, improving code quality by 40%
- Implemented CI/CD pipeline reducing deployment time from 2 hours to 15 minutes
- Tech Stack: TypeScript, React, Node.js, PostgreSQL, Kubernetes, AWS

Full-Stack Developer  
StartupXYZ, Remote | Jun 2020 - Dec 2021
- Built and maintained customer-facing web applications in React
- Designed RESTful APIs using Express.js and NestJS
- Implemented real-time features using WebSockets
- Tech Stack: JavaScript, React, Node.js, MongoDB, Redis, Docker

Junior Developer
WebStudio Inc., Boston, MA | Jul 2018 - May 2020
- Developed front-end features using React and vanilla JavaScript
- Contributed to backend services using Node.js
- Participated in code reviews and team planning sessions
- Tech Stack: React, JavaScript, Node.js, MySQL

EDUCATION

Master of Science in Computer Science
MIT, Cambridge, MA | Graduated: May 2018
GPA: 3.8/4.0 | Honors: Magna Cum Laude
Relevant Coursework: Distributed Systems, Machine Learning, Advanced Algorithms

Bachelor of Science in Computer Science
University of California, Berkeley, CA | Graduated: May 2016
GPA: 3.9/4.0 | Honors: Summa Cum Laude

TECHNICAL SKILLS
Programming Languages: JavaScript, TypeScript, Python, Java, SQL
Frontend: React, Vue.js, CSS3, HTML5, Redux, Next.js
Backend: Node.js, Express, NestJS, Django, Spring Boot
Databases: PostgreSQL, MongoDB, Redis, DynamoDB
Cloud: AWS, Google Cloud, Azure, Docker, Kubernetes
DevOps: CI/CD, GitHub Actions, Jenkins, Linux

CERTIFICATIONS
- AWS Certified Solutions Architect - Professional (Issued: Jan 2023, Expires: Jan 2025)
- Kubernetes Administrator (CKA) (Issued: Jun 2022)
- AWS Certified Developer Associate (Issued: Aug 2021)

LANGUAGES
- English (Native)
- Spanish (Fluent)
- French (Intermediate)
'

# Step 3: Test extraction endpoint
echo ""
echo "📌 Step 2: Testing extraction endpoint..."
echo ""

RESPONSE=$(curl -X POST http://localhost:3000/api/onboarding/cv/test \
  -H "Content-Type: application/json" \
  -d "{\"cvText\": $(echo "$SAMPLE_CV" | jq -Rs .)}" \
  2>/dev/null)

if [ $? -eq 0 ]; then
  echo "✅ Extraction successful!"
  echo ""
  echo "📊 EXTRACTION SUMMARY:"
  echo "====================="
  echo "$RESPONSE" | jq '{
    success: .success,
    metadata: .metadata,
    phase1: {
      workExperience: .phase1.workExperience.count,
      education: .phase1.education.count,
      skills: .phase1.skills.count,
      certifications: .phase1.certifications.count,
      profileFields: .phase1.profileFields
    }
  }' 2>/dev/null || echo "$RESPONSE"
else
  echo "❌ Extraction failed!"
  echo "$RESPONSE"
fi

# Step 4: Cleanup
echo ""
echo "📌 Step 3: Cleaning up..."
kill $SERVER_PID 2>/dev/null

echo ""
echo "✨ Test complete!"
