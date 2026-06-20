// Layout del panel del vendedor (Ágora)
// TODO: proteger por rol vendor (Vendor Owner/Staff) — redirigir si no autorizado
export default function VendorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      {/* TODO: barra lateral/nav del panel vendedor — enlaces: productos, pedidos, comprobantes, drops */}
      {children}
    </div>
  );
}
// Fin: layout del panel del vendedor.
