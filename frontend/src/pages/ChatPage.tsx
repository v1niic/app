import { Link } from "react-router-dom";
import { CalendarDays, MessagesSquare } from "lucide-react";

import ChatPanel from "@/components/chat/ChatPanel";
import MeetupsPanel from "@/components/chat/MeetupsPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";

export default function ChatPage() {
  const { data: user, isLoading } = useAuth();

  if (isLoading) {
    return <div className="mx-auto mt-10 h-40 max-w-2xl animate-pulse rounded-xl bg-slate-800/60" />;
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center" data-testid="chat-login-required">
        <MessagesSquare className="mx-auto h-10 w-10 text-emerald-400" />
        <h1 className="mt-4 font-heading text-2xl font-black text-white">Converse com outros ciclistas</h1>
        <p className="mt-2 text-sm text-slate-400">
          Entre para falar com a galera durante o pedal e marcar encontros para pedalar juntos.
        </p>
        <div className="mt-5 flex justify-center gap-4">
          <Link to="/login" className="text-sm font-semibold text-emerald-400 underline-offset-4 hover:underline">Entrar</Link>
          <Link to="/register" className="text-sm font-semibold text-emerald-400 underline-offset-4 hover:underline">Criar conta grátis</Link>
        </div>
      </div>
    );
  }

  return (
    // a altura desconta a barra do topo (e a de baixo no celular) para o campo de mensagem ficar sempre à vista
    <div className="mx-auto flex h-[calc(100svh-7rem-env(safe-area-inset-bottom))] max-w-2xl flex-col px-4 pt-3 md:h-[calc(100svh-3.5rem)]" data-testid="chat-page">
      <Tabs defaultValue="chat" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="w-full">
          <TabsTrigger value="chat" data-testid="tab-chat">
            <MessagesSquare className="h-4 w-4" /> Conversa
          </TabsTrigger>
          <TabsTrigger value="meetups" data-testid="tab-meetups">
            <CalendarDays className="h-4 w-4" /> Encontros
          </TabsTrigger>
        </TabsList>
        <TabsContent value="chat" className="min-h-0 flex-1">
          <ChatPanel user={user} />
        </TabsContent>
        <TabsContent value="meetups" className="min-h-0 flex-1 overflow-y-auto">
          <MeetupsPanel user={user} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
