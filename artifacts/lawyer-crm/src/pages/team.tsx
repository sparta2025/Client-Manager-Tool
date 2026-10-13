import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Check, Clock3, ShieldCheck, UserRound, UsersRound, X } from "lucide-react";
import { toast } from "sonner";
import {
  getListTeamMembersQueryKey,
  useListTeamMembers,
  useUpdateTeamMember,
} from "@workspace/api-client-react";
import type { TeamMember, TeamMemberStatus, TeamRole } from "@workspace/api-client-react";
import { useAccess } from "@/lib/access-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const roleLabel: Record<TeamRole, string> = { admin: "Администратор", lawyer: "Юрист", assistant: "Ассистент" };
const statusLabel: Record<TeamMemberStatus, string> = { active: "Активен", pending: "Ожидает", disabled: "Отключён" };

export default function TeamPage() {
  const queryClient = useQueryClient();
  const { member: currentMember } = useAccess();
  const query = useListTeamMembers({ query: { queryKey: getListTeamMembersQueryKey() } });
  const updateMember = useUpdateTeamMember();
  const members = query.data ?? [];
  const pendingCount = members.filter((member) => member.status === "pending").length;

  const update = (member: TeamMember, data: { role?: TeamRole; status?: TeamMemberStatus }) => {
    updateMember.mutate({ id: member.id, data }, {
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: getListTeamMembersQueryKey() });
        toast.success("Доступ участника обновлён");
      },
      onError: () => toast.error("Не удалось изменить доступ. Попробуйте ещё раз."),
    });
  };

  return <main className="mx-auto max-w-6xl space-y-8 px-4 py-8 md:px-8 md:py-12">
    <header className="flex flex-col justify-between gap-5 border-b border-border pb-7 sm:flex-row sm:items-end">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[.2em] text-muted-foreground">Администрирование</p>
        <h1 className="mt-2 font-serif text-4xl tracking-tight text-primary">Доступ команды</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Подтверждайте новые аккаунты и назначайте роли. Состав команды определяет, какие дела сотрудник увидит.</p>
      </div>
      <div className="flex items-center gap-3 rounded-2xl border border-amber-300/60 bg-amber-50/70 px-4 py-3 text-amber-950 dark:bg-amber-950/20 dark:text-amber-100">
        <Clock3 className="h-5 w-5 shrink-0" /><span className="text-sm"><strong className="font-semibold">{pendingCount}</strong> заявок ожидают решения</span>
      </div>
    </header>

    <section className="grid gap-4 sm:grid-cols-3">
      <Metric icon={<UsersRound className="h-4 w-4" />} label="Участники" value={members.length} />
      <Metric icon={<ShieldCheck className="h-4 w-4" />} label="Активный доступ" value={members.filter((item) => item.status === "active").length} />
      <Metric icon={<Clock3 className="h-4 w-4" />} label="Ожидают подтверждения" value={pendingCount} />
    </section>

    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-5 py-4 md:px-6">
        <div><h2 className="font-serif text-xl text-primary">Участники команды</h2><p className="mt-1 text-xs text-muted-foreground">Доступ и ответственность за дела</p></div>
        <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold tabular-nums text-muted-foreground">{members.length}</span>
      </div>
      {query.isLoading ? <div className="space-y-3 p-6" aria-label="Загрузка команды"><div className="h-16 animate-pulse rounded-xl bg-muted" /><div className="h-16 animate-pulse rounded-xl bg-muted" /><div className="h-16 animate-pulse rounded-xl bg-muted" /></div>
        : query.isError ? <div className="m-5 rounded-xl border border-destructive/20 bg-destructive/5 p-5"><p className="text-sm text-destructive">Не удалось загрузить список команды.</p><Button size="sm" variant="outline" className="mt-3" onClick={() => query.refetch()}>Повторить</Button></div>
          : members.length === 0 ? <div className="m-5 rounded-xl border border-dashed p-10 text-center"><UsersRound className="mx-auto h-8 w-8 text-muted-foreground/60" /><p className="mt-3 font-medium text-primary">Пока нет участников</p><p className="mt-1 text-sm text-muted-foreground">Зарегистрированные аккаунты появятся здесь.</p></div>
            : <div className="divide-y divide-border">
              {members.map((person) => {
                const self = person.id === currentMember.id;
                const updating = updateMember.isPending && updateMember.variables?.id === person.id;
                return <article key={person.id} className="grid gap-4 px-5 py-5 md:grid-cols-[minmax(220px,1.2fr)_minmax(150px,.7fr)_minmax(140px,.6fr)_auto] md:items-center md:px-6" data-testid={`row-team-member-${person.id}`}>
                  <div className="flex min-w-0 items-center gap-3">
                    <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${person.status === "active" ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"}`}><UserRound className="h-5 w-5" /></div>
                    <div className="min-w-0"><p className="truncate text-sm font-semibold text-primary">{person.displayName || "Имя не указано"}{self && <span className="ml-2 text-xs font-normal text-muted-foreground">(вы)</span>}</p><p className="truncate text-sm text-muted-foreground">{person.email || "Электронная почта не указана"}</p><p className="mt-1 text-[11px] text-muted-foreground">В команде с {format(new Date(person.createdAt), "d MMM yyyy", { locale: ru })}</p></div>
                  </div>
                  <div className="space-y-1"><p className="text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">Роль</p>
                    <Select value={person.role} disabled={self || updating} onValueChange={(role) => update(person, { role: role as TeamRole })}>
                      <SelectTrigger className="h-9 w-full max-w-[190px]" aria-label={`Роль участника ${person.displayName || person.email}`}><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="admin">Администратор</SelectItem><SelectItem value="lawyer">Юрист</SelectItem><SelectItem value="assistant">Ассистент</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1"><p className="text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">Статус доступа</p><Badge variant={person.status === "active" ? "closed" : person.status === "pending" ? "in_progress" : "outline"}>{statusLabel[person.status]}</Badge></div>
                  <div className="flex flex-wrap gap-2 md:justify-end">
                    {person.status === "pending" && <Button size="sm" disabled={updating} onClick={() => update(person, { status: "active" })} data-testid={`button-approve-member-${person.id}`}><Check className="mr-1.5 h-4 w-4" />Подтвердить</Button>}
                    {person.status === "active" && !self && <Button size="sm" variant="outline" disabled={updating} onClick={() => update(person, { status: "disabled" })} data-testid={`button-disable-member-${person.id}`}><X className="mr-1.5 h-4 w-4" />Отключить</Button>}
                    {person.status === "disabled" && <Button size="sm" variant="outline" disabled={updating} onClick={() => update(person, { status: "active" })} data-testid={`button-enable-member-${person.id}`}><Check className="mr-1.5 h-4 w-4" />Включить</Button>}
                    {self && <span className="self-center text-xs text-muted-foreground">Ваша учётная запись</span>}
                  </div>
                </article>;
              })}
            </div>}
      <div className="border-t border-border bg-muted/30 px-5 py-3 text-xs leading-5 text-muted-foreground md:px-6">Юристы и ассистенты видят только закреплённые за ними дела. Назначение ответственного доступно администратору.</div>
    </section>
  </main>;
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return <Card className="border-border/80 shadow-none"><CardContent className="flex items-center justify-between gap-4 p-4"><div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-serif text-3xl tabular-nums text-primary">{value}</p></div><span className="rounded-xl bg-primary/5 p-3 text-primary">{icon}</span></CardContent></Card>;
}
