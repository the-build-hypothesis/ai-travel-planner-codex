declare module "cloudflare:test" {
  interface ProvidedEnv {
    DB: D1Database;
    APP_PUBLIC_URL: string;
    LLM_PROVIDER: string;
    LLM_MODEL: string;
    OPENAI_API_KEY: string;
    EMAIL_FROM: string;
    PRICING_JSON: string;
  }
}
