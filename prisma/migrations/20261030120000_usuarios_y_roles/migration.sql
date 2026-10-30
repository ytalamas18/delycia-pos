-- Usuarios y roles. Solo agrega: los usuarios existentes conservan id, nombre y PIN, y quedan con el rol
-- equivalente a su perfil fijo. La columna "role" (enum) se conserva sin uso para poder volver atrás.

-- Roles
CREATE TABLE "AccessRole" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "systemKey" TEXT,
    "permissions" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccessRole_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccessRole_nameKey_key" ON "AccessRole"("nameKey");
CREATE UNIQUE INDEX "AccessRole_systemKey_key" ON "AccessRole"("systemKey");

-- Roles de sistema con los mismos permisos que tenían los perfiles fijos (ver SYSTEM_ROLES en
-- src/core/auth/permissions.ts). El Admin tiene todos los permisos por código: su lista queda vacía.
INSERT INTO "AccessRole" ("id", "name", "nameKey", "systemKey", "permissions", "updatedAt") VALUES
  ('role_admin', 'Admin', 'admin', 'ADMIN', ARRAY[]::TEXT[], CURRENT_TIMESTAMP),
  ('role_cashier', 'Caja', 'caja', 'CASHIER', ARRAY[
    'sales.pos', 'sales.charge', 'sales.discount', 'sales.void', 'sales.history', 'sales.credit',
    'sales.messageKitchen', 'cash.close', 'kitchen.view', 'inventory.consume'
  ]::TEXT[], CURRENT_TIMESTAMP),
  ('role_kitchen', 'Cocina', 'cocina', 'KITCHEN', ARRAY['kitchen.view', 'kitchen.operate']::TEXT[], CURRENT_TIMESTAMP);

-- Usuarios: columnas nuevas (primero opcionales, se llenan y luego se exigen)
DROP INDEX "User_name_key";

ALTER TABLE "User" ADD COLUMN "roleId" TEXT,
ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "username" TEXT,
ALTER COLUMN "role" DROP NOT NULL;

UPDATE "User" SET
  "username" = lower(regexp_replace(btrim("name"), '\s+', '', 'g')),
  "roleId" = CASE "role"
    WHEN 'ADMIN' THEN 'role_admin'
    WHEN 'CASHIER' THEN 'role_cashier'
    WHEN 'KITCHEN' THEN 'role_kitchen'
  END;

ALTER TABLE "User" ALTER COLUMN "roleId" SET NOT NULL,
ALTER COLUMN "username" SET NOT NULL;

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE INDEX "User_roleId_idx" ON "User"("roleId");

ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "AccessRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
