import { useState, type ComponentType } from "react";
import { NavLink, Outlet } from "react-router";
import {
  LayoutDashboard,
  Handshake,
  Users,
  CalendarDays,
  Network,
  Award,
  Newspaper,
  Inbox,
  ShieldCheck,
  ScrollText,
  Podcast,
  Images,
  Video,
  Mic2,
  TrendingUp,
  Settings,
  LogOut,
  Menu,
  X,
  FileText,
  Plug,
  UserPlus,
  Building2,
  Image,
} from "lucide-react";
import { useAuth } from "./AuthProvider";

interface NavItem {
  label: string;
  icon: ComponentType<{ className?: string }>;
  path?: string; // undefined = page not built yet
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Content",
    items: [
      { label: "Sponsors", icon: Handshake, path: "/admin/sponsors" },
      { label: "Committee", icon: Users, path: "/admin/committee" },
      { label: "Events", icon: CalendarDays, path: "/admin/events" },
      { label: "Alumni", icon: Network, path: "/admin/alumni" },
      { label: "Network Logos", icon: Building2, path: "/admin/network-logos" },
      { label: "Presidents", icon: Award, path: "/admin/presidents" },
      { label: "Fund Managers", icon: TrendingUp, path: "/admin/fund-managers" },
      { label: "Documents", icon: FileText, path: "/admin/documents" },
      { label: "Articles", icon: Newspaper, path: "/admin/articles" },
      { label: "Past Speakers", icon: Mic2, path: "/admin/past-speakers" },
      { label: "Gallery", icon: Images, path: "/admin/gallery" },
      { label: "Recordings", icon: Video, path: "/admin/recordings" },
      { label: "Page Backgrounds", icon: Image, path: "/admin/page-backgrounds" },
    ],
  },
  {
    label: "Submissions",
    items: [
      { label: "Submissions", icon: Inbox, path: "/admin/submissions" },
      { label: "Members", icon: UserPlus, path: "/admin/members" },
    ],
  },
  {
    label: "Settings",
    items: [
      { label: "Site Settings", icon: Settings, path: "/admin/site-settings" },
      { label: "Integrations", icon: Plug, path: "/admin/integrations" },
      { label: "Podcast", icon: Podcast, path: "/admin/podcast" },
      { label: "Manage Admins", icon: ShieldCheck, path: "/admin/admins" },
      { label: "Audit Log", icon: ScrollText, path: "/admin/audit-log" },
    ],
  },
];

function NavLinkItem({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  const Icon = item.icon;

  if (!item.path) {
    return (
      <div className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/40">
        <Icon className="h-4 w-4 shrink-0" />
        <span className="flex-1">{item.label}</span>
        <span className="text-[10px] uppercase tracking-wide">Soon</span>
      </div>
    );
  }

  return (
    <NavLink
      to={item.path}
      onClick={onNavigate}
      className={({ isActive }) =>
        `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
        }`
      }
    >
      <Icon className="h-4 w-4 shrink-0" />
      {item.label}
    </NavLink>
  );
}

function SidebarContent({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="px-4 py-5">
        <p className="text-xs uppercase tracking-[0.24em] text-sidebar-foreground/50">MUTIS</p>
        <p className="mt-0.5 text-sm font-medium text-sidebar-foreground">Admin</p>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-4">
        <NavLinkItem item={{ label: "Dashboard", icon: LayoutDashboard, path: "/admin" }} onNavigate={onNavigate} />

        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="px-3 pb-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-sidebar-foreground/40">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLinkItem key={item.label} item={item} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        ))}
      </nav>
    </div>
  );
}

export function AdminLayout() {
  const { session, adminName, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 overflow-y-auto border-r border-sidebar-border bg-sidebar lg:block">
        <SidebarContent onNavigate={() => {}} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-sidebar-border bg-sidebar">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-4 rounded-lg p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent"
              aria-label="Close menu"
            >
              <X className="h-4 w-4" />
            </button>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 items-center justify-between border-b border-border bg-background px-5 py-4 lg:px-8">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-1.5 text-foreground/70 hover:bg-white/5 lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{adminName ?? session?.user.email}</span>
            <button
              onClick={signOut}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-sm text-foreground transition-colors hover:bg-white/5"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
