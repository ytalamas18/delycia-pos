import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db, disconnectDb } from "@/core/db/client";
import { eventBus } from "@/core/db/transaction";
import { inventoryModule, stockByProduct } from "@/modules/inventory";
import { emptyBulkRow, parseBaseUnit, parseCsv, parseItemType, rowsFromTable, type BulkRow } from "@/modules/catalog/domain/bulk";
import { bulkCreateItems } from "@/modules/catalog/services/bulk";
import { buildImportTemplate, readImportFile } from "@/modules/catalog/services/import-file";

import { resetDatabase } from "../support/db";

const row = (r: Partial<BulkRow>): BulkRow => ({ ...emptyBulkRow(), ...r });

describe("carga rápida (lectura)", () => {
  it("entiende tipos y unidades escritos a mano", () => {
    expect(parseItemType("insumo")).toBe("SUPPLY");
    expect(parseItemType("PREPARADO")).toBe("PREPARED");
    expect(parseItemType("bebida")).toBeNull();
    expect(parseBaseUnit("Kg")).toBe("KG");
    expect(parseBaseUnit("gramos")).toBe("G");
    expect(parseBaseUnit("Litro")).toBe("L");
    expect(parseBaseUnit("unidades")).toBe("UNIT");
  });

  it("CSV con ; o , y comillas; encabezados sin importar tildes", () => {
    const csv = '﻿Nombre;Tipo;Categoria;Unidad;Suma stock;Stock minimo;Ultimo costo (Bs);Precio venta (Bs);Inventario inicial\r\n"Pan; grande";Insumo;Panaderia;unidad;si;24;1,5;;48\r\n;;;;;;;;\r\n';
    const rows = rowsFromTable(parseCsv(csv));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Pan; grande", type: "Insumo", category: "Panaderia", lastCost: "1,5", initialStock: "48" });
    expect(parseCsv("a,b\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
    expect(() => rowsFromTable([["Algo"], ["x"]])).toThrow("Nombre");
  });
});

describe("carga rápida (base de datos)", () => {
  beforeEach(async () => {
    eventBus.reset();
    inventoryModule.registerSubscribers?.();
    await resetDatabase();
  });
  afterAll(disconnectDb);

  it("crea ítems y categorías; el inventario inicial queda como movimiento", async () => {
    const r = await bulkCreateItems([
      row({ name: "Carne molida", type: "Insumo", category: "Carnes", unit: "kg", tracksStock: "sí", minStock: "2", lastCost: "52", initialStock: "5,5" }),
      row({ name: "Hamburguesa", type: "Preparado", category: "Hamburguesas", unit: "unidad", tracksStock: "no", price: "40" }),
      row({ name: "" }), // vacía: se ignora
    ]);
    expect(r).toEqual({ created: 2, errors: [] });
    const carne = await db.product.findFirstOrThrow({ where: { name: "Carne molida" }, include: { category: true } });
    expect(carne).toMatchObject({ type: "SUPPLY", baseUnit: "KG", tracksStock: true, category: { name: "Carnes" } });
    expect((await stockByProduct([carne.id])).get(carne.id)?.toString()).toBe("5.5");
    const mov = await db.stockMovement.findFirstOrThrow({ where: { productId: carne.id } });
    expect(mov.type).toBe("INITIAL");
    expect((await db.product.findFirstOrThrow({ where: { name: "Hamburguesa" } })).sendsToKitchen).toBe(true);
  });

  it("todo o nada: con un error no se guarda ninguna fila y se dice cuál", async () => {
    const r = await bulkCreateItems([
      row({ name: "Pan", type: "Insumo", category: "Panadería" }),
      row({ name: "Gaseosa", type: "Normal", category: "Bebidas", price: "" }), // falta precio
      row({ name: "Raro", type: "Bebida" }),
      row({ name: "Sal", type: "Insumo", tracksStock: "no", initialStock: "3" }),
    ]);
    expect(r.created).toBe(0);
    expect(r.errors.map((e) => e.row)).toEqual([2, 3, 4]);
    expect(r.errors[0].message).toContain("precio");
    expect(await db.product.count()).toBe(0);
    expect(await db.category.count()).toBe(0);
  });

  it("no duplica un ítem que ya existe en la categoría", async () => {
    await bulkCreateItems([row({ name: "Pan", type: "Insumo", category: "Panadería" })]);
    const r = await bulkCreateItems([row({ name: "pan ", type: "Insumo", category: "panaderia" })]);
    expect(r.errors[0].message).toContain("ya existe");
  });

  it("la plantilla descargable se puede volver a importar", async () => {
    const buffer = await buildImportTemplate();
    const file = new File([new Uint8Array(buffer)], "plantilla.xlsx");
    const rows = await readImportFile(file);
    expect(rows).toHaveLength(5);
    expect(rows[0]).toMatchObject({ name: "Carne molida", unit: "kg", lastCost: "52" });
    expect((await bulkCreateItems(rows)).created).toBe(5);
  });
});
