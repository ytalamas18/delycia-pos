"use client";

import { Lock } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormStatus } from "@/components/ui/form-status";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/core/actions/types";
import { formatMoney } from "@/core/money";
import type { SalesChannel, ServiceType } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

import { createOrderAction, removeItemAction, saveOrderChangesAction, updateItemAction } from "../actions";
import { addDraftLine, type DraftLine } from "../domain/lines";
import { unitPriceFor } from "../domain/pricing";
import { LineEditor, type LineEditorValue } from "./line-editor";
import type { PosCategory, PosOrder, PosProduct, PosSavedItem } from "./pos-types";
import { ProductGrid } from "./product-grid";

type Header = { channel: SalesChannel; serviceType: ServiceType; tableNumber: string; customerName: string };
type Editing = { kind: "draft"; index: number } | { kind: "saved"; item: PosSavedItem } | null;

const emptyHeader: Header = { channel: "LOCAL", serviceType: "DINE_IN", tableNumber: "", customerName: "" };

export function PosScreen({
  categories,
  products,
  peyaMarkupPercent,
  order,
}: {
  categories: PosCategory[];
  products: PosProduct[];
  peyaMarkupPercent: number;
  order: PosOrder | null;
}) {
  const router = useRouter();
  const [header, setHeader] = useState<Header>(
    order
      ? {
          channel: order.channel,
          serviceType: order.serviceType,
          tableNumber: order.tableNumber ?? "",
          customerName: order.customerName ?? "",
        }
      : emptyHeader,
  );
  const [drafts, setDrafts] = useState<DraftLine[]>([]);
  const [editing, setEditing] = useState<Editing>(null);
  const [status, setStatus] = useState<(ActionResult & { orderId?: string }) | null>(null);
  const [pending, startTransition] = useTransition();

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  // Una orden ya guardada conserva el % con que se abrió.
  const markupPercent = order ? order.markupPercent : header.channel === "PEYA" ? peyaMarkupPercent : 0;

  const draftPrice = (line: DraftLine) => {
    const product = productById.get(line.productId);
    if (!product) return 0;
    const modifiers = product.modifiers.filter((m) => line.modifierIds.includes(m.id));
    return unitPriceFor({ listPriceCents: product.priceCents, modifiers, channel: header.channel, markupPercent });
  };

  const savedTotal = (order?.items ?? []).reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0);
  const draftTotal = drafts.reduce((sum, l) => sum + draftPrice(l) * l.quantity, 0);
  const total = savedTotal + draftTotal;

  function setServiceType(serviceType: ServiceType) {
    // Las líneas nuevas que seguían el tipo de la orden cambian con ella.
    setDrafts((ds) => ds.map((d) => (d.serviceType === header.serviceType ? { ...d, serviceType } : d)));
    setHeader((h) => ({ ...h, serviceType }));
  }

  function setChannel(channel: SalesChannel) {
    setHeader((h) => ({ ...h, channel }));
    // PEYA siempre es para llevar.
    if (channel === "PEYA") setServiceType("TAKEAWAY");
  }

  function addProduct(product: PosProduct) {
    setStatus(null);
    setDrafts((ds) =>
      addDraftLine(ds, { productId: product.id, quantity: 1, modifierIds: [], note: "", serviceType: header.serviceType }),
    );
  }

  function resetToNewOrder() {
    setDrafts([]);
    setHeader(emptyHeader);
    if (order) router.push("/pos");
  }

  const info = {
    serviceType: header.serviceType,
    tableNumber: header.tableNumber,
    customerName: header.customerName,
  };
  const canSave = order ? true : drafts.length > 0;

  function save() {
    startTransition(async () => {
      if (order) {
        const result = await saveOrderChangesAction(order.id, info, drafts);
        setStatus(result);
        if (result.ok) setDrafts([]);
        return;
      }
      const result = await createOrderAction({ channel: header.channel, ...info }, drafts);
      setStatus(result);
      if (result.ok) {
        setDrafts([]);
        setHeader(emptyHeader);
      }
    });
  }

  function runItemAction(action: () => Promise<ActionResult>) {
    setEditing(null);
    startTransition(async () => {
      const result = await action();
      setStatus(result.ok ? null : result);
    });
  }

  const showTakeawayBadge = (type: ServiceType) => type === "TAKEAWAY" && header.serviceType === "DINE_IN";

  return (
    <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1fr_420px]">
      <ProductGrid
        categories={categories}
        products={products}
        channel={header.channel}
        markupPercent={markupPercent}
        onAdd={addProduct}
      />

      <aside className="flex flex-col gap-3 rounded-xl border bg-card p-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-6rem)]">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xl font-bold">{order ? `Orden #${order.number}` : "Nueva orden"}</h2>
          {order && <Badge variant="secondary">Por pagar</Badge>}
        </div>

        <Toggle
          label="Canal"
          value={header.channel}
          options={[
            { value: "LOCAL", label: "Local" },
            { value: "PEYA", label: "PEYA" },
          ]}
          onChange={(v) => setChannel(v as SalesChannel)}
          disabled={!!order}
        />
        <Toggle
          label="Tipo"
          value={header.serviceType}
          options={[
            { value: "DINE_IN", label: "Comer aquí" },
            { value: "TAKEAWAY", label: "Para llevar" },
          ]}
          onChange={(v) => setServiceType(v as ServiceType)}
        />
        <div className="grid grid-cols-[90px_1fr] gap-2">
          <div className="space-y-1">
            <Label htmlFor="mesa">Mesa</Label>
            <Input
              id="mesa"
              inputMode="numeric"
              value={header.tableNumber}
              disabled={header.serviceType !== "DINE_IN"}
              onChange={(e) => setHeader((h) => ({ ...h, tableNumber: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cliente">Cliente</Label>
            <Input
              id="cliente"
              placeholder="Nombre (opcional)"
              value={header.customerName}
              onChange={(e) => setHeader((h) => ({ ...h, customerName: e.target.value }))}
            />
          </div>
        </div>

        <ul className="-mx-1 min-h-24 flex-1 divide-y overflow-y-auto px-1">
          {order?.items.map((item) => (
            <LineRow
              key={item.id}
              quantity={item.quantity}
              name={item.productName}
              details={[...item.modifiers, item.note].filter(Boolean).join(" · ")}
              takeaway={showTakeawayBadge(item.serviceType)}
              totalCents={item.unitPriceCents * item.quantity}
              locked={item.sentToKitchen}
              onClick={() => !item.sentToKitchen && setEditing({ kind: "saved", item })}
            />
          ))}
          {drafts.map((line, index) => {
            const product = productById.get(line.productId);
            const modifierNames = product?.modifiers.filter((m) => line.modifierIds.includes(m.id)).map((m) => m.name) ?? [];
            return (
              <LineRow
                key={`draft-${index}`}
                quantity={line.quantity}
                name={product?.name ?? "Producto no disponible"}
                details={[...modifierNames, line.note].filter(Boolean).join(" · ")}
                takeaway={showTakeawayBadge(line.serviceType)}
                totalCents={draftPrice(line) * line.quantity}
                isNew={!!order}
                onClick={() => setEditing({ kind: "draft", index })}
              />
            );
          })}
          {!order?.items.length && drafts.length === 0 && (
            <li className="py-10 text-center text-muted-foreground">Toca un producto para agregarlo.</li>
          )}
        </ul>

        <div className="space-y-3 border-t pt-3">
          <div className="flex items-baseline justify-between">
            <span className="text-lg font-medium">Total</span>
            <span className="text-3xl font-bold tabular-nums">{formatMoney(total)}</span>
          </div>
          {status && (
            <div className="flex flex-wrap items-center gap-2">
              <FormStatus state={status} />
              {status.ok && status.orderId && (
                <Link href={`/pos?orden=${status.orderId}`} className="text-sm underline">
                  Abrir orden
                </Link>
              )}
            </div>
          )}
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <Button variant="outline" size="lg" onClick={resetToNewOrder} disabled={pending}>
              Nueva
            </Button>
            <Button size="lg" onClick={save} disabled={pending || !canSave}>
              {pending ? "Guardando…" : order ? "Guardar cambios" : "Guardar orden"}
            </Button>
          </div>
        </div>
      </aside>

      {editing?.kind === "draft" && (
        <LineEditor
          title={productById.get(drafts[editing.index].productId)?.name ?? ""}
          initial={drafts[editing.index]}
          modifiers={productById.get(drafts[editing.index].productId)?.modifiers ?? []}
          onClose={() => setEditing(null)}
          onRemove={() => {
            setDrafts((ds) => ds.filter((_, i) => i !== editing.index));
            setEditing(null);
          }}
          onSave={(value: LineEditorValue) => {
            setDrafts((ds) => ds.map((d, i) => (i === editing.index ? { ...d, ...value } : d)));
            setEditing(null);
          }}
        />
      )}
      {editing?.kind === "saved" && order && (
        <LineEditor
          title={editing.item.productName}
          initial={{
            quantity: editing.item.quantity,
            note: editing.item.note ?? "",
            serviceType: editing.item.serviceType,
            modifierIds: [],
          }}
          modifiers={[]}
          onClose={() => setEditing(null)}
          onRemove={() => runItemAction(() => removeItemAction(order.id, editing.item.id))}
          onSave={(value) =>
            runItemAction(() =>
              updateItemAction(order.id, editing.item.id, {
                quantity: value.quantity,
                note: value.note,
                serviceType: value.serviceType,
              }),
            )
          }
        />
      )}
    </div>
  );
}

function Toggle({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-[60px_1fr] items-center gap-2">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            disabled={disabled}
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "h-10 rounded-md text-base font-medium disabled:cursor-not-allowed",
              value === o.value ? "bg-background shadow-sm" : "text-muted-foreground",
              disabled && value !== o.value && "opacity-40",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function LineRow({
  quantity,
  name,
  details,
  takeaway,
  totalCents,
  locked,
  isNew,
  onClick,
}: {
  quantity: number;
  name: string;
  details: string;
  takeaway: boolean;
  totalCents: number;
  locked?: boolean;
  isNew?: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        disabled={locked}
        className="flex w-full items-start gap-3 py-2.5 text-left disabled:cursor-default"
      >
        <span className="w-8 shrink-0 text-lg font-bold tabular-nums">{quantity}×</span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5 font-medium">
            {name}
            {takeaway && <Badge variant="outline">PARA LLEVAR</Badge>}
            {isNew && <Badge>Nuevo</Badge>}
            {locked && (
              <Badge variant="secondary">
                <Lock className="mr-1 size-3" /> En cocina
              </Badge>
            )}
          </span>
          {details && <span className="block text-sm text-muted-foreground">{details}</span>}
        </span>
        <span className="font-semibold tabular-nums">{formatMoney(totalCents)}</span>
      </button>
    </li>
  );
}
