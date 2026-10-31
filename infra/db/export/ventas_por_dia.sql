-- Una fila por día de negocio. Solo suman órdenes PAGADAS/CERRADAS; las anuladas se cuentan aparte.
-- platos = ítems de tipo Preparado; items = todo lo vendido (incluye bebidas).
-- Medios de pago: pagos no devueltos de las órdenes del día (fiado = venta del día aunque no entró el dinero).
COPY (
  WITH dias AS (SELECT DISTINCT "businessDate" AS fecha FROM "Order"),
  ventas AS (
    SELECT "businessDate" AS fecha, count(*) AS tickets,
           sum("totalCents") AS total, sum("discountCents") AS descuentos
    FROM "Order" WHERE status IN ('PAID', 'CLOSED') GROUP BY 1
  ),
  items AS (
    SELECT o."businessDate" AS fecha,
           sum(oi.quantity) FILTER (WHERE p.type = 'PREPARED') AS platos,
           sum(oi.quantity) AS items
    FROM "OrderItem" oi
    JOIN "Order" o ON o.id = oi."orderId"
    JOIN "Product" p ON p.id = oi."productId"
    WHERE oi.status = 'ACTIVE' AND o.status IN ('PAID', 'CLOSED')
    GROUP BY 1
  ),
  pagos AS (
    SELECT o."businessDate" AS fecha,
           sum(pa."amountCents") FILTER (WHERE pa.method = 'CASH') AS efectivo,
           sum(pa."amountCents") FILTER (WHERE pa.method = 'QR') AS qr,
           sum(pa."amountCents") FILTER (WHERE pa.method = 'CARD') AS tarjeta,
           sum(pa."amountCents") FILTER (WHERE pa.method = 'PEYA') AS peya,
           sum(pa."amountCents") FILTER (WHERE pa.method = 'CREDIT') AS fiado
    FROM "Payment" pa
    JOIN "Order" o ON o.id = pa."orderId"
    WHERE pa."refundedAt" IS NULL AND o.status IN ('PAID', 'CLOSED')
    GROUP BY 1
  ),
  anuladas AS (
    SELECT "businessDate" AS fecha, count(*) AS n, sum("totalCents") AS total
    FROM "Order" WHERE status = 'CANCELLED' GROUP BY 1
  )
  SELECT d.fecha,
         coalesce(v.tickets, 0) AS tickets,
         coalesce(i.platos, 0) AS platos,
         coalesce(i.items, 0) AS items,
         round(coalesce(v.total, 0) / 100.0, 2) AS total_bs,
         round(coalesce(v.descuentos, 0) / 100.0, 2) AS descuentos_bs,
         round(coalesce(pg.efectivo, 0) / 100.0, 2) AS efectivo_bs,
         round(coalesce(pg.qr, 0) / 100.0, 2) AS qr_bs,
         round(coalesce(pg.tarjeta, 0) / 100.0, 2) AS tarjeta_bs,
         round(coalesce(pg.peya, 0) / 100.0, 2) AS peya_bs,
         round(coalesce(pg.fiado, 0) / 100.0, 2) AS fiado_bs,
         coalesce(a.n, 0) AS ordenes_anuladas,
         round(coalesce(a.total, 0) / 100.0, 2) AS anulado_bs
  FROM dias d
  LEFT JOIN ventas v ON v.fecha = d.fecha
  LEFT JOIN items i ON i.fecha = d.fecha
  LEFT JOIN pagos pg ON pg.fecha = d.fecha
  LEFT JOIN anuladas a ON a.fecha = d.fecha
  ORDER BY d.fecha
) TO STDOUT WITH (FORMAT csv, HEADER);
