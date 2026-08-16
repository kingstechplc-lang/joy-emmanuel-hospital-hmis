"use client";
import { useSession, signOut } from "next-auth/react";
import { useMemo } from "react";
import { NAV_ITEMS, NAV_CATEGORIES, useAppStore } from "@/stores/app-store";
import * as Icons from "lucide-react";
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
import { useState } from "react";
import { DashboardView } from "@/components/views/dashboard-view";
import { ViewRenderer } from "@/components/views/view-renderer";
import { Menu, LogOut, ChevronDown, Hospital, Bell, Search } from "lucide-react";
import { toast } from "sonner";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
}

export function AppShell() {
  const { data: session } = useSession();
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const setActiveFacility = useAppStore((s) => s.setActiveFacility);

  const [mobileOpen, setMobileOpen] = useState(false);

  // Fetch facilities (for facility switcher)
  const { data: facilitiesData } = useQuery({
    queryKey: ["facilities"],
    queryFn: () => fetchJson("/api/facilities"),
  });

  const facilities = facilitiesData?.facilities || [];

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
  const currentViewLabel = NAV_ITEMS.find((n) => n.key === view)?.label || "Dashboard";

  // If facility is set, also fetch its dashboard data for context
  const activeFacility = facilities.find((f: any) => f.id === activeFacilityId);

  const handleSignOut = async () => {
    await signOut({ redirect: false });
    toast.success("Signed out");
    window.location.href = "/";
  };

  const handleFacilityChange = (id: string) => {
    setActiveFacility(id);
    toast.success(`Switched to ${facilities.find((f: any) => f.id === id)?.name || "facility"}`);
  };

  return (
    <div className="h-screen flex bg-slate-50 overflow-hidden">
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

      {/* Desktop Sidebar */}
      <aside
        className={`${sidebarCollapsed ? "w-16" : "w-64"} hidden md:flex flex-col bg-white border-r border-slate-200 transition-all duration-200 shrink-0 h-screen overflow-hidden`}
      >
        <SidebarContent
          navByCategory={navByCategory}
          currentView={view}
          onSelect={setView}
          collapsed={sidebarCollapsed}
        />
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Topbar */}
        <header className="h-16 border-b border-slate-200 bg-white px-4 md:px-6 flex items-center justify-between gap-4 shrink-0 z-30">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="hidden md:flex"
              onClick={toggleSidebar}
            >
              <Menu className="w-5 h-5" />
            </Button>
            <div className="flex flex-col min-w-0">
              <h1 className="text-lg font-semibold text-slate-900 truncate">{currentViewLabel}</h1>
              <p className="text-xs text-slate-500 hidden sm:block">
                Joy Emmanuel Hospital HMIS
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Facility Switcher */}
            {facilities.length > 0 && (
              <Select value={activeFacilityId || undefined} onValueChange={handleFacilityChange}>
                <SelectTrigger className="w-44 hidden md:flex">
                  <div className="flex items-center gap-2 truncate">
                    <Hospital className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="truncate text-sm">
                      {activeFacility ? activeFacility.code : "All Facilities"}
                    </span>
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Facilities</SelectItem>
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

            {/* Notifications */}
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="w-5 h-5" />
              {unread.length > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 text-white text-[10px] rounded-full flex items-center justify-center font-semibold">
                  {unread.length > 9 ? "9+" : unread.length}
                </span>
              )}
            </Button>

            {/* User menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2 px-2">
                  <Avatar className="w-8 h-8">
                    <AvatarFallback className="bg-emerald-600 text-white text-xs font-semibold">
                      {userInitials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="hidden md:flex flex-col items-start">
                    <span className="text-sm font-medium leading-tight">{user?.name}</span>
                    <span className="text-xs text-slate-500 leading-tight">
                      {(user?.roles || []).join(", ").replace(/_/g, " ")}
                    </span>
                  </div>
                  <ChevronDown className="w-4 h-4 text-slate-500" />
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
                  <Icons.Settings className="w-4 h-4 mr-2" /> System Settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setView("audit_logs")}>
                  <Icons.ScrollText className="w-4 h-4 mr-2" /> Audit Logs
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-rose-600">
                  <LogOut className="w-4 h-4 mr-2" /> Sign out
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
  return (
    <div className="flex flex-col h-full">
      {/* Logo / Brand */}
      <div className="h-16 border-b border-slate-200 flex items-center px-4 gap-2 shrink-0">
        <div className="w-9 h-9 bg-gradient-to-br from-emerald-600 to-teal-700 rounded-lg flex items-center justify-center text-white shrink-0">
          <Icons.ShieldPlus className="w-5 h-5" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 truncate">Joy Emmanuel</p>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">HMIS</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <ScrollArea className="flex-1 py-2">
        <nav className="px-2 space-y-1">
          {NAV_CATEGORIES.map((cat) => {
            const items = navByCategory[cat] || [];
            if (items.length === 0) return null;
            return (
              <div key={cat} className="mb-2">
                {!collapsed && (
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-3 mb-1 mt-3">
                    {cat}
                  </p>
                )}
                {items.map((item) => {
                  const Icon = (Icons as any)[item.icon] || Icons.Circle;
                  const isActive = currentView === item.key;
                  return (
                    <button
                      key={item.key}
                      onClick={() => onSelect(item.key)}
                      title={collapsed ? item.label : undefined}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all duration-150 group relative ${
                        isActive
                          ? "bg-emerald-50 text-emerald-700 font-semibold shadow-sm"
                          : "text-slate-700 hover:bg-slate-100 hover:translate-x-0.5"
                      }`}
                    >
                      {/* Active left accent */}
                      {isActive && (
                        <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-emerald-600 rounded-r-full" />
                      )}
                      <Icon className={`w-4 h-4 shrink-0 transition-colors ${isActive ? "text-emerald-600" : "text-slate-500 group-hover:text-slate-700"}`} />
                      {!collapsed && <span className="truncate text-left">{item.label}</span>}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>
      </ScrollArea>

      {/* Footer */}
      <div className="border-t border-slate-200 p-3 shrink-0">
        {!collapsed && (
          <div className="text-[10px] text-slate-500 leading-tight">
            <p>© {new Date().getFullYear()} Joy Emmanuel Hospital</p>
            <p>v1.0.0 • Multi-facility HMIS</p>
          </div>
        )}
      </div>
    </div>
  );
}
