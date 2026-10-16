export const dynamic = "force-dynamic";

/** Chequeo de vida para Docker y, más adelante, para el balanceador en AWS. */
export function GET() {
  return Response.json({ status: "ok", time: new Date().toISOString() });
}
