// Layout del panel de universidad (Ágora — SuperAdmin)
// TODO: proteger por rol superadmin + IP interna (gate por IP de red universitaria)
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      {/* TODO: barra lateral/nav del panel admin — enlaces: vendors, reglas-ip, config */}
      {children}
    </div>
  );
}
// Fin: layout del panel de universidad.
