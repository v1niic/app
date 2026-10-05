import { apiPost } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

/** Call right after a successful login/register: the session cookie is already set, refresh all cached data. */
export async function beginSession(): Promise<void> {
  await queryClient.invalidateQueries();
}

/** The only way to sign out: clears the server cookie AND the react-query cache (no cache leaks between accounts). */
export async function endSession(): Promise<void> {
  try {
    await apiPost("/auth/logout");
  } finally {
    queryClient.clear();
  }
}
