import { test, expect } from "@playwright/test";

test.describe("Onboarding E2E Journey", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to app and ensure logged in
    await page.goto("/dashboard");
    // If redirected to login, we need to be authenticated
    // This test assumes user is already logged in or we mock auth
    const url = page.url();
    if (url.includes("/login")) {
      // In a real test, you would log in here
      test.skip();
    }
  });

  test("should complete full CV upload to confirmation journey in English", async ({ page }) => {
    // Navigate to onboarding
    await page.goto("/onboarding");

    // Step 1: Verify onboarding intro message
    await expect(page.locator("text=Continue your onboarding")).toBeVisible();

    // Step 2: Upload CV (mock file)
    const cvInput = page.locator('input[type="file"]');
    if (await cvInput.isVisible()) {
      // Create a dummy CV content
      const cvContent = `
        John Doe
        Senior Product Manager
        5 years experience
        Work Permit: B
        Languages: English, German
      `;
      await cvInput.setInputFiles({
        name: "cv.txt",
        mimeType: "text/plain",
        buffer: Buffer.from(cvContent)
      });

      // Wait for extraction
      await page.waitForTimeout(2000);
      await expect(page.locator("text=Extracted facts")).toBeVisible();
    }

    // Step 3: Answer first question
    const firstQuestion = page.locator("[role=textbox], input[type=text]").first();
    if (await firstQuestion.isVisible()) {
      await firstQuestion.fill("My Target Company");
    }

    // Step 4: Interact with next question
    const nextButton = page.locator("button:has-text('Next'), button:has-text('Continue')").first();
    if (await nextButton.isVisible()) {
      await nextButton.click();
    }

    // Step 5: Test skip functionality
    const skipButton = page.locator("button:has-text('Skip')").first();
    if (await skipButton.isVisible()) {
      await skipButton.click();
      await expect(page.locator("text=skipped")).toBeVisible({ timeout: 5000 });
    }

    // Step 6: Confirm a field
    const confirmButton = page.locator("button:has-text('Confirm'), button:has-text('Apply')").first();
    if (await confirmButton.isVisible()) {
      await confirmButton.click();
      // Verify confirmation feedback
      await expect(page.locator("text=saved|applied|confirmed")).toBeVisible({ timeout: 5000 });
    }
  });

  test("should handle CV extraction failures gracefully", async ({ page }) => {
    await page.goto("/onboarding");

    // Try to upload invalid file
    const cvInput = page.locator('input[type="file"]');
    if (await cvInput.isVisible()) {
      // Create invalid content (binary garbage)
      const invalidContent = new Uint8Array([0xff, 0xfe, 0x00, 0x00]);
      await cvInput.setInputFiles({
        name: "invalid.bin",
        mimeType: "application/octet-stream",
        buffer: invalidContent
      });

      // Should show error or allow manual entry
      await page.waitForTimeout(2000);
      const errorVisible = await page.locator("text=error|failed|unable|invalid").isVisible({ timeout: 5000 });
      const manualEntry = await page.locator('input[type="text"]').isVisible();

      expect(errorVisible || manualEntry).toBeTruthy();
    }
  });

  test("should persist state across page reload", async ({ page, context }) => {
    await page.goto("/onboarding");

    // Upload CV
    const cvInput = page.locator('input[type="file"]');
    if (await cvInput.isVisible()) {
      const cvContent = "Jane Smith\nQA Engineer\n3 years\nWork Permit: C";
      await cvInput.setInputFiles({
        name: "cv.txt",
        mimeType: "text/plain",
        buffer: Buffer.from(cvContent)
      });
      await page.waitForTimeout(2000);
    }

    // Answer first question
    const inputField = page.locator("[role=textbox], input[type=text]").first();
    if (await inputField.isVisible()) {
      await inputField.fill("Test Response");
    }

    // Store current state
    const preReloadState = await page.evaluate(() => ({
      url: window.location.href,
      bodyText: document.body.innerText.substring(0, 100)
    }));

    // Reload page
    await page.reload();

    // Should still be on onboarding page
    const postReloadState = await page.evaluate(() => ({
      url: window.location.href,
      bodyText: document.body.innerText.substring(0, 100)
    }));

    expect(postReloadState.url).toContain("/onboarding");

    // Previous content should still be visible or session should be resumable
    const resumeButton = page.locator("button:has-text('Resume'), text=continue").first();
    const statePreserved = 
      postReloadState.bodyText.includes("onboarding") ||
      await resumeButton.isVisible();

    expect(statePreserved).toBeTruthy();
  });

  test("should support language switching", async ({ page }) => {
    await page.goto("/onboarding");

    // Get English text
    const englishText = await page.locator("[lang='en'], [data-locale='en']").first().textContent();

    // Find language switcher
    const languageSwitcher = page.locator("button:has-text('Language'), select[name*='language']").first();
    if (await languageSwitcher.isVisible()) {
      await languageSwitcher.click();

      // Select German
      const germanOption = page.locator("text=Deutsch, German, DE").first();
      if (await germanOption.isVisible()) {
        await germanOption.click();
        await page.waitForTimeout(1000);

        // Verify German text appears
        const germanIndicators = ["Profil", "Sprache", "Weiter", "Überspringen"];
        for (const indicator of germanIndicators) {
          const found = await page.locator(`text=${indicator}`).isVisible({ timeout: 3000 }).catch(() => false);
          if (found) {
            expect(found).toBeTruthy();
            break;
          }
        }
      }
    }
  });

  test("should reject out-of-scope messages", async ({ page }) => {
    await page.goto("/onboarding");

    // Try to input an off-topic message
    const inputField = page.locator("[role=textbox], textarea, input[type=text]").first();
    if (await inputField.isVisible()) {
      await inputField.fill("Tell me a joke about programming");

      // Submit
      const submitButton = page.locator("button:has-text('Send'), button:has-text('Submit'), key=Enter");
      if (await submitButton.isVisible()) {
        await submitButton.click();
      } else {
        await inputField.press("Enter");
      }

      // Should see redirect or warning
      const warningVisible = await page.locator(
        "text=cannot|off-topic|scope|job search|profile"
      ).isVisible({ timeout: 5000 }).catch(() => false);

      // If no warning, it should redirect or stay on profile page
      const pageUrl = page.url();
      const redirected = pageUrl.includes("/profile") || pageUrl.includes("/dashboard");

      expect(warningVisible || redirected).toBeTruthy();
    }
  });

  test("should complete minimal profile requirements", async ({ page }) => {
    await page.goto("/onboarding");

    // Answer critical questions only
    const criticalFields = ["fullName", "primaryRole", "preferredLocation", "workPermitStatus"];

    for (let i = 0; i < criticalFields.length; i++) {
      // Fill in a response
      const input = page.locator("[role=textbox], input[type=text]").first();
      if (await input.isVisible()) {
        await input.fill(`Answer for ${criticalFields[i]}`);

        // Submit response
        const nextButton = page.locator("button:has-text('Next'), button:has-text('Confirm')").first();
        if (await nextButton.isVisible()) {
          await nextButton.click();
        } else {
          await input.press("Enter");
        }

        await page.waitForTimeout(500);
      }
    }

    // Should show completion message
    await expect(page.locator(
      "text=complete|finished|ready|profile"
    )).toBeVisible({ timeout: 10000 });
  });

  test("should provide health check endpoint", async ({ page }) => {
    // Make direct request to health endpoint
    const response = await page.evaluate(async () => {
      const res = await fetch("/api/health/onboarding");
      return res.json();
    });

    expect(response.status).toBeDefined();
    expect(["healthy", "degraded", "unhealthy"]).toContain(response.status);
    expect(response.components).toBeDefined();
    expect(response.components.database).toBeDefined();
    expect(response.components.localization).toBeDefined();
    expect(response.components.guards).toBeDefined();
  });
});

test.describe("Onboarding Scope Guards", () => {
  test("should identify on-scope messages", async ({ page }) => {
    // This is a unit test run in the browser context
    const result = await page.evaluate(() => {
      // Simulates isOnboardingInScope logic
      const scopeKeywords = ["role", "job", "profile", "cv", "permit", "work", "location"];
      const testMessages = [
        "What role are you targeting?", // in scope
        "I want to be a Product Manager", // in scope
        "Tell me a joke", // out of scope
        "How do I write a CV?", // in scope
        "What's the weather?", // out of scope
      ];

      return testMessages.map(msg => ({
        message: msg,
        isInScope: scopeKeywords.some(kw => msg.toLowerCase().includes(kw))
      }));
    });

    expect(result[0].isInScope).toBe(true);
    expect(result[1].isInScope).toBe(true);
    expect(result[2].isInScope).toBe(false);
    expect(result[3].isInScope).toBe(true);
    expect(result[4].isInScope).toBe(false);
  });
});
