import {
  Award, BarChart3, CalendarCheck, CalendarDays, CircleUser, ClipboardCheck, FileText, IdCard, Layers,
  LayoutDashboard, LineChart, Megaphone, Package, Receipt, ScanLine, Settings, ShoppingCart, Stethoscope, Sun, Tags,
  UserPlus, Users, Wallet, type LucideIcon,
} from 'lucide-react';

const MAP: Record<string, LucideIcon> = {
  Award, BarChart3, CalendarCheck, CalendarDays, CircleUser, ClipboardCheck, FileText, IdCard, Layers,
  LayoutDashboard, LineChart, Megaphone, Package, Receipt, ScanLine, Settings, ShoppingCart, Stethoscope, Sun, Tags,
  UserPlus, Users, Wallet,
};

/** Íconos del menú lateral (el design system pide renderIcon con nombres de lucide). */
export function NavIcon({ name }: { name: string }) {
  const C = MAP[name] ?? LayoutDashboard;
  return <C className="h-5 w-5" aria-hidden />;
}
