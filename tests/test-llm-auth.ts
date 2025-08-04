import { chromium } from "playwright";
import {
  LLMBrowserAgent,
  authenticateWithLLM,
} from "../src/modules/llm-browser-agent";
import * as dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

async function testLLMAuth() {
  const browser = await chromium.launch({
    headless: false,
    slowMo: 500,
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log("🤖 Testing LLM-powered authentication...\n");

    const email = process.env.TEST_EMAIL || "hari@tryloop.ai";
    const password = process.env.TEST_PASSWORD || "Loop@134";
    const loginUrl = "https://app.tryloop.ai/login/password";
    const apiKey = process.env.CLAUDE_API_KEY;
    console.log(apiKey);

    if (!apiKey) {
      console.error("❌ CLAUDE_API_KEY environment variable is required");
      process.exit(1);
    }

    console.log("Configuration:");
    console.log(`  URL: ${loginUrl}`);
    console.log(`  Email: ${email}`);
    console.log(`  API Key: ${apiKey.substring(0, 10)}...`);
    console.log("");

    // Test authentication
    const success = await authenticateWithLLM(
      page,
      email,
      password,
      loginUrl,
      apiKey,
      true, // debug mode
    );

    if (success) {
      console.log("\n✅ Authentication successful!");
      console.log(`Current URL: ${page.url()}`);

      // Take a screenshot of the authenticated page
      await page.screenshot({
        path: "test-results/authenticated-page.png",
        fullPage: true,
      });
      console.log("📸 Screenshot saved: test-results/authenticated-page.png");

      // Test some natural language tasks
      console.log("\n🧪 Testing natural language tasks...");

      const agent = new LLMBrowserAgent(apiKey);

      // Example tasks
      const tasks = [
        "Click on the Dashboard navigation link",
        "Take a screenshot of the current page",
      ];

      for (const task of tasks) {
        console.log(`\n📌 Task: ${task}`);
        try {
          await agent.executeTask(page, task, true);
          console.log("✅ Task completed");
        } catch (error: any) {
          console.log("❌ Task failed:", error.message);
        }
      }
    } else {
      console.log("\n❌ Authentication failed");
    }
  } catch (error) {
    console.error("Error:", error);
  }

  console.log("\n⏸️  Browser will remain open for 30 seconds...");
  await page.waitForTimeout(30000);

  await browser.close();
}

testLLMAuth().catch(console.error);
