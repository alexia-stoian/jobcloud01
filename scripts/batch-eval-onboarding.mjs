import process from "node:process";

const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
const cookie = process.env.EVAL_COOKIE;

if (!cookie) {
  console.error("Missing EVAL_COOKIE env var. Provide a valid session cookie string.");
  process.exit(1);
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      ...(options.headers ?? {})
    }
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    throw new Error(`${path} failed (${response.status}): ${JSON.stringify(data)}`);
  }

  return data;
}

async function run() {
  const dataset = await request("/api/onboarding/dataset");
  const rows = Array.isArray(dataset.rows) ? dataset.rows : [];

  if (rows.length === 0) {
    console.log("No rows returned from /api/onboarding/dataset");
    return;
  }

  let passed = 0;
  let totalScore = 0;

  for (const row of rows) {
    const evalPayload = {
      prompt: row.prompt,
      response: `Based on your profile context, the next best step is to confirm missing fields and proceed with role-relevant details.`
    };

    const result = await request("/api/onboarding/eval", {
      method: "POST",
      body: JSON.stringify(evalPayload)
    });

    totalScore += result.scores?.total ?? 0;
    if (result.pass) passed += 1;

    console.log(`${row.profileId}: total=${result.scores?.total ?? "n/a"} pass=${result.pass}`);
  }

  const avg = totalScore / rows.length;
  console.log(`\nBatch eval complete -> rows=${rows.length}, passed=${passed}, avg=${avg.toFixed(2)}`);
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
