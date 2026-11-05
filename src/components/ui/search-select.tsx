"use client";

import { ChevronDown, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export type SearchOption = {
  value: string;
  label: string;
  /** Texto chico a la derecha (ej. la unidad o el tipo). También se busca en él. */
  hint?: string;
};

/** "Cajá  China" → "caja china": sin tildes, sin mayúsculas y sin espacios repetidos. */
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Todas las palabras escritas tienen que aparecer (en cualquier orden): "sopa caja" encuentra "CAJA CHINA Y SOPA". */
export function matchesSearch(option: SearchOption, query: string): boolean {
  const words = normalize(query).split(" ").filter(Boolean);
  if (words.length === 0) return true;
  const text = normalize(`${option.label} ${option.hint ?? ""}`);
  return words.every((w) => text.includes(w));
}

const MAX_SHOWN = 80;

/**
 * Selector con buscador: se escribe para filtrar una lista larga (ítems, ingredientes...) en vez de scrollear.
 * Flechas para moverse, Enter para elegir, Esc para cerrar. Con `name` manda el valor en el formulario (input oculto)
 * y se limpia solo cuando el formulario se resetea. Controlado (`value` + `onChange`) o no (`defaultValue`).
 */
export function SearchSelect({
  options,
  value,
  defaultValue = "",
  onChange,
  name,
  id,
  placeholder = "Escribe para buscar…",
  className,
  disabled,
  "aria-label": ariaLabel,
}: {
  options: SearchOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  name?: string;
  id?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  const [inner, setInner] = useState(defaultValue);
  const current = value ?? inner;
  const selected = options.find((o) => o.value === current) ?? null;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const filtered = useMemo(() => options.filter((o) => matchesSearch(o, query)), [options, query]);
  const shown = filtered.slice(0, MAX_SHOWN);

  function choose(next: string) {
    if (value === undefined) setInner(next);
    onChange?.(next);
    setQuery("");
    setOpen(false);
  }

  // Cerrar al tocar fuera.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  // Formulario reseteado (ej. después de guardar): vuelve al valor inicial.
  useEffect(() => {
    const form = rootRef.current?.closest("form");
    if (!form || value !== undefined) return;
    const onReset = () => setInner(defaultValue);
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, [defaultValue, value]);

  // La opción resaltada siempre a la vista.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      setActive((a) => Math.min(a + 1, shown.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      // Enter elige (y no envía el formulario) mientras la lista está abierta.
      if (open && shown[active]) {
        e.preventDefault();
        choose(shown[active].value);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      {name && <input type="hidden" name={name} value={current} />}
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          disabled={disabled}
          placeholder={selected ? selected.label : placeholder}
          value={open ? query : (selected?.label ?? "")}
          onFocus={() => {
            setOpen(true);
            setActive(0);
          }}
          onClick={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          className={cn(
            "h-11 w-full rounded-md border border-input bg-background pr-16 pl-3 text-base",
            "placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            open && selected && "placeholder:text-foreground/60",
            disabled && "cursor-not-allowed opacity-50",
          )}
        />
        <div className="absolute inset-y-0 right-2 flex items-center gap-1 text-muted-foreground">
          {selected && !disabled && (
            <button
              type="button"
              aria-label="Quitar selección"
              className="rounded p-1 hover:bg-accent"
              onClick={() => {
                choose("");
                inputRef.current?.focus();
              }}
            >
              <X className="size-4" />
            </button>
          )}
          <ChevronDown className="size-4" />
        </div>
      </div>
      {open && !disabled && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-72 w-full min-w-64 overflow-y-auto rounded-md border bg-card p-1 text-card-foreground shadow-lg"
        >
          {shown.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">Sin resultados para “{query}”</li>}
          {shown.map((o, i) => (
            <li
              key={o.value}
              data-index={i}
              role="option"
              aria-selected={o.value === current}
              // pointerdown + preventDefault: elige antes de que el input pierda el foco.
              onPointerDown={(e) => {
                e.preventDefault();
                choose(o.value);
              }}
              onPointerEnter={() => setActive(i)}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-3 rounded px-3 py-2 text-base",
                i === active && "bg-accent text-accent-foreground",
                o.value === current && "font-semibold",
              )}
            >
              <span className="min-w-0 truncate">{o.label}</span>
              {o.hint && <span className="shrink-0 text-xs text-muted-foreground">{o.hint}</span>}
            </li>
          ))}
          {filtered.length > MAX_SHOWN && (
            <li className="px-3 py-2 text-xs text-muted-foreground">
              {filtered.length - MAX_SHOWN} más: escribe más letras para encontrarlos.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
