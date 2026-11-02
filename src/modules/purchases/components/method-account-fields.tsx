"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MONEY_ACCOUNTS, MONEY_ACCOUNT_LABEL } from "@/core/money/accounts";
import type { MoneyAccount, SupplierPaymentMethod } from "@/generated/prisma/enums";

import { DEFAULT_ACCOUNT_FOR_METHOD, SUPPLIER_METHOD_LABEL } from "../domain/labels";

const selectClass = "h-11 w-full rounded-md border border-input bg-background px-3 text-base";

/**
 * Método, cuenta de origen y n° de comprobante de un pago a proveedor. Al cambiar el método, la cuenta
 * vuelve a la que le corresponde (efectivo → Efectivo, transferencia/QR → Banco, tarjeta → ATC/PeYa);
 * después se puede cambiar a mano.
 */
export function MethodAccountFields({
  idPrefix,
  names = { method: "method", account: "account", reference: "reference" },
}: {
  idPrefix: string;
  names?: { method: string; account: string; reference: string };
}) {
  const [method, setMethod] = useState<SupplierPaymentMethod>("CASH");
  const [account, setAccount] = useState<MoneyAccount>("CASH");
  return (
    <>
      <div className="grid gap-1">
        <Label htmlFor={`${idPrefix}-method`}>Método</Label>
        <select
          id={`${idPrefix}-method`}
          name={names.method}
          className={`${selectClass} w-52`}
          value={method}
          onChange={(e) => {
            const m = e.target.value as SupplierPaymentMethod;
            setMethod(m);
            setAccount(DEFAULT_ACCOUNT_FOR_METHOD[m]);
          }}
        >
          {Object.entries(SUPPLIER_METHOD_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1">
        <Label htmlFor={`${idPrefix}-account`}>Cuenta de origen</Label>
        <select
          id={`${idPrefix}-account`}
          name={names.account}
          className={`${selectClass} w-48`}
          value={account}
          onChange={(e) => setAccount(e.target.value as MoneyAccount)}
        >
          {MONEY_ACCOUNTS.map((a) => (
            <option key={a} value={a}>
              {MONEY_ACCOUNT_LABEL[a]}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1">
        <Label htmlFor={`${idPrefix}-reference`}>N° de comprobante / referencia</Label>
        <Input id={`${idPrefix}-reference`} name={names.reference} maxLength={60} placeholder="Opcional" className="w-52" />
      </div>
    </>
  );
}
