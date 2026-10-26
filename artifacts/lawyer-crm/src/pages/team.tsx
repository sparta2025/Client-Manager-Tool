import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Check, Clock3, ShieldCheck, UserRound, UsersRound, X } from "lucide-react";
import { toast } from "sonner";
import {
  getListTeamMembersQueryKey,
  getGetCurrentTeamMemberQueryKey,
  useListTeamMembers,
  useUpdateTeamMember,
} from "@workspace/api-client-react";
import type { TeamMember, TeamMemberStatus, TeamMemberUpdate, TeamRole } from "@workspace/api-client-react";
import { useAccess } from "@/lib/access-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const roleLabel: Record<TeamRole, string> = { admin: "Администратор", lawyer: "Юрист", assistant: "Ассистент" };
const statusLabel: Record<TeamMemberStatus, string> = { active: "Активен", pending: "Ожидает", disabled: "Отключён" };

export default function TeamPage() {
  const queryClient = useQueryClient();
  const { member: currentMember, isAdmin } = useAccess();
  const query = useListTeamMembers({ query: { queryKey: getListTeamMembersQueryKey() } });
  const updateMember = useUpdateTeamMember();
  const allMembers = query.data ?? [];
  const members = isAdmin ? allMembers : allMembers.filter((person) => person.id === currentMember.id);
  const pendingCount = members.filter((person) => person.status === "pending").length;

  const update = (person: TeamMember, data: TeamMemberUpdate, onSuccess?: (updated: TeamMember) => void) => {
    updateMember.mutate({ id: person.id, data }, {
      onSuccess: async (updated) => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: getListTeamMembersQueryKey() }),
          ...(person.id === currentMember.id ? [queryClient.invalidateQueries({ queryKey: getGetCurrentTeamMemberQueryKey() })] : []),
        ]);
        onSuccess?.(updated);
        if (!onSuccess) toast.success("Доступ участника обновлён");
      },
      onError: () => toast.error("Не удалось сохранить изменения. Попробуйте ещё раз."),
    });
  };

  return <main className="mx-auto max-w-6xl space-y-8 px-4 py-8 md:px-8 md:py-12">
    <header className="flex flex-col justify-between gap-5 border-b border-border pb-7 sm:flex-row sm:items-end">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[.2em] text-muted-foreground">{isAdmin ? "Администрирование" : "Профиль"}</p>
        <h1 className="mt-2 font-serif text-4xl tracking-tight text-primary">{isAdmin ? "Доступ команды" : "Мой профиль"}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{isAdmin ? "Уточняйте контактные данные команды и управляйте доступом к делам." : "Ваши контактные данные для работы внутри CRM."}</p>
      </div>
      {isAdmin && <div className="flex items-center gap-3 rounded-2xl border border-amber-300/60 bg-amber-50/70 px-4 py-3 text-amber-950 dark:bg-amber-950/20 dark:text-amber-100">
        <Clock3 className="h-5 w-5 shrink-0" /><span className="text-sm"><strong className="font-semibold">{pendingCount}</strong> заявок ожидают решения</span>
      </div>}
    </header>

    {isAdmin && <section className="grid gap-4 sm:grid-cols-3">
      <Metric icon={<UsersRound className="h-4 w-4" />} label="Участники" value={members.length} />
      <Metric icon={<ShieldCheck className="h-4 w-4" />} label="Активный доступ" value={members.filter((item) => item.status === "active").length} />
      <Metric icon={<Clock3 className="h-4 w-4" />} label="Ожидают подтверждения" value={pendingCount} />
    </section>}

    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-5 py-4 md:px-6">
        <div><h2 className="font-serif text-xl text-primary">{isAdmin ? "Участники команды" : "Контактные данные"}</h2><p className="mt-1 text-xs text-muted-foreground">{isAdmin ? "Профили CRM и права доступа" : "Изменения видны команде в CRM"}</p></div>
        <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold tabular-nums text-muted-foreground">{members.length}</span>
      </div>
      {query.isLoading ? <div className="space-y-3 p-6" aria-label="Загрузка профиля"><div className="h-32 animate-pulse rounded-xl bg-muted" /><div className="h-32 animate-pulse rounded-xl bg-muted" /></div>
        : query.isError ? <div className="m-5 rounded-xl border border-destructive/20 bg-destructive/5 p-5"><p className="text-sm text-destructive">Не удалось загрузить данные команды.</p><Button size="sm" variant="outline" className="mt-3" onClick={() => query.refetch()}>Повторить</Button></div>
          : members.length === 0 ? <div className="m-5 rounded-xl border border-dashed p-10 text-center"><UsersRound className="mx-auto h-8 w-8 text-muted-foreground/60" /><p className="mt-3 font-medium text-primary">Профиль не найден</p><p className="mt-1 text-sm text-muted-foreground">Обновите страницу или обратитесь к администратору.</p></div>
            : <div className="divide-y divide-border">
              {members.map((person) => <MemberRow
                key={person.id}
                person={person}
                self={person.id === currentMember.id}
                isAdmin={isAdmin}
                updating={updateMember.isPending && updateMember.variables?.id === person.id}
                onUpdate={(data, onSuccess) => update(person, data, onSuccess)}
              />)}
            </div>}
      {isAdmin && <div className="border-t border-border bg-muted/30 px-5 py-3 text-xs leading-5 text-muted-foreground md:px-6">Имя и электронная почта в профиле — контактные данные CRM; они не меняют учётную запись для входа через Clerk.</div>}
    </section>
  </main>;
}

