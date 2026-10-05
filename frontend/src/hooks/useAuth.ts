import { useQuery } from "@tanstack/react-query";
import { ApiError, apiGet } from "@/lib/api";
import type { User } from "@/lib/types";

/** null = visitante (401 tratado aqui, não espalha erro pela tela). */
export function useAuth() {
  return useQuery<User | null>({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        return await apiGet<User>("/auth/me");
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    refetchOnWindowFocus: false,
  });
}
