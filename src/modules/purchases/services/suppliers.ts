import { db } from "@/core/db/client";

import { supplierInput, type SupplierInput } from "../schemas";

export function listSuppliers({ onlyActive = false } = {}) {
  return db.supplier.findMany({
    where: onlyActive ? { active: true } : {},
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
}

export function getSupplier(id: string) {
  return db.supplier.findUnique({ where: { id } });
}

export function createSupplier(input: SupplierInput) {
  return db.supplier.create({ data: supplierInput.parse(input) });
}

export function updateSupplier(id: string, input: SupplierInput) {
  return db.supplier.update({ where: { id }, data: supplierInput.parse(input) });
}
