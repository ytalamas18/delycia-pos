"use client";

import { Download, Plus, Upload, X } from "lucide-react";
import { useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { bulkCreateItemsAction, readImportFileAction } from "../actions";
import { BULK_COLUMNS, emptyBulkRow, type BulkRow } from "../domain/bulk";
import { ITEM_TYPE_LABEL, ITEM_TYPES } from "../domain/item-types";
import { BASE_UNITS, UNIT_LABEL } from "../domain/unit-labels";

const selectClass = "h-10 w-full rounded-md border border-input bg-background px-2 text-sm";

/** Tabla editable para cargar muchos ítems de una vez (a mano o desde Excel/CSV). */
export function BulkItemsEditor({ categories }: { categories: string[] }) {
  const [rows, setRows] = useState<BulkRow[]>(() => Array.from({ length: 5 }, emptyBulkRow));
  const [errors, setErrors] = useState<Map<number, string>>(new Map());
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (i: number, key: keyof BulkRow, value: string) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [key]: value } : r)));

  function importFile(file: File) {
    const fd = new FormData();
    fd.set("file", file);
    start(async () => {
      const r = await readImportFileAction(fd);
      if (!r.ok) return setMessage({ ok: false, text: r.error });
      setRows(r.rows.length > 0 ? r.rows : [emptyBulkRow()]);
      setErrors(new Map());
      setMessage({ ok: true, text: `Se leyeron ${r.rows.length} filas. Revísalas y toca "Guardar todo".` });
    });
  }

  function save() {
    start(async () => {
      const r = await bulkCreateItemsAction(rows);
      setErrors(new Map(r.errors.map((e) => [e.row - 1, e.message])));
      setMessage({ ok: r.ok, text: r.message ?? "" });
      if (r.ok) setRows(Array.from({ length: 5 }, emptyBulkRow));
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline">
          <a href="/api/plantilla-items" download>
            <Download /> Descargar plantilla
          </a>
        </Button>
        <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={pending}>
          <Upload /> Importar Excel / CSV
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importFile(f);
            e.target.value = "";
          }}
        />
      </div>
      <datalist id="bulk-categories">
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[72rem] text-sm">
          <thead className="bg-muted/50 text-left text-muted-foreground">
            <tr>
              <th className="w-8 p-2">#</th>
              {BULK_COLUMNS.map((c) => (
                <th key={c.key} className="p-2 font-medium" title={c.hint}>
                  {c.header}
                </th>
              ))}
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r, i) => (
              <tr key={i} className={cn(errors.has(i) && "bg-red-50 dark:bg-red-950/40")}>
                <td className="p-1 text-center text-muted-foreground">{i + 1}</td>
                <td className="p-1">
                  <Input aria-label={`Nombre fila ${i + 1}`} value={r.name} onChange={(e) => set(i, "name", e.target.value)} className="h-10 min-w-44" />
                  {errors.has(i) && <p className="pt-1 text-xs text-red-700 dark:text-red-400">{errors.get(i)}</p>}
                </td>
                <td className="p-1">
                  <select aria-label={`Tipo fila ${i + 1}`} value={r.type} onChange={(e) => set(i, "type", e.target.value)} className={selectClass}>
                    {ITEM_TYPES.map((t) => (
                      <option key={t} value={ITEM_TYPE_LABEL[t]}>
                        {ITEM_TYPE_LABEL[t]}
                      </option>
                    ))}
                    {!ITEM_TYPES.some((t) => ITEM_TYPE_LABEL[t] === r.type) && <option value={r.type}>{r.type}</option>}
                  </select>
                </td>
                <td className="p-1">
                  <Input list="bulk-categories" value={r.category} onChange={(e) => set(i, "category", e.target.value)} className="h-10 min-w-32" aria-label={`Categoría fila ${i + 1}`} />
                </td>
                <td className="p-1">
                  <select aria-label={`Unidad fila ${i + 1}`} value={r.unit} onChange={(e) => set(i, "unit", e.target.value)} className={selectClass}>
                    {BASE_UNITS.map((u) => (
                      <option key={u} value={UNIT_LABEL[u]}>
                        {UNIT_LABEL[u]}
                      </option>
                    ))}
                    {!BASE_UNITS.some((u) => UNIT_LABEL[u] === r.unit) && <option value={r.unit}>{r.unit}</option>}
                  </select>
                </td>
                <td className="p-1">
                  <select aria-label={`Suma stock fila ${i + 1}`} value={r.tracksStock} onChange={(e) => set(i, "tracksStock", e.target.value)} className={selectClass}>
                    <option value="sí">sí</option>
                    <option value="no">no</option>
                    {!["sí", "no"].includes(r.tracksStock) && <option value={r.tracksStock}>{r.tracksStock}</option>}
                  </select>
                </td>
                {(["minStock", "lastCost", "price", "initialStock"] as const).map((k) => (
                  <td key={k} className="p-1">
                    <Input inputMode="decimal" value={r[k]} onChange={(e) => set(i, k, e.target.value)} className="h-10 w-28" aria-label={`${k} fila ${i + 1}`} />
                  </td>
                ))}
                <td className="p-1">
                  <Button variant="ghost" size="sm" className="size-8 p-0" aria-label={`Quitar fila ${i + 1}`} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
                    <X className="size-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={() => setRows((rs) => [...rs, emptyBulkRow()])}>
          <Plus /> Agregar fila
        </Button>
        <Button onClick={save} disabled={pending}>
          {pending ? "Guardando…" : "Guardar todo"}
        </Button>
        {message && (
          <p role={message.ok ? "status" : "alert"} className={cn("text-sm font-medium", message.ok ? "text-green-700 dark:text-green-400" : "text-destructive")}>
            {message.text}
          </p>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Las filas sin nombre se ignoran. Si alguna fila tiene un error no se guarda nada. El inventario inicial queda
        en el kárdex como &quot;Inventario inicial&quot;. Los decimales pueden ir con coma.
      </p>
    </div>
  );
}
