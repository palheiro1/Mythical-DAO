import { useQuery } from "@tanstack/react-query";
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(
    "/api/" + path,
    body
      ? {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw new Error(data.error ?? "The request could not be completed.");
  return data;
}
export function useApi<T>(path: string, enabled = true, interval = 30_000) {
  return useQuery({
    queryKey: [path],
    queryFn: () => api<T>(path),
    enabled,
    refetchInterval: interval,
    retry: 1,
  });
}
