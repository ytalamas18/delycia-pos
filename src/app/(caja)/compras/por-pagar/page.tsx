import { PayablesView, PurchasesNav } from "@/modules/purchases";

export default function PorPagarPage() {
  return (
    <>
      <h1 className="text-2xl font-bold">Cuentas por pagar</h1>
      <PurchasesNav active="/compras/por-pagar" />
      <PayablesView />
    </>
  );
}
