-- Foto al momento del export: compras con saldo pendiente.
COPY (
  SELECT coalesce(s.name, '(sin proveedor)') AS proveedor,
         pu.number AS nro_compra,
         pu.date AS fecha_compra,
         round(pu."totalCents" / 100.0, 2) AS total_bs,
         round(coalesce(pg.pagado, 0) / 100.0, 2) AS pagado_bs,
         round((pu."totalCents" - coalesce(pg.pagado, 0)) / 100.0, 2) AS saldo_bs,
         pu."dueDate" AS vencimiento,
         pu.note AS nota
  FROM "Purchase" pu
  LEFT JOIN "Supplier" s ON s.id = pu."supplierId"
  LEFT JOIN (
    SELECT "purchaseId", sum("amountCents") AS pagado
    FROM "SupplierPayment" WHERE "voidedAt" IS NULL GROUP BY 1
  ) pg ON pg."purchaseId" = pu.id
  WHERE pu.status = 'ACTIVE' AND pu."totalCents" > coalesce(pg.pagado, 0)
  ORDER BY proveedor, pu.date
) TO STDOUT WITH (FORMAT csv, HEADER);
