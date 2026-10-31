-- Pagos a proveedores (no anulados), en la fecha en que salió el dinero.
-- tipo: 'contado' si se pagó el mismo día de la compra; 'abono' si fue después (pago de deuda).
COPY (
  SELECT sp.date AS fecha,
         pu.number AS nro_compra,
         pu.date AS fecha_compra,
         coalesce(s.name, '(sin proveedor)') AS proveedor,
         CASE WHEN sp.date > pu.date THEN 'abono' ELSE 'contado' END AS tipo,
         round(sp."amountCents" / 100.0, 2) AS monto_bs,
         sp.method AS medio,
         sp.note AS nota
  FROM "SupplierPayment" sp
  JOIN "Purchase" pu ON pu.id = sp."purchaseId"
  LEFT JOIN "Supplier" s ON s.id = pu."supplierId"
  WHERE sp."voidedAt" IS NULL AND pu.status = 'ACTIVE'
  ORDER BY sp.date, pu.number
) TO STDOUT WITH (FORMAT csv, HEADER);
