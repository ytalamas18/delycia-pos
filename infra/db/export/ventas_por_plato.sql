-- Una fila por día, ítem y canal. Nombre y precio = copia guardada en la venta.
-- total_bs es ANTES del descuento de la orden (el descuento está en ventas_por_dia.descuentos_bs).
-- precio_promedio_bs varía si hubo modificadores o recargo PEYA.
COPY (
  SELECT o."businessDate" AS fecha,
         oi."productName" AS plato,
         c.name AS categoria,
         p.type AS tipo,
         o.channel AS canal,
         sum(oi.quantity) AS cantidad,
         round(sum(oi."unitPriceCents" * oi.quantity)::numeric / sum(oi.quantity) / 100.0, 2) AS precio_promedio_bs,
         round(sum(oi."unitPriceCents" * oi.quantity) / 100.0, 2) AS total_bs
  FROM "OrderItem" oi
  JOIN "Order" o ON o.id = oi."orderId"
  JOIN "Product" p ON p.id = oi."productId"
  JOIN "Category" c ON c.id = p."categoryId"
  WHERE oi.status = 'ACTIVE' AND o.status IN ('PAID', 'CLOSED')
  GROUP BY 1, 2, 3, 4, 5
  ORDER BY 1, total_bs DESC
) TO STDOUT WITH (FORMAT csv, HEADER);
