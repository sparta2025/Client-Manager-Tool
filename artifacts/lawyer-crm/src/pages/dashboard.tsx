import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useListClients, 
  useGetClientsSummary, 
  useCreateClient, 
  useUpdateClient, 
  useDeleteClient,
  getListClientsQueryKey,
  getGetClientsSummaryQueryKey
} from "@workspace/api-client-react";
import type { Client } from "@workspace/api-client-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { 
  Plus, 
  Trash2, 
  Pencil,
  Briefcase, 
  UserPlus, 
  CheckCircle2, 
  Clock 
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

function toDateTimeLocalValue(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDateTimeLocalValue(value: string): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
}

const STATUS_MAP = {
  new: { label: "Новый", variant: "new" as const, icon: UserPlus },
  in_progress: { label: "В работе", variant: "in_progress" as const, icon: Clock },
  closed: { label: "Закрыт", variant: "closed" as const, icon: CheckCircle2 },
};

export default function Dashboard() {
  const queryClient = useQueryClient();
  const { data: clients, isLoading: isClientsLoading } = useListClients();
  const { data: summary, isLoading: isSummaryLoading } = useGetClientsSummary();
  
  const updateClient = useUpdateClient();
  const deleteClient = useDeleteClient();

  const handleStatusChange = (id: number, status: "new" | "in_progress" | "closed") => {
    updateClient.mutate({ id, data: { status } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetClientsSummaryQueryKey() });
        toast.success("Статус дела обновлен");
      },
      onError: () => {
        toast.error("Не удалось обновить статус");
      }
    });
  };

  const handleDelete = (id: number) => {
    if (!confirm("Вы уверены, что хотите удалить дело клиента?")) return;
    deleteClient.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetClientsSummaryQueryKey() });
        toast.success("Дело удалено");
      },
      onError: () => {
        toast.error("Не удалось удалить дело");
      }
    });
  };

  return (
    <div className="min-h-screen bg-background p-6 md:p-12 font-sans text-foreground">
      <div className="max-w-6xl mx-auto space-y-10">
        <header className="flex flex-col md:flex-row items-start md:items-end justify-between gap-4 border-b pb-6 border-border animate-in fade-in slide-in-from-top-4 duration-700">
          <div>
            <h1 className="text-4xl md:text-5xl font-serif font-medium tracking-tight text-primary">Юридическая консультация/услуги</h1>
            <p className="text-muted-foreground mt-3 text-sm md:text-base">Сводка по делам и контроль статусов процессов</p>
          </div>
          <AddClientModal />
        </header>

        <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 animate-in fade-in zoom-in-95 duration-700 delay-100 fill-mode-both">
          <SummaryCard 
            title="Всего дел" 
            value={summary?.total} 
            loading={isSummaryLoading} 
            icon={<Briefcase className="h-4 w-4 text-muted-foreground" />} 
          />
          <SummaryCard 
            title="Новые обращения" 
            value={summary?.new} 
            loading={isSummaryLoading} 
            icon={<UserPlus className="h-4 w-4 text-[#0369a1]" />} 
          />
          <SummaryCard 
            title="В производстве" 
            value={summary?.in_progress} 
            loading={isSummaryLoading} 
            icon={<Clock className="h-4 w-4 text-[#b45309]" />} 
          />
          <SummaryCard 
            title="Завершенные" 
            value={summary?.closed} 
            loading={isSummaryLoading} 
            icon={<CheckCircle2 className="h-4 w-4 text-[#15803d]" />} 
          />
        </section>

        <section className="bg-card border rounded-2xl shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200 fill-mode-both">
          <div className="p-6 border-b border-border bg-card">
            <h2 className="text-xl font-serif font-medium text-primary">Список клиентов</h2>
          </div>
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="w-[300px]">Клиент</TableHead>
                <TableHead>Контакт</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Дата обращения</TableHead>
                <TableHead>Дата закрытия обращения</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isClientsLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-16 text-muted-foreground">
                    Загрузка списка дел...
                  </TableCell>
                </TableRow>
              ) : clients?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-16 text-muted-foreground">
                    Список дел пуст. Добавьте первого клиента.
                  </TableCell>
                </TableRow>
              ) : (
                clients?.map((client) => (
                  <TableRow key={client.id} className="group transition-colors hover:bg-muted/50">
                    <TableCell className="font-medium text-primary py-4">{client.name}</TableCell>
                    <TableCell className="text-muted-foreground tabular-nums py-4">{client.phone}</TableCell>
                    <TableCell className="py-4">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="inline-flex items-center gap-1.5 focus:outline-none rounded-full ring-offset-background focus:ring-2 focus:ring-ring">
                            <Badge variant={STATUS_MAP[client.status].variant} className="cursor-pointer hover:opacity-80 transition-opacity">
                              {STATUS_MAP[client.status].label}
                            </Badge>
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-[140px]">
                          <DropdownMenuItem onClick={() => handleStatusChange(client.id, "new")} className="cursor-pointer">
                            <UserPlus className="mr-2 h-4 w-4 text-muted-foreground" />
                            Новый
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleStatusChange(client.id, "in_progress")} className="cursor-pointer">
                            <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
                            В работе
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleStatusChange(client.id, "closed")} className="cursor-pointer">
                            <CheckCircle2 className="mr-2 h-4 w-4 text-muted-foreground" />
                            Закрыт
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm py-4">
                      {format(new Date(client.createdAt), "d MMMM yyyy, HH:mm", { locale: ru })}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm py-4">
                      {client.closedAt
                        ? format(new Date(client.closedAt), "d MMMM yyyy, HH:mm", { locale: ru })
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right py-4">
                      <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <EditClientModal client={client} />
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleDelete(client.id)}
                          title="Удалить дело"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </section>
      </div>
    </div>
  );
}

