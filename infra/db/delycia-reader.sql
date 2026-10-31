-- Usuario de SOLO LECTURA para análisis (export diario de CSVs). Idempotente: se puede volver a correr.
-- Solo ve ventas, pagos, caja, catálogo, compras e inventario. NO ve usuarios, roles, PIN, eventos ni ajustes.
-- Uso (en la EC2, ver docs/infra-agente.md):
--   docker compose ... exec -T db psql -U delycia -d delycia -v ON_ERROR_STOP=1 -v reader_pw="$PW" < infra/db/delycia-reader.sql
\set ON_ERROR_STOP on

SELECT NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'delycia_reader') AS crear \gset
\if :crear
CREATE ROLE delycia_reader LOGIN PASSWORD :'reader_pw';
\else
ALTER ROLE delycia_reader LOGIN PASSWORD :'reader_pw';
\endif

ALTER ROLE delycia_reader NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 3;
-- Aunque alguien le diera permisos de escritura por error, sus transacciones son de solo lectura.
ALTER ROLE delycia_reader SET default_transaction_read_only = on;
-- Una consulta pesada no puede trabar la caja en horario de atención.
ALTER ROLE delycia_reader SET statement_timeout = '30s';

GRANT CONNECT ON DATABASE delycia TO delycia_reader;
GRANT USAGE ON SCHEMA public TO delycia_reader;

-- Parte de cero: si una tabla sale de esta lista, pierde el acceso.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM delycia_reader;
GRANT SELECT ON TABLE
  -- Ventas y cobros
  "Order", "OrderItem", "Payment", "CreditCollection",
  -- Caja
  "CashOpening", "CashClosing",
  -- Catálogo, recetas y costos
  "Category", "Product", "ProductPresentation", "RecipeLine",
  -- Compras y pagos a proveedores
  "Supplier", "Purchase", "PurchaseLine", "SupplierPayment",
  -- Inventario y mermas
  "StockMovement", "StockCount", "StockCountLine", "ProductionEntry"
TO delycia_reader;

-- Verificación: debe listar solo las 18 tablas de arriba.
SELECT table_name FROM information_schema.role_table_grants
WHERE grantee = 'delycia_reader' AND privilege_type = 'SELECT' ORDER BY table_name;
