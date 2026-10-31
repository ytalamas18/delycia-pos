-- Foto al momento del export: fiados (cuenta por cobrar) con saldo pendiente.
COPY (
  SELECT pa."debtorName" AS cliente,
         o."businessDate" AS fecha,
         o.number AS nro_orden,
         round(pa."amountCents" / 100.0, 2) AS monto_bs,
         round(coalesce(cc.cobrado, 0) / 100.0, 2) AS cobrado_bs,
         round((pa."amountCents" - coalesce(cc.cobrado, 0)) / 100.0, 2) AS saldo_bs
  FROM "Payment" pa
  JOIN "Order" o ON o.id = pa."orderId"
  LEFT JOIN (
    SELECT "paymentId", sum("amountCents") AS cobrado FROM "CreditCollection" GROUP BY 1
  ) cc ON cc."paymentId" = pa.id
  WHERE pa.method = 'CREDIT' AND pa."refundedAt" IS NULL AND o.status IN ('PAID', 'CLOSED')
    AND pa."amountCents" > coalesce(cc.cobrado, 0)
  ORDER BY o."businessDate", o.number
) TO STDOUT WITH (FORMAT csv, HEADER);
