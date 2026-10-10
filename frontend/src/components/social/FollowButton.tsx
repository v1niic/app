import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { UserCheck, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { apiDelete, apiDetail, apiPost } from "@/lib/api";
import type { PublicUser } from "@/lib/types";

/** Seguir / Seguindo. Atualiza as listas e o perfil da pessoa assim que o servidor responde. */
export default function FollowButton({ person, size = "sm" }: { person: PublicUser; size?: "sm" | "default" }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () =>
      person.is_following
        ? apiDelete<PublicUser>(`/social/people/${person.id}/follow`)
        : apiPost<PublicUser>(`/social/people/${person.id}/follow`),
    onSuccess: (p) => {
      void queryClient.invalidateQueries({ queryKey: ["people"] });
      toast.success(p.is_following ? `Você agora segue ${p.name}` : `Você deixou de seguir ${p.name}`);
    },
    onError: (err) => toast.error(apiDetail(err, "Não foi possível atualizar")),
  });

  return (
    <Button
      size={size}
      variant={person.is_following ? "outline" : "default"}
      disabled={mutation.isPending}
      onClick={(e) => {
        e.preventDefault(); // o botão fica dentro de cartões clicáveis
        mutation.mutate();
      }}
      data-testid={`follow-${person.id}`}
    >
      {person.is_following ? (
        <>
          <UserCheck className="h-4 w-4" /> Seguindo
        </>
      ) : (
        <>
          <UserPlus className="h-4 w-4" /> {person.follows_me ? "Seguir de volta" : "Seguir"}
        </>
      )}
    </Button>
  );
}
