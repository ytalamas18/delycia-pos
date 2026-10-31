-- Cierres de caja (arqueo). diferencia: negativo = faltó efectivo, positivo = sobró.
COPY (
  SELECT "businessDate" AS fecha,
         round("openingCashCents" / 100.0, 2) AS fondo_bs,
         round("expectedCashCents" / 100.0, 2) AS efectivo_esperado_bs,
         round("countedCashCents" / 100.0, 2) AS efectivo_contado_bs,
         round("differenceCents" / 100.0, 2) AS diferencia_bs,
         round("expectedQrCents" / 100.0, 2) AS qr_esperado_bs,
         round("countedQrCents" / 100.0, 2) AS qr_contado_bs,
         round("expectedCardCents" / 100.0, 2) AS tarjeta_esperado_bs,
         round("countedCardCents" / 100.0, 2) AS tarjeta_contado_bs,
         notes AS notas
  FROM "CashClosing"
  ORDER BY 1
) TO STDOUT WITH (FORMAT csv, HEADER);