function MemberRow({ person, self, isAdmin, updating, onUpdate }: {
  person: TeamMember;
  self: boolean;
  isAdmin: boolean;
  updating: boolean;
  onUpdate: (data: TeamMemberUpdate, onSuccess?: (updated: TeamMember) => void) => void;
}) {
  const [displayName, setDisplayName] = useState(person.displayName ?? "");
  const [email, setEmail] = useState(person.email ?? "");
  const [jobTitle, setJobTitle] = useState(person.jobTitle ?? "");
  const [phone, setPhone] = useState(person.phone ?? "");
  const editable = isAdmin || self;

  const saveProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextName = displayName.trim();
    const nextEmail = email.trim();
    const changesIdentity = isAdmin && (nextName !== (person.displayName ?? "") || nextEmail !== (person.email ?? ""));
    if (changesIdentity && !window.confirm("Вы меняете имя или электронную почту в CRM. Это контактные данные и они не изменят идентификатор или адрес входа через Clerk. Продолжить?")) return;
    onUpdate({
      displayName: nextName || null,
      email: nextEmail || null,
      jobTitle: jobTitle.trim() || null,
      phone: phone.trim() || null,
    }, (updated) => {
      setDisplayName(updated.displayName ?? "");
      setEmail(updated.email ?? "");
      setJobTitle(updated.jobTitle ?? "");
      setPhone(updated.phone ?? "");
      toast.success("Профиль сохранён");
    });
  };

  const updateAccess = (data: TeamMemberUpdate) => onUpdate(data);
  const identityEditDate = person.identityEditedAt
    ? format(new Date(person.identityEditedAt), "d MMM yyyy, HH:mm", { locale: ru })
    : null;

  return <article className="grid gap-5 px-5 py-6 md:px-6" data-testid={`row-team-member-${person.id}`}>
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
      <div className="flex min-w-0 items-center gap-3">
        <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${person.status === "active" ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"}`}><UserRound className="h-5 w-5" /></div>
        <div className="min-w-0"><p className="truncate text-sm font-semibold text-primary">{person.displayName || "Имя не указано"}{self && <span className="ml-2 text-xs font-normal text-muted-foreground">(вы)</span>}</p><p className="truncate text-sm text-muted-foreground">{person.email || "Электронная почта не указана"}</p><p className="mt-1 text-[11px] text-muted-foreground">В команде с {format(new Date(person.createdAt), "d MMM yyyy", { locale: ru })}</p></div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={person.status === "active" ? "closed" : person.status === "pending" ? "in_progress" : "outline"}>{statusLabel[person.status]}</Badge>
        <Badge variant="outline">{roleLabel[person.role]}</Badge>
      </div>
    </div>

    {person.identityEditedBy === "admin" && <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-amber-800 dark:text-amber-300" data-testid={`text-admin-identity-edit-${person.id}`}>
      <span className="rounded-full bg-amber-100 px-2.5 py-1 font-semibold dark:bg-amber-900/40">Изменено администратором</span>
      {identityEditDate && <span>{identityEditDate}</span>}
    </p>}

    {editable && <form onSubmit={saveProfile} className="grid gap-4 rounded-xl border border-border/80 bg-muted/20 p-4 sm:grid-cols-2" data-testid={`form-member-profile-${person.id}`}>
      <div className="space-y-1.5"><Label htmlFor={`member-name-${person.id}`}>Имя для CRM</Label><Input id={`member-name-${person.id}`} data-testid={`input-member-name-${person.id}`} value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={160} disabled={updating} /></div>
      <div className="space-y-1.5"><Label htmlFor={`member-email-${person.id}`}>Контактная почта</Label><Input id={`member-email-${person.id}`} data-testid={`input-member-email-${person.id}`} type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={255} disabled={updating} /></div>
      <div className="space-y-1.5"><Label htmlFor={`member-title-${person.id}`}>Должность</Label><Input id={`member-title-${person.id}`} data-testid={`input-member-title-${person.id}`} value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} maxLength={120} disabled={updating} placeholder="Например, юрист по гражданским делам" /></div>
      <div className="space-y-1.5"><Label htmlFor={`member-phone-${person.id}`}>Телефон</Label><Input id={`member-phone-${person.id}`} data-testid={`input-member-phone-${person.id}`} type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={60} disabled={updating} /></div>
      <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2">
        <p className="text-xs text-muted-foreground">{self ? "Изменения обновят ваш профиль в CRM." : "Это контактные данные CRM, не учётные данные Clerk."}</p>
        <Button type="submit" size="sm" disabled={updating}>{updating ? "Сохраняем…" : "Сохранить профиль"}</Button>
      </div>
    </form>}

    {isAdmin && <div className="grid gap-4 border-t border-border/70 pt-4 sm:grid-cols-[minmax(180px,.7fr)_minmax(180px,.7fr)_1fr] sm:items-end">
      <div className="space-y-1.5"><Label htmlFor={`member-role-${person.id}`}>Роль</Label>
        <Select value={person.role} disabled={updating} onValueChange={(role) => updateAccess({ role: role as TeamRole })}>
          <SelectTrigger id={`member-role-${person.id}`} className="h-10" aria-label={`Роль участника ${person.displayName || person.email}`} data-testid={`select-member-role-${person.id}`}><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="admin">Администратор</SelectItem><SelectItem value="lawyer">Юрист</SelectItem><SelectItem value="assistant">Ассистент</SelectItem></SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5"><Label>Статус доступа</Label><div className="flex flex-wrap gap-2">
        {person.status === "pending" && <Button size="sm" disabled={updating} onClick={() => updateAccess({ status: "active" })} data-testid={`button-approve-member-${person.id}`}><Check className="mr-1.5 h-4 w-4" />Подтвердить</Button>}
        {person.status === "active" && <Button size="sm" variant="outline" disabled={updating} onClick={() => updateAccess({ status: "disabled" })} data-testid={`button-disable-member-${person.id}`}><X className="mr-1.5 h-4 w-4" />Отключить</Button>}
        {person.status === "disabled" && <Button size="sm" variant="outline" disabled={updating} onClick={() => updateAccess({ status: "active" })} data-testid={`button-enable-member-${person.id}`}><Check className="mr-1.5 h-4 w-4" />Включить</Button>}
      </div></div>
      <p className="text-xs leading-5 text-muted-foreground sm:text-right">Права доступа влияют на доступ сотрудника к делам.</p>
    </div>}
  </article>;
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return <Card className="border-border/80 shadow-none"><CardContent className="flex items-center justify-between gap-4 p-4"><div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-serif text-3xl tabular-nums text-primary">{value}</p></div><span className="rounded-xl bg-primary/5 p-3 text-primary">{icon}</span></CardContent></Card>;
}