function SummaryCard({ title, value, loading, icon }: { title: string, value?: number, loading: boolean, icon: React.ReactNode }) {
  return (
    <Card className="hover:border-primary/20 transition-colors bg-card">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className="p-2 bg-muted/50 rounded-full">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-serif font-medium text-primary">
          {loading ? "..." : (value || 0)}
        </div>
      </CardContent>
    </Card>
  );
}

function AddClientModal() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  
  const queryClient = useQueryClient();
  const createClient = useCreateClient();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      toast.error("Пожалуйста, заполните все поля");
      return;
    }
    
    createClient.mutate({ data: { name, phone, status: "new" } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetClientsSummaryQueryKey() });
        toast.success("Клиент успешно добавлен");
        setOpen(false);
        setName("");
        setPhone("");
      },
      onError: () => {
        toast.error("Ошибка при добавлении клиента");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="rounded-full shadow-sm gap-2 pl-4 pr-5 h-11 transition-transform hover:scale-105">
          <Plus className="h-4 w-4" />
          Новое дело
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Добавление клиента</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
          <div className="space-y-2">
            <Label htmlFor="name">ФИО клиента</Label>
            <Input 
              id="name" 
              placeholder="Иванов Иван Иванович" 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              className="rounded-lg bg-muted/30 focus:bg-background transition-colors h-11"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Контактный телефон</Label>
            <Input 
              id="phone" 
              placeholder="+7 (999) 000-00-00" 
              value={phone} 
              onChange={(e) => setPhone(e.target.value)} 
              className="rounded-lg bg-muted/30 focus:bg-background transition-colors h-11"
            />
          </div>
          <div className="pt-2">
            <Button type="submit" className="w-full rounded-lg h-11" disabled={createClient.isPending}>
              {createClient.isPending ? "Добавление..." : "Сохранить"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditClientModal({ client }: { client: Client }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(client.name);
  const [phone, setPhone] = useState(client.phone);
  const [status, setStatus] = useState(client.status);
  const [createdAt, setCreatedAt] = useState(toDateTimeLocalValue(client.createdAt));
  const [closedAt, setClosedAt] = useState(toDateTimeLocalValue(client.closedAt));

  const queryClient = useQueryClient();
  const updateClient = useUpdateClient();

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setName(client.name);
      setPhone(client.phone);
      setStatus(client.status);
      setCreatedAt(toDateTimeLocalValue(client.createdAt));
      setClosedAt(toDateTimeLocalValue(client.closedAt));
    }
    setOpen(next);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || !createdAt) {
      toast.error("Пожалуйста, заполните все обязательные поля");
      return;
    }

    updateClient.mutate({
      id: client.id,
      data: {
        name,
        phone,
        status,
        createdAt: fromDateTimeLocalValue(createdAt) ?? undefined,
        closedAt: fromDateTimeLocalValue(closedAt),
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetClientsSummaryQueryKey() });
        toast.success("Дело обновлено");
        setOpen(false);
      },
      onError: () => {
        toast.error("Ошибка при сохранении изменений");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-primary hover:bg-primary/10"
          title="Редактировать дело"
        >
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Редактирование дела</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
          <div className="space-y-2">
            <Label htmlFor="edit-name">ФИО клиента</Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-lg bg-muted/30 focus:bg-background transition-colors h-11"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-phone">Контактный телефон</Label>
            <Input
              id="edit-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="rounded-lg bg-muted/30 focus:bg-background transition-colors h-11"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-status">Статус</Label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  id="edit-status"
                  type="button"
                  variant="outline"
                  className="w-full justify-start rounded-lg bg-muted/30 hover:bg-muted/50 h-11 font-normal"
                >
                  <Badge variant={STATUS_MAP[status].variant}>{STATUS_MAP[status].label}</Badge>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[--radix-dropdown-menu-trigger-width]">
                <DropdownMenuItem onClick={() => setStatus("new")} className="cursor-pointer">
                  <UserPlus className="mr-2 h-4 w-4 text-muted-foreground" />
                  Новый
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setStatus("in_progress")} className="cursor-pointer">
                  <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
                  В работе
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setStatus("closed")} className="cursor-pointer">
                  <CheckCircle2 className="mr-2 h-4 w-4 text-muted-foreground" />
                  Закрыт
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-created-at">Дата обращения</Label>
            <Input
              id="edit-created-at"
              type="datetime-local"
              step={60}
              value={createdAt}
              onChange={(e) => setCreatedAt(e.target.value)}
              className="rounded-lg bg-muted/30 focus:bg-background transition-colors h-11"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-closed-at">Дата закрытия обращения</Label>
            <Input
              id="edit-closed-at"
              type="datetime-local"
              step={60}
              value={closedAt}
              onChange={(e) => setClosedAt(e.target.value)}
              className="rounded-lg bg-muted/30 focus:bg-background transition-colors h-11"
            />
          </div>
          <div className="pt-2">
            <Button type="submit" className="w-full rounded-lg h-11" disabled={updateClient.isPending}>
              {updateClient.isPending ? "Сохранение..." : "Сохранить изменения"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
