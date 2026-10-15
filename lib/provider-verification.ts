import type { ProviderName, ProviderHealth } from "@/lib/provider-types";

export async function verifyProviderKey(
  provider: ProviderName,
  credential: string
): Promise<ProviderHealth> {
  const endpoints: Record<ProviderName, string> = {
    openai: "https://api.openai.com/v1/models",
    anthropic: "https://api.anthropic.com/v1/models?limit=1",
    google: "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1",
    openrouter: "https://openrouter.ai/api/v1/key"
  };
  const headers: Record<string,string> =
    provider === "anthropic" ? { "x-api-key": credential, "anthropic-version": "2023-06-01" }
    : provider === "google" ? { "x-goog-api-key": credential }
    : { Authorization: "Bearer " + credential };
  try {
    const response = await fetch(endpoints[provider], {
      method: "GET", headers, cache: "no-store", redirect: "error",
      signal: AbortSignal.timeout(10000)
    });
    await response.body?.cancel().catch(() => {});
    if (response.ok) return "healthy";
    if (response.status === 401 || response.status === 403) return "invalid";
    if (response.status === 429) return "limited";
    return "unavailable";
  } catch {
    return "unavailable";
  }
}
