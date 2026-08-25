import {
  Bot,
  Siren,
  Settings,
  User,
  KeyRound,
  ShieldCheck,
  Building2,
  CreditCard,
  Network,
  ShieldHalf,
  ListChecks,
  MapPinned,
  Shield,
  Route,
  AlertTriangle,
  BadgeCheck,
  Wrench,
  Bell,
  Mail,
  MessageSquare,
  Radio,
  Smartphone,
  TabletSmartphone,
  Wallet,
  Clock,
  FileBarChart,
  FileCog,
  Plug,
  Code,
  FileDown,
  FileText,
  Settings2,
  Palette,
  DatabaseZap,
  BellRing,
  Headphones,
  Languages,
  type LucideIcon,
} from "lucide-react";

// Shared icon registry for the settings nav + landing dashboard. Keys match the
// `icon` field in src/data/settings-nav.json.
export const SETTINGS_ICONS: Record<string, LucideIcon> = {
  Bot,
  Siren,
  User, KeyRound, ShieldCheck, Building2, CreditCard, Network, ShieldHalf,
  ListChecks, MapPinned, Shield, Route, AlertTriangle, BadgeCheck, Wrench,
  Bell, Mail, MessageSquare, Radio, Smartphone, TabletSmartphone, Wallet, Clock, FileBarChart, FileCog,
  Plug, Code, FileDown, FileText, Settings2, Palette, DatabaseZap, BellRing,
  Headphones, Languages,
};

export function settingsIcon(name?: string): LucideIcon {
  return (name && SETTINGS_ICONS[name]) || Settings;
}
