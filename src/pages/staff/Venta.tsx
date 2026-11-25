import { ShoppingCart } from 'lucide-react';
import { Card, EmptyState, PageHeader } from '@/design-system';

/** Punto de venta de barra y tienda: queda para la etapa 2 (fuera del MVP acordado). */
export default function Venta() {
  return (
    <>
      <PageHeader title="Punto de venta" description="Barra saludable y tienda." />
      <Card>
        <EmptyState icon={<ShoppingCart className="h-8 w-8" />} title="Llega en la etapa 2"
          description="El punto de venta con inventario, cargo a la cuenta de la familia y corte de caja se construye después del piloto, como quedó en el alcance del MVP. Mientras tanto puedes consultar los avisos del club." />
      </Card>
    </>
  );
}
