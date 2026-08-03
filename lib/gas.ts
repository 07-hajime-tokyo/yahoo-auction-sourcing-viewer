const TIMEOUT_MS = 10_000;

type GasParams = Record<string, string | number | boolean | null | undefined>;

export function hasGasConfig() {
  return Boolean(process.env.GAS_API_URL?.trim());
}

export async function fetchGasJson<T>(params: GasParams): Promise<T> {
  const baseUrl = process.env.GAS_API_URL?.trim();

  if (!baseUrl) {
    throw new Error("GAS_API_URL is not configured.");
  }

  const url = new URL(baseUrl);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const token = process.env.GAS_READ_TOKEN?.trim();
  if (token) {
    url.searchParams.set("token", token);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      throw new Error(`GAS API returned HTTP ${response.status}.`);
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("GAS API timed out after 10 seconds.");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown API error.";
}
