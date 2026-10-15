export const providers = ["openai", "anthropic", "google", "openrouter"] as const;
export type ProviderName = typeof providers[number];
export type ProviderHealth = "healthy" | "invalid" | "limited" | "unavailable";
