"use client";
import { useSession, signOut } from "next-auth/react";
import { useMemo, useEffect, useState } from "react";
import { NAV_ITEMS, NAV_CATEGORIES, useAppStore } from "@/stores/app-store";
import { useI18n, LANGUAGES } from "@/lib/i18n";
import * as Icons from "lucide-react";
import { OfflineIndicator } from "@/components/offline/offline-indicator";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useQuery } from "@tanstack/react-query";
import { DashboardView } from "@/components/views/dashboard-view";
import { ViewRenderer } from "@/components/views/view-renderer";
import { Menu, LogOut, ChevronDown, Hospital, Bell, Search } from "lucide-react";
import { toast } from "sonner";
import { safeJson } from "@/components/ui-helpers";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return safeJson(res);
}

export function AppShell() {
  const { data: session, status } = useSession();
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const setActiveFacility = useAppStore((s) => s.setActiveFacility);

  const [mobileOpen, setMobileOpen] = useState(false);

  // Redirect to /change-password if mustChangePassword is set
  useEffect(() => {
    if (status === "authenticated" && (session?.user as any)?.mustChangePassword) {
      window.location.href = "/change-password";
    }
  }, [status, session]);

  // === Client-side idle/session timeout ===
  // Fetches the configured session timeout from system settings and
  // forces logout after the specified minutes of inactivity.
  useEffect(() => {
    if (status !== "authenticated") return;

    let timeoutMs = 8 * 60 * 60 * 1000; // default 8h
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    // Fetch the configured timeout
    fetch("/api/system-settings")
      .then((res) => res.json())
      .then((data: any) => {
        const items: any[] = data?.items || [];
        const setting = items.find((s: any) => s.settingKey === "security_session_timeout_min");
        if (setting && setting.settingValue) {
          const mins = parseInt(setting.settingValue, 10);
          if (mins > 0) timeoutMs = mins * 60 * 1000;
        }
        startIdleTimer();
      })
      .catch(() => startIdleTimer());

    function startIdleTimer() {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        // Time's up — sign out
        import("next-auth/react").then(({ signOut }) => {
          signOut({ redirect: false }).then(() => {
            window.location.href = "/?reason=timeout";
          });
        });
      }, timeoutMs);
    }

    // Reset the timer on any user activity
    function resetTimer() {
      startIdleTimer();
    }

    // Track user activity
    window.addEventListener("mousedown", resetTimer);
    window.addEventListener("keydown", resetTimer);
    window.addEventListener("scroll", resetTimer);
    window.addEventListener("touchstart", resetTimer);

    return () => {
      if (idleTimer) clearTimeout(idleTimer);
      window.removeEventListener("mousedown", resetTimer);
      window.removeEventListener("keydown", resetTimer);
      window.removeEventListener("scroll", resetTimer);
      window.removeEventListener("touchstart", resetTimer);
    };
  }, [status]);

  // Fetch facilities (for facility switcher)
  const { data: facilitiesData } = useQuery({
    queryKey: ["facilities"],
    queryFn: () => fetchJson("/api/facilities"),
  });

  const facilities = facilitiesData?.facilities || [];

  // Auto-clear stale activeFacilityId if it doesn't exist in the fetched facilities
  // This prevents foreign key violations when switching between deployments
  // (e.g., from preview URL to Vercel URL) where facility IDs differ.
  // NOTE: null = "All Facilities" (intentional), so we skip the check when null.
  useEffect(() => {
    if (facilities.length > 0 && activeFacilityId) {
      const stillExists = facilities.some((f: any) => f.id === activeFacilityId);
      if (!stillExists) {
        // The persisted facility ID is stale — clear it
        setActiveFacility(null);
        toast.info("Your previous facility selection was cleared. Please select a facility.");
      }
    }
  }, [facilities, activeFacilityId, setActiveFacility]);

  const user = session?.user as any;
  const userPermissions: string[] = user?.permissions || [];
  const isSuperAdmin = user?.roles?.includes("super_admin");
  const userInitials = user?.name
    ? user.name.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase()
    : "U";

  // Filter nav items by permission
  const visibleNavItems = useMemo(() => {
    return NAV_ITEMS.filter((item) => {
      if (!item.permission) return true;
      if (isSuperAdmin) return true;
      return userPermissions.includes(item.permission);
    });
  }, [userPermissions, isSuperAdmin]);

  // Group by category
  const navByCategory = useMemo(() => {
    const grouped: Record<string, typeof NAV_ITEMS> = {};
    for (const cat of NAV_CATEGORIES) {
      grouped[cat] = visibleNavItems.filter((i) => i.category === cat);
    }
    return grouped;
  }, [visibleNavItems]);

  // Notifications
  const { data: notificationsData } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => fetchJson("/api/notifications"),
    refetchInterval: 30000,
  });
  const unread = notificationsData?.notifications?.filter((n: any) => !n.readAt) || [];

  // Currently active view label
  const { t } = useI18n();
  const currentViewLabel = t("sidebar." + view);

  // If facility is set, also fetch its dashboard data for context
  const activeFacility = facilities.find((f: any) => f.id === activeFacilityId);

  const handleSignOut = async () => {
    await signOut({ redirect: false });
    toast.success("Signed out");
    window.location.href = "/";
  };

  const handleFacilityChange = (id: string) => {
    if (id === "__all__") {
      setActiveFacility(null);
      toast.success("Switched to All Facilities");
    } else {
      setActiveFacility(id);
      toast.success(`Switched to ${facilities.find((f: any) => f.id === id)?.name || "facility"}`);
    }
  };

  return (
    <div className="h-dvh flex bg-slate-50 overflow-hidden">
      {/* Mobile sidebar trigger */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-72">
          <SidebarContent
            navByCategory={navByCategory}
            currentView={view}
            onSelect={(v) => {
              setView(v);
              setMobileOpen(false);
            }}
            collapsed={false}
          />
        </SheetContent>
      </Sheet>

      {/* Desktop Sidebar — dark navy */}
      <aside
        className={`${sidebarCollapsed ? "w-16" : "w-64"} hidden md:flex flex-col bg-slate-900 transition-all duration-200 shrink-0 h-dvh overflow-hidden shadow-xl`}
      >
        <SidebarContent
          navByCategory={navByCategory}
          currentView={view}
          onSelect={setView}
          collapsed={sidebarCollapsed}
        />
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 h-dvh overflow-hidden bg-slate-50">
        {/* Topbar — clean white with subtle shadow */}
        <header className="h-16 border-b border-slate-200 bg-white px-4 md:px-6 flex items-center justify-between gap-4 shrink-0 z-30 shadow-sm">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden hover:bg-slate-100"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="w-5 h-5 text-slate-700" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="hidden md:flex hover:bg-slate-100"
              onClick={toggleSidebar}
            >
              <Menu className="w-5 h-5 text-slate-700" />
            </Button>
            <div className="flex flex-col min-w-0">
              <h1 className="text-lg font-bold text-slate-900 truncate">{currentViewLabel}</h1>
              <p className="text-xs text-slate-500 hidden sm:block">
                {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Facility Switcher */}
            {facilities.length > 0 && (
              <Select value={activeFacilityId || "__all__"} onValueChange={handleFacilityChange}>
                <SelectTrigger className="w-44 hidden md:flex border-slate-200 hover:border-rose-300">
                  <div className="flex items-center gap-2 truncate">
                    <Hospital className="w-4 h-4 text-rose-500 shrink-0" />
                    <SelectValue placeholder={t("topbar.all_facilities")}>
                      {activeFacility ? activeFacility.code : t("topbar.all_facilities")}
                    </SelectValue>
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{t("topbar.all_facilities")}</SelectItem>
                  {facilities.map((f: any) => (
                    <SelectItem key={f.id} value={f.id}>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{f.code}</span>
                        <span className="text-xs text-slate-500">{f.city}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Language switcher */}
            <LanguageSwitcher />

            {/* Offline status indicator */}
            <OfflineIndicator />

            {/* Notifications */}
            <Button variant="ghost" size="icon" className="relative hover:bg-slate-100" onClick={() => setView("workflow_dashboard")}>
              <Bell className="w-5 h-5 text-slate-600" />
              {unread.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-gradient-to-br from-rose-500 to-red-600 text-white text-[10px] rounded-full flex items-center justify-center font-bold shadow-md">
                  {unread.length > 9 ? "9+" : unread.length}
                </span>
              )}
            </Button>

            {/* User menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2 px-2 hover:bg-slate-100 rounded-full">
                  <Avatar className="w-9 h-9 ring-2 ring-slate-200">
                    <AvatarFallback className="bg-gradient-to-br from-rose-500 to-red-600 text-white text-xs font-bold">
                      {userInitials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="hidden md:flex flex-col items-start">
                    <span className="text-sm font-semibold leading-tight text-slate-900">{user?.name}</span>
                    <span className="text-[11px] text-slate-500 leading-tight capitalize">
                      {(user?.roles || []).join(", ").replace(/_/g, " ")}
                    </span>
                  </div>
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col">
                    <span>{user?.name}</span>
                    <span className="text-xs text-slate-500 font-normal">{user?.email}</span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setView("settings_system")}>
                  <Icons.Settings className="w-4 h-4 mr-2" /> {t("topbar.system_settings")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setView("audit_logs")}>
                  <Icons.ScrollText className="w-4 h-4 mr-2" /> Audit Logs
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-rose-600">
                  <LogOut className="w-4 h-4 mr-2" /> {t("topbar.sign_out")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 p-4 md:p-6 overflow-y-auto overflow-x-hidden">
          {view === "dashboard" ? (
            <DashboardView />
          ) : (
            <ViewRenderer view={view} />
          )}
        </main>
      </div>
    </div>
  );
}

// =====================================================================
// SIDEBAR CONTENT (shared between desktop and mobile)
// =====================================================================
function SidebarContent({
  navByCategory,
  currentView,
  onSelect,
  collapsed,
}: {
  navByCategory: Record<string, any[]>;
  currentView: string;
  onSelect: (v: any) => void;
  collapsed: boolean;
}) {
  const { t } = useI18n();
  // Convert category name to translation key: "Human Resources" → "sidebar.human_resources"
  const catKey = (cat: string) => "sidebar." + cat.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-900">
      {/* Logo / Brand — dark sidebar with red accent */}
      <div className="h-16 border-b border-slate-700/50 flex items-center px-4 gap-3 shrink-0 bg-slate-950/50">
        <div className="w-10 h-10 bg-gradient-to-br from-rose-500 to-red-600 rounded-lg flex items-center justify-center text-white shrink-0 shadow-lg shadow-red-900/30">
          <Icons.ShieldPlus className="w-5 h-5" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-sm font-bold text-white truncate">Joy Emmanuel</p>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider">Hospital HMIS</p>
          </div>
        )}
      </div>

      {/* Nav — dark sidebar with red active state */}
      <nav className="flex-1 min-h-0 overflow-y-auto px-3 py-3 sidebar-scroll">
        {NAV_CATEGORIES.map((cat) => {
          const items = navByCategory[cat] || [];
          if (items.length === 0) return null;
          return (
            <div key={cat} className="mb-3">
              {!collapsed && (
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-3 mb-1.5 mt-4">
                  {t(catKey(cat))}
                </p>
              )}
              {items.map((item) => {
                const Icon = (Icons as any)[item.icon] || Icons.Circle;
                const isActive = currentView === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => onSelect(item.key)}
                    title={collapsed ? t("sidebar." + item.key) : undefined}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150 group relative mb-0.5 ${
                      isActive
                        ? "bg-gradient-to-r from-rose-500 to-red-600 text-white font-semibold shadow-lg shadow-red-900/30"
                        : "text-slate-400 hover:bg-slate-800 hover:text-white"
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 transition-colors ${isActive ? "text-white" : "text-slate-500 group-hover:text-slate-300"}`} />
                    {!collapsed && <span className="truncate text-left">{t("sidebar." + item.key)}</span>}
                  </button>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Footer — dark */}
      <div className="border-t border-slate-700/50 p-3 shrink-0 bg-slate-950/30">
        {!collapsed ? (
          <div className="text-[10px] text-slate-500 leading-tight">
            <p className="font-semibold text-slate-400">© {new Date().getFullYear()} Joy Emmanuel Hospital</p>
            <p className="mt-0.5">v1.0.0 • Multi-facility HMIS</p>
          </div>
        ) : (
          <div className="flex justify-center">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="System online" />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Language Switcher ──────────────────────────────────────────
function LanguageSwitcher() {
  const { lang, setLang } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium text-slate-600 hover:bg-slate-100"
        title="Switch language"
      >
        <Icons.Languages className="w-4 h-4" />
        <span className="hidden sm:inline">{LANGUAGES.find((l) => l.code === lang)?.flag} {LANGUAGES.find((l) => l.code === lang)?.label}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-50 min-w-[140px]">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              onClick={() => { setLang(l.code); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-slate-50 ${lang === l.code ? "font-bold text-teal-700" : "text-slate-700"}`}
            >
              <span>{l.flag}</span> {l.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
