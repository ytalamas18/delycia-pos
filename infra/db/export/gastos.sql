-- Una fila por línea de compra activa. El gasto cuenta en la fecha de compra aunque no esté pagado.
-- tipo: 'gasto_operativo' si el ítem está en la categoría "Gastos operativos" (alquiler, luz, sueldos...);
--       'insumo' para el resto (comida, bebidas, envases) → base del food cost.
COPY (
  SELECT pu.date AS fecha,
         pu.number AS nro_compra,
         coalesce(s.name, '(sin proveedor)') AS proveedor,
         pl."productName" AS concepto,
         c.name AS categoria,
         CASE WHEN lower(trim(c.name)) = 'gastos operativos' THEN 'gasto_operativo' ELSE 'insumo' END AS tipo,
         pl.quantity AS cantidad,
         pl."presentationName" AS unidad,
         round(pl."totalCents" / 100.0, 2) AS monto_bs,
         pu.note AS nota
  FROM "PurchaseLine" pl
  JOIN "Purchase" pu ON pu.id = pl."purchaseId"
  LEFT JOIN "Supplier" s ON s.id = pu."supplierId"
  JOIN "Product" p ON p.id = pl."productId"
  JOIN "Category" c ON c.id = p."categoryId"
  WHERE pu.status = 'ACTIVE'
  ORDER BY pu.date, pu.number, pl."createdAt"
) TO STDOUT WITH (FORMAT csv, HEADER);
