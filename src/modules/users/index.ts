// API pública del módulo Usuarios. Otros módulos y la app solo importan desde aquí.
// Las tablas User y Role son del núcleo (core/auth las lee para la sesión); este módulo es su administración.
export { usersModule } from "./module";
export { listUsers, getUser, assignableRoles, type UserRow } from "./services/users";
export { listRoles, getRole, permissionCount, type RoleRow } from "./services/roles";
export { UsersNav } from "./components/users-nav";
export { UserForm } from "./components/user-form";
export { PinResetForm } from "./components/pin-reset-form";
export { RoleForm } from "./components/role-form";
