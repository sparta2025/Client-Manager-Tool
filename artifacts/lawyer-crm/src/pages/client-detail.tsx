import React, { useState } from "react";
import { useLocation, useParams, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { 
  ArrowLeft, Plus, Pencil, Trash2, CheckCircle2, Clock, FileText, Target, AlertTriangle, ListTodo
} from "lucide-react";
import { toast } from "sonner";

import { 
  useListClients, 
  useGetClientStats,
  useListClientStages,
  useCreateClientStage,
  useUpdateStage,
  useDeleteStage,
  getListClientStagesQueryKey,
  getGetClientStatsQueryKey,
  CaseStage
} from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

const STATUS_MAP = {
  new: { label: "Новый", variant: "new" as const },
  in_progress: { label: "В работе", variant: "in_progress" as const },
  closed: { label: "Закрыт", variant: "closed" as const },
};

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

export default function ClientDetailPage() {
  const params = useParams();
  const clientId = Number(params.id);
  const [, setLocation] = useLocation();

  const { data: clients, isLoading: isClientsLoading } = useListClients();
  const client = clients?.find(c => c.id === clientId);

  const { data: stats } = useGetClientStats(clientId);
  const { data: stages, isLoading: isStagesLoading } = useListClientStages(clientId);
  
  const queryClient = useQueryClient();
  const deleteStage = useDeleteStage();

  if (isClientsLoading) {
    return <div className="min-h-screen bg-background p-6 md:p-12 flex items-center justify-center font-sans text-muted-foreground">Загрузка данных...</div>;
  }

  if (!client) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center font-sans text-foreground">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-serif text-primary">Клиент не найден</h1>
          <Button variant="outline" onClick={() => setLocation("/")}>Вернуться на главную</Button>
        </div>
      </div>
    );
  }

  const handleDeleteStage = (id: number) => {
    if (!confirm("Вы уверены, что хотите удалить этот этап?")) return;
    deleteStage.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListClientStagesQueryKey(clientId) });
        queryClient.invalidateQueries({ queryKey: getGetClientStatsQueryKey(clientId) });
        toast.success("Этап удален");
      },
      onError: () => toast.error("Не удалось удалить этап")
    });
  };

  return (
    <div className="min-h-screen bg-background p-6 md:p-12 font-sans text-foreground">
      <div className="max-w-5xl mx-auto space-y-10">
        
        {/* Header Section */}
        <div className="space-y-6">
          <Button variant="ghost" asChild className="mb-2 -ml-4 text-muted-foreground hover:text-primary">
            <Link href="/">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Назад
            </Link>
          </Button>

          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 animate-in fade-in slide-in-from-top-4 duration-700">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl md:text-4xl font-serif font-medium text-primary tracking-tight">
                  {client.name}
                </h1>
                <Badge variant={STATUS_MAP[client.status].variant} className="text-sm">
                  {STATUS_MAP[client.status].label}
                </Badge>
              </div>
              <p className="text-muted-foreground text-sm md:text-base">
                Телефон: {client.phone}
              </p>
              <p className="text-muted-foreground text-sm">
                Обращение: {format(new Date(client.createdAt), "d MMMM yyyy", { locale: ru })}
                {client.closedAt && ` • Закрыто: ${format(new Date(client.closedAt), "d MMMM yyyy", { locale: ru })}`}
              </p>
            </div>
            
            <StageModal clientId={clientId} clientName={client.name} mode="create" />
          </div>
        </div>

        {/* Stats Section */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-in fade-in zoom-in-95 duration-700 delay-100 fill-mode-both">
          <SummaryCard 
            title="Всего этапов" 
            value={stats?.totalStages} 
            loading={!stats} 
            icon={<ListTodo className="h-4 w-4 text-muted-foreground" />} 
          />
          <SummaryCard 
            title="В работе" 
            value={stats?.activeStages} 
            loading={!stats} 
            icon={<Clock className="h-4 w-4 text-[#0369a1]" />} 
          />
          <SummaryCard 
            title="Завершено" 
            value={stats?.completedStages} 
            loading={!stats} 
            icon={<CheckCircle2 className="h-4 w-4 text-[#15803d]" />} 
          />
        </section>

        {stats?.lastNextPlans && (
          <Card className="bg-primary/5 border-primary/10 shadow-none animate-in fade-in zoom-in-95 duration-700 delay-150 fill-mode-both">
            <CardContent className="p-4 flex gap-3">
              <Target className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-medium text-primary mb-1">Актуальные цели и планы</h3>
                <p className="text-sm text-primary/80 whitespace-pre-wrap">{stats.lastNextPlans}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stages Journal */}
        <section className="space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200 fill-mode-both">
          <h2 className="text-2xl font-serif font-medium text-primary border-b border-border pb-4">
            Журнал этапов
          </h2>

          {isStagesLoading ? (
            <div className="text-center py-10 text-muted-foreground">Загрузка этапов...</div>
          ) : stages?.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground bg-card border rounded-2xl">
              У этого клиента пока нет ни одного этапа работы. Добавьте первый этап, чтобы начать.
            </div>
          ) : (
            <div className="space-y-4">
              {stages?.map(stage => (
                <Card 
                  key={stage.id} 
                  className={`overflow-hidden relative transition-colors bg-card hover:border-primary/20 ${stage.isCompleted ? 'border-l-4 border-l-[#15803d]' : 'border-l-4 border-l-[#0369a1]'}`}
                >
                  <CardHeader className="pb-3 border-b border-border/50 bg-muted/20">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="text-[11px] text-muted-foreground mb-1 uppercase tracking-wider font-medium">
                          Клиент: {client.name}
                        </div>
                        <CardTitle className="text-xl font-serif text-primary">
                          {stage.name}
                        </CardTitle>
                        <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                          <Clock className="w-3.5 h-3.5" />
                          {format(new Date(stage.stageDate), "d MMMM yyyy, HH:mm", { locale: ru })}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-3">
                        <Badge variant={stage.isCompleted ? "closed" : "in_progress"} className="shadow-sm">
                          {stage.isCompleted ? "Завершён" : "В работе"}
                        </Badge>
                        <div className="flex items-center gap-1">
                          <StageModal clientId={clientId} clientName={client.name} mode="edit" stage={stage} />
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleDeleteStage(stage.id)}
                            title="Удалить этап"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border/50">
                      
                      {/* Left Column: Content & Result */}
                      <div className="p-5 space-y-5">
                        {stage.content && (
                          <div>
                            <div className="flex items-center gap-1.5 text-sm font-medium text-primary mb-1.5">
                              <FileText className="w-4 h-4 text-muted-foreground" />
                              Содержание работы
                            </div>
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{stage.content}</p>
                          </div>
                        )}
                        {stage.result && (
                          <div>
                            <div className="flex items-center gap-1.5 text-sm font-medium text-primary mb-1.5">
                              <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
                              Конечный результат
                            </div>
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{stage.result}</p>
                          </div>
                        )}
                        {!stage.content && !stage.result && (
                          <div className="text-sm text-muted-foreground italic opacity-70">
                            Нет детального описания или результата.
                          </div>
                        )}
                      </div>

                      {/* Right Column: Plans & Failures */}
                      <div className="p-5 space-y-5 bg-muted/5 flex flex-col">
                        {stage.nextPlans && (
                          <div className="mb-4">
                            <div className="flex items-center gap-1.5 text-sm font-medium text-primary mb-1.5">
                              <Target className="w-4 h-4 text-[#0369a1]" />
                              Следующие цели
                            </div>
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{stage.nextPlans}</p>
                          </div>
                        )}
                        {!stage.isCompleted && stage.failureReasons && (
                          <div className="mb-4">
                            <div className="flex items-center gap-1.5 text-sm font-medium text-destructive mb-1.5">
                              <AlertTriangle className="w-4 h-4" />
                              Причины неудачи / трудности
                            </div>
                            <p className="text-sm text-destructive/90 whitespace-pre-wrap">{stage.failureReasons}</p>
                          </div>
                        )}
                        {stage.closedAt && (
                          <div className="text-xs text-muted-foreground/80 mt-auto pt-4 flex items-center gap-1 border-t border-border/50">
                            <Clock className="w-3 h-3" />
                            Закрыт: {format(new Date(stage.closedAt), "d MMMM yyyy, HH:mm", { locale: ru })}
                          </div>
                        )}
                        {!stage.nextPlans && (!stage.failureReasons || stage.isCompleted) && !stage.closedAt && (
                           <div className="text-sm text-muted-foreground italic opacity-70">
                             Нет дополнительных планов.
                           </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
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

function StageModal({ 
  clientId, 
  clientName,
  mode, 
  stage 
}: { 
  clientId: number, 
  clientName: string,
  mode: "create" | "edit", 
  stage?: CaseStage 
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(stage?.name || "");
  const [stageDate, setStageDate] = useState(toDateTimeLocalValue(stage?.stageDate) || toDateTimeLocalValue(new Date().toISOString()));
  const [content, setContent] = useState(stage?.content || "");
  const [result, setResult] = useState(stage?.result || "");
  const [isCompleted, setIsCompleted] = useState(stage?.isCompleted || false);
  const [failureReasons, setFailureReasons] = useState(stage?.failureReasons || "");
  const [nextPlans, setNextPlans] = useState(stage?.nextPlans || "");
  const [closedAt, setClosedAt] = useState(toDateTimeLocalValue(stage?.closedAt) || "");

  const queryClient = useQueryClient();
  const createStage = useCreateClientStage();
  const updateStage = useUpdateStage();

  const handleOpenChange = (next: boolean) => {
    if (next && mode === "edit" && stage) {
      setName(stage.name);
      setStageDate(toDateTimeLocalValue(stage.stageDate));
      setContent(stage.content || "");
      setResult(stage.result || "");
      setIsCompleted(stage.isCompleted);
      setFailureReasons(stage.failureReasons || "");
      setNextPlans(stage.nextPlans || "");
      setClosedAt(toDateTimeLocalValue(stage.closedAt) || "");
    } else if (next && mode === "create") {
      setName("");
      setStageDate(toDateTimeLocalValue(new Date().toISOString()));
      setContent("");
      setResult("");
      setIsCompleted(false);
      setFailureReasons("");
      setNextPlans("");
      setClosedAt("");
    }
    setOpen(next);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !stageDate) {
      toast.error("Пожалуйста, заполните обязательные поля (Наименование и Дата)");
      return;
    }

    const payload = {
      name,
      stageDate: fromDateTimeLocalValue(stageDate)!,
      content: content.trim() || null,
      result: result.trim() || null,
      isCompleted,
      failureReasons: failureReasons.trim() || null,
      nextPlans: nextPlans.trim() || null,
      closedAt: closedAt ? fromDateTimeLocalValue(closedAt) : null,
    };

    if (mode === "create") {
      createStage.mutate({ clientId, data: payload }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListClientStagesQueryKey(clientId) });
          queryClient.invalidateQueries({ queryKey: getGetClientStatsQueryKey(clientId) });
          toast.success("Этап успешно добавлен");
          setOpen(false);
        },
        onError: () => toast.error("Ошибка при добавлении этапа")
      });
    } else if (mode === "edit" && stage) {
      updateStage.mutate({ id: stage.id, data: payload }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListClientStagesQueryKey(clientId) });
          queryClient.invalidateQueries({ queryKey: getGetClientStatsQueryKey(clientId) });
          toast.success("Этап успешно обновлен");
          setOpen(false);
        },
        onError: () => toast.error("Ошибка при обновлении этапа")
      });
    }
  };

  const isPending = createStage.isPending || updateStage.isPending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {mode === "create" ? (
          <Button className="rounded-full shadow-sm gap-2 pl-4 pr-5 h-11 transition-transform hover:scale-105">
            <Plus className="h-4 w-4" />
            Добавить этап
          </Button>
        ) : (
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10">
            <Pencil className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium mb-1">
            Клиент: {clientName}
          </div>
          <DialogTitle className="text-xl font-serif">
            {mode === "create" ? "Новый этап дела" : "Редактирование этапа"}
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-5 mt-2">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="stage-name" className="text-primary font-medium">Наименование этапа *</Label>
              <Input
                id="stage-name"
                placeholder="Например: Первичное заседание суда, Сбор документов..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-muted/30 focus:bg-background h-11"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="stage-date" className="text-primary font-medium">Дата этапа *</Label>
              <Input
                id="stage-date"
                type="datetime-local"
                step={60}
                value={stageDate}
                onChange={(e) => setStageDate(e.target.value)}
                className="bg-muted/30 focus:bg-background h-11"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="stage-closed" className="text-primary font-medium">Дата закрытия этапа</Label>
              <Input
                id="stage-closed"
                type="datetime-local"
                step={60}
                value={closedAt}
                onChange={(e) => setClosedAt(e.target.value)}
                className="bg-muted/30 focus:bg-background h-11"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="stage-content" className="text-primary font-medium">Содержание (ход работы)</Label>
            <Textarea
              id="stage-content"
              placeholder="Опишите, что было сделано..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="bg-muted/30 focus:bg-background min-h-[100px]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="stage-result" className="text-primary font-medium">Конечный результат</Label>
            <Textarea
              id="stage-result"
              placeholder="Каков итог этапа..."
              value={result}
              onChange={(e) => setResult(e.target.value)}
              className="bg-muted/30 focus:bg-background min-h-[80px]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="stage-plans" className="text-primary font-medium">Следующие цели и планы</Label>
            <Textarea
              id="stage-plans"
              placeholder="Что планируется дальше..."
              value={nextPlans}
              onChange={(e) => setNextPlans(e.target.value)}
              className="bg-muted/30 focus:bg-background min-h-[80px]"
            />
          </div>

          <div className="flex items-center gap-3 p-4 border rounded-lg bg-muted/10">
            <Switch
              id="stage-completed"
              checked={isCompleted}
              onCheckedChange={setIsCompleted}
            />
            <div className="space-y-0.5">
              <Label htmlFor="stage-completed" className="text-base cursor-pointer">Этап завершён</Label>
              <p className="text-sm text-muted-foreground">Отметьте, если работы по этому этапу окончены.</p>
            </div>
          </div>

          {!isCompleted && (
            <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
              <Label htmlFor="stage-failures" className="text-destructive font-medium">Причины неудачи (если применимо)</Label>
              <Textarea
                id="stage-failures"
                placeholder="Опишите проблемы или причины задержки..."
                value={failureReasons}
                onChange={(e) => setFailureReasons(e.target.value)}
                className="bg-destructive/5 border-destructive/20 focus-visible:ring-destructive min-h-[80px]"
              />
            </div>
          )}

          <div className="pt-4 border-t border-border">
            <Button type="submit" className="w-full rounded-lg h-11" disabled={isPending}>
              {isPending ? "Сохранение..." : (mode === "create" ? "Добавить этап" : "Сохранить изменения")}
            </Button>
          </div>

        </form>
      </DialogContent>
    </Dialog>
  );
}
