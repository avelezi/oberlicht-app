import {
  Award, BarChart3, BellRing, CalendarCheck, CalendarDays, CircleUser, ClipboardCheck, FileText, HeartHandshake, IdCard, KeyRound, Layers,
  LayoutDashboard, LineChart, Megaphone, Package, Receipt, ScanLine, Settings, ShoppingCart, Stethoscope, Sun, Tags,
  TicketPercent, Trophy, UserCheck, UserPlus, Users, Wallet, Wrench, type LucideIcon,
} from 'lucide-react';

const MAP: Record<string, LucideIcon> = {
  Award, BarChart3, BellRing, CalendarCheck, CalendarDays, CircleUser, ClipboardCheck, FileText, HeartHandshake, IdCard, KeyRound, Layers,
  LayoutDashboard, LineChart, Megaphone, Package, Receipt, ScanLine, Settings, ShoppingCart, Stethoscope, Sun, Tags,
  TicketPercent, Trophy, UserCheck, UserPlus, Users, Wallet, Wrench,
};

/** Íconos del menú lateral (el design system pide renderIcon con nombres de lucide). */
export function NavIcon({ name }: { name: string }) {
  const C = MAP[name] ?? LayoutDashboard;
  return <C className="h-5 w-5" aria-hidden />;
}
