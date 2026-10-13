"use client";

import { useState } from "react";
import { z } from "zod";

const createDepartmentSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Название подразделения обязательно.")
    .max(200, "Название должно быть не более 200 символов."),
  description: z
    .string()
    .trim()
    .max(1000, "Описание должно быть не более 1000 символов.")
    .optional(),
});

interface CreateDepartmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateDepartmentModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateDepartmentModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setFieldErrors({});

    try {
      const validatedData = createDepartmentSchema.parse({ name, description });

      const response = await fetch("/api/departments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(validatedData),
      });

      const result = await response.json();

      if (!response.ok) {
        if (response.status === 400 && result.error?.code === "VALIDATION_ERROR") {
          setFieldErrors(result.error.details || {});
        } else {
          setError(result.error?.message || "Не удалось создать подразделение.");
        }
        return;
      }

      onSuccess();
      onClose();
      setName("");
      setDescription("");
    } catch (err) {
      if (err instanceof z.ZodError) {
        setFieldErrors(err.flatten().fieldErrors as Record<string, string[]>);
      } else {
        setError("Произошла непредвиденная ошибка.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-surface dark:bg-zinc-900 w-full max-w-md rounded-2xl shadow-xl border border-border dark:border-zinc-800 overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-8">
          <h2 className="text-2xl font-semibold text-text-primary dark:text-zinc-50 mb-2 tracking-tight">
            Новое подразделение
          </h2>
          <p className="text-sm text-text-secondary dark:text-zinc-400 mb-8">
            Заполните данные для создания нового отдела или департамента.
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label
                htmlFor="name"
                className="block text-sm font-semibold text-text-secondary dark:text-zinc-300 mb-2"
              >
                Название
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={`w-full px-4 py-2.5 bg-white dark:bg-black border rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none transition-all dark:text-zinc-50 ${
                  fieldErrors.name ? "border-danger" : "border-border dark:border-zinc-700"
                }`}
                placeholder="Например, Отдел разработки"
                disabled={isSubmitting}
              />
              {fieldErrors.name && (
                <p className="mt-1.5 text-xs font-medium text-danger">{fieldErrors.name[0]}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="description"
                className="block text-sm font-semibold text-text-secondary dark:text-zinc-300 mb-2"
              >
                Описание
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className={`w-full px-4 py-2.5 bg-white dark:bg-black border rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none transition-all dark:text-zinc-50 resize-none ${
                  fieldErrors.description ? "border-danger" : "border-border dark:border-zinc-700"
                }`}
                placeholder="Краткое описание деятельности..."
                disabled={isSubmitting}
              />
              {fieldErrors.description && (
                <p className="mt-1.5 text-xs font-medium text-danger">{fieldErrors.description[0]}</p>
              )}
            </div>

            {error && (
              <div className="p-4 bg-danger/5 border border-danger/10 rounded-xl">
                <p className="text-xs font-medium text-danger">{error}</p>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-surface-subtle rounded-xl transition-all"
                disabled={isSubmitting}
              >
                Отмена
              </button>
              <button
                type="submit"
                className="px-6 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary-hover rounded-xl transition-all shadow-sm active:transform active:scale-[0.98] disabled:opacity-50"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Создание..." : "Создать"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
