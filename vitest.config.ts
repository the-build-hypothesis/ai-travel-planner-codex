import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";
export default defineWorkersConfig({
  test: {
    testTimeout: 15000,
    include: ["tests/**/*.test.ts"],
    poolOptions: {
      workers: {
        singleWorker: true,
        miniflare: {
          compatibilityDate: "2025-09-01",
          compatibilityFlags: ["nodejs_compat"],
          d1Databases: ["DB"],
          bindings: {
            APP_PUBLIC_URL: "https://test.example",
            LLM_PROVIDER: "openai",
            LLM_MODEL: "test-model",
            OPENAI_API_KEY: "test-key",
            EMAIL_FROM: "test@example.com",
            PRICING_JSON: JSON.stringify({
              "test-model": {
                input: 1,
                output: 4,
                cached: 0.5,
                reference: "test fixture",
              },
              google_text_search: {
                per1000: 32,
                reference: "test fixture only",
              },
            }),
          },
        },
      },
    },
  },
});
