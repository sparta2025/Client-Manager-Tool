import { useEffect, useState } from "react";
import { Loader2, Settings2 } from "lucide-react";
import { toast } from "sonner";

import { AiModel, getListAiModelsQueryKey, useListAiModels } from "@workspace/api-client-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_AI_MODEL,
  getSelectedAiModel,
  saveSelectedAiModel,
} from "@/lib/ai-model-storage";

function modelLabel(model: AiModel): string {
  if (model.id === DEFAULT_AI_MODEL) return "Автовыбор бесплатной модели";
  return model.name;
}

export function AiModelSettings() {
  const [open, setOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState(getSelectedAiModel);
  const modelsQuery = useListAiModels({
    query: {
      queryKey: getListAiModelsQueryKey(),
      staleTime: 5 * 60 * 1000,
    },
  });

  useEffect(() => {
    if (!modelsQuery.data?.length) return;
    if (!modelsQuery.data.some((model) => model.id === selectedModel)) {
      setSelectedModel(DEFAULT_AI_MODEL);
      saveSelectedAiModel(DEFAULT_AI_MODEL);
    }
  }, [modelsQuery.data, selectedModel]);

  const handleModelChange = (model: string) => {
    setSelectedModel(model);
    saveSelectedAiModel(model);
    toast.success("Модель AI выбрана");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="h-11 w-11 rounded-full border-primary/20"
          title="Настроить AI-модель"
          aria-label="Настроить AI-модель"
        >
          <Settings2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Настройка AI-модели</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          <p className="text-sm leading-6 text-muted-foreground">
            Выберите бесплатную модель OpenRouter для планирования этапов и AI-секретаря.
            Выбор сохраняется в этом браузере.
          </p>

          {modelsQuery.isLoading ? (
            <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Загрузка доступных моделей…
            </div>
          ) : modelsQuery.isError ? (
            <div className="space-y-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm">
              <p className="text-destructive">
                Не удалось получить список моделей. Проверьте OPENROUTER_API_KEY и повторите попытку.
              </p>
              <Button variant="outline" size="sm" onClick={() => modelsQuery.refetch()}>
                Повторить
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <label htmlFor="ai-model-select" className="text-sm font-medium text-foreground">
                Модель для AI-агентов
              </label>
              <Select value={selectedModel} onValueChange={handleModelChange}>
                <SelectTrigger id="ai-model-select" className="h-11">
                  <SelectValue placeholder="Выберите модель" />
                </SelectTrigger>
                <SelectContent>
                  {(modelsQuery.data ?? []).map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      <span className="flex items-center gap-2">
                        <span className="truncate">{modelLabel(model)}</span>
                        <Badge variant="outline" className="ml-1 shrink-0 text-[10px]">
                          {model.isFree ? "free" : "настроенная"}
                        </Badge>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Текущий выбор: <code className="rounded bg-muted px-1.5 py-0.5">{selectedModel}</code>
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}