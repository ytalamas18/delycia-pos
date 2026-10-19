import { formatQuantity } from "@/core/quantity";
import { formatMoney } from "@/core/money";
import { cn } from "@/lib/utils";

import { formatCost, formatUnitCost } from "../domain/costs";
import { UNIT_LABEL, UNIT_SHORT } from "../domain/unit-labels";
import { getRecipeView, listRecipeComponents, type RecipeView } from "../services/recipes";
import { CopyModifierRecipeButton, RecipeEditor, type ComponentOption, type RecipeLineRow } from "./recipe-editor";
import { RecipeYieldForm } from "./recipe-yield-form";

type Line = RecipeView["lines"][number] | RecipeView["modifiers"][number]["recipeLines"][number];

function toRow(l: Line): RecipeLineRow {
  return {
    id: l.id,
    name: l.component.name,
    unit: UNIT_SHORT[l.component.baseUnit],
    tracksStock: l.component.tracksStock,
    quantity: formatQuantity(l.quantity),
    condition: "condition" in l ? l.condition : "ALWAYS",
    unitCost: l.unitCostCents ? `${formatUnitCost(l.unitCostCents)}/${UNIT_SHORT[l.component.baseUnit]}` : null,
    lineCost: l.lineCostCents ? formatCost(l.lineCostCents) : null,
  };
}

async function options(kind: "PREPARED" | "INGREDIENT" | "MODIFIER"): Promise<ComponentOption[]> {
  const list = await listRecipeComponents(kind);
  return list.map((c) => ({ id: c.id, name: c.name, type: c.type, unit: UNIT_SHORT[c.baseUnit], category: c.category.name }));
}

function CostCard({ title, cost, priceCents }: { title: string; cost: RecipeView["dineIn"]; priceCents: number }) {
  const low = cost.percent !== null && cost.percent < 50;
  return (
    <div className="rounded-lg border p-3">
      <div className="text-sm text-muted-foreground">{title}</div>
      <div className="text-xl font-semibold tabular-nums">{formatCost(cost.costCents)}</div>
      <div className="text-sm">
        Precio {formatMoney(priceCents)} · margen{" "}
        <span className={cn("font-semibold", low ? "text-amber-700 dark:text-amber-400" : "text-green-700 dark:text-green-400")}>
          {formatCost(cost.marginCents)} ({cost.percent ?? "—"} %)
        </span>
      </div>
      {cost.missing > 0 && (
        <div className="text-sm text-amber-700 dark:text-amber-400">
          {cost.missing} componente{cost.missing > 1 ? "s" : ""} sin costo: el costo real es mayor.
        </div>
      )}
    </div>
  );
}

/** Receta de un Preparado o Ingrediente y lo que descuentan sus modificadores, con costos y márgenes. */
export async function RecipeSection({ productId, baseUnit }: { productId: string; baseUnit: keyof typeof UNIT_LABEL }) {
  const view = await getRecipeView(productId);
  if (!view) return null;
  const hasRecipe = view.type === "PREPARED" || view.type === "INGREDIENT";
  const [own, modifierOptions] = await Promise.all([
    hasRecipe ? options(view.type as "PREPARED" | "INGREDIENT") : Promise.resolve([]),
    view.modifiers.length > 0 ? options("MODIFIER") : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-8">
      {view.type === "PREPARED" && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Receta</h2>
          <p className="text-sm text-muted-foreground">
            Al vender se descuentan solo los componentes que manejan stock. Usa &quot;Solo para llevar&quot; para envases
            (PEYA cuenta como para llevar). Sin receta, el plato se vende igual y no descuenta nada.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <CostCard title="Costo comer aquí" cost={view.dineIn} priceCents={view.priceCents} />
            <CostCard title="Costo para llevar" cost={view.takeaway} priceCents={view.priceCents} />
          </div>
          <RecipeEditor kind="recipe" ownerId={productId} lines={view.lines.map(toRow)} components={own} showCondition />
        </section>
      )}

      {view.type === "INGREDIENT" && view.ingredient && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Receta de referencia</h2>
          <p className="text-sm text-muted-foreground">
            Solo sirve para calcular el costo: no descuenta stock. El stock del ingrediente sube con el ingreso a
            inventario (producción).
          </p>
          <RecipeYieldForm
            ownerId={productId}
            unit={UNIT_LABEL[baseUnit]}
            recipeYield={view.ingredient.recipeYield ? formatQuantity(view.ingredient.recipeYield) : ""}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border p-3">
              <div className="text-sm text-muted-foreground">Costo de la tanda (estimado)</div>
              <div className="text-xl font-semibold tabular-nums">{formatCost(view.ingredient.costCents)}</div>
              <div className="text-sm">
                Por {UNIT_LABEL[baseUnit]}:{" "}
                <span className="font-semibold">
                  {view.ingredient.unitCostCents ? formatUnitCost(view.ingredient.unitCostCents) : "falta el rendimiento"}
                </span>
              </div>
              {view.ingredient.missing > 0 && (
                <div className="text-sm text-amber-700 dark:text-amber-400">
                  {view.ingredient.missing} insumo{view.ingredient.missing > 1 ? "s" : ""} sin costo.
                </div>
              )}
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-sm text-muted-foreground">Último costo registrado</div>
              <div className="text-xl font-semibold tabular-nums">
                {view.ingredient.lastCostCents ? formatUnitCost(view.ingredient.lastCostCents) : "—"}
              </div>
              <div className="text-sm text-muted-foreground">
                Se guarda en cada ingreso a inventario. Si no hay, las recetas usan el estimado.
              </div>
            </div>
          </div>
          <RecipeEditor kind="recipe" ownerId={productId} lines={view.lines.map(toRow)} components={own} showCondition={false} />
        </section>
      )}

      {view.modifiers.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Lo que descuentan los modificadores</h2>
          <p className="text-sm text-muted-foreground">
            Por cada unidad vendida con ese modificador (ej. &quot;Extra queso&quot; → 30 g de queso). Los que no
            descuentan nada (ej. &quot;Sin cebolla&quot;) se dejan vacíos.
          </p>
          {view.modifiers.map((m) => (
            <div key={m.id} className="space-y-2 rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">
                  {m.name}
                  {m.priceDeltaCents > 0 && <span className="font-normal text-muted-foreground"> +{formatMoney(m.priceDeltaCents)}</span>}
                  {m.recipeLines.length > 0 && (
                    <span className="font-normal text-muted-foreground">
                      {" "}
                      · costo {formatCost(m.cost.costCents)}
                    </span>
                  )}
                </h3>
                {m.recipeLines.length > 0 && <CopyModifierRecipeButton modifierId={m.id} name={m.name} />}
              </div>
              <RecipeEditor kind="modifier" ownerId={m.id} lines={m.recipeLines.map(toRow)} components={modifierOptions} showCondition={false} />
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
