import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { MailCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiDetail, apiPost } from "@/lib/api";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const mutation = useMutation({
    mutationFn: () => apiPost<{ ok: boolean; email_enabled: boolean }>("/auth/forgot", { email }),
    onSuccess: () => setSent(true),
    onError: (err) => toast.error(apiDetail(err, "Não foi possível enviar agora. Tente novamente.")),
  });

  return (
    <div className="flex min-h-[calc(100svh-3.5rem)] items-center justify-center px-4 py-16" data-testid="forgot-page">
      <div className="w-full max-w-sm">
        {sent ? (
          <div className="text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400">
              <MailCheck className="h-7 w-7" />
            </span>
            <h1 className="mt-4 font-heading text-2xl font-black tracking-tight text-white">Confira seu e-mail</h1>
            <p className="mt-2 text-sm text-slate-400">
              Se <b className="text-slate-200">{email}</b> tiver cadastro, enviamos um link para criar uma nova senha. Ele vale por 1 hora.
              Não achou? Olhe a caixa de spam.
            </p>
            <Link to="/login" className="mt-6 inline-block text-sm font-semibold text-emerald-400 hover:underline">
              Voltar para o login
            </Link>
          </div>
        ) : (
          <>
            <h1 className="font-heading text-3xl font-black tracking-tight text-white">Esqueceu a senha?</h1>
            <p className="mt-1 text-sm text-slate-400">Digite o e-mail da sua conta e enviaremos um link para criar uma nova senha.</p>
            <form
              className="mt-8 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                mutation.mutate();
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="forgot-email" className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  E-mail
                </Label>
                <Input
                  id="forgot-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@email.com"
                />
              </div>
              <Button type="submit" className="w-full" size="lg" disabled={mutation.isPending}>
                {mutation.isPending ? "Enviando…" : "Enviar link"}
              </Button>
            </form>
            <p className="mt-6 text-center text-sm text-slate-400">
              <Link to="/login" className="font-semibold text-emerald-400 hover:underline">
                Voltar para o login
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
