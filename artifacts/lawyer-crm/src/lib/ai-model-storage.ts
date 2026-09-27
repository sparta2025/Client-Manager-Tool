export const DEFAULT_AI_MODEL = "openrouter/free";
const AI_MODEL_STORAGE_KEY = "lawyer-crm.ai-model";

export function getSelectedAiModel(): string {
  if (typeof window === "undefined") return DEFAULT_AI_MODEL;

  try {
    return window.localStorage.getItem(AI_MODEL_STORAGE_KEY) || DEFAULT_AI_MODEL;
  } catch {
    return DEFAULT_AI_MODEL;
  }
}

export function saveSelectedAiModel(model: string): void {
  try {
    window.localStorage.setItem(AI_MODEL_STORAGE_KEY, model);
  } catch {
    // The selected model still applies for the current session.
  }
}