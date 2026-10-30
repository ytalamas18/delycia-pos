/** A donde llega un usuario cuyo rol no le da ninguna pantalla. */
export default function SinAccesoPage() {
  return (
    <div className="max-w-xl space-y-2">
      <h1 className="text-2xl font-bold">Sin pantallas asignadas</h1>
      <p>Tu rol todavía no tiene permisos para ninguna pantalla. Pide a quien administra los usuarios que te los asigne.</p>
    </div>
  );
}
