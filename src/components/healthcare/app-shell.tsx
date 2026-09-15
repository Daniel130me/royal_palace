"use client";

import { cn } from "@/lib/utils";
import { useNav, navigate } from "@/lib/nav";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useState } from "react";
import { Menu, LogOut, Bell, ChevronDown, Stethoscope, Home, X, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/format";

export interface NavItem {
  label: string;
  page: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  /** On mobile, show in the bottom tab bar (max 5 primary). Others go in the "More" sheet. */
  mobile?: boolean;
}

interface AppShellProps {
  portal: "patient" | "provider" | "pharmacy" | "laboratory" | "logistics" | "manager" | "admin";
  brand: string;
  navItems: NavItem[];
  notifications?: number;
  /** Optional contextual search rendered in the mobile header */
  searchSlot?: React.ReactNode;
  children: React.ReactNode;
}

const PORTAL_LABEL: Record<string, string> = {
  patient: "Patient",
  provider: "Provider",
  pharmacy: "Pharmacy",
  laboratory: "Laboratory",
  logistics: "Logistics",
  manager: "Manager",
  admin: "Admin",
};

export function AppShell({ portal, brand, navItems, notifications = 0, searchSlot, children }: AppShellProps) {
  const { view, navigate: nav, sessionName, logout } = useNav();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Patient portal uses a bottom tab bar (mobile-first). Other portals use a
  // "More" sheet since they have more nav items.
  const isPatient = portal === "patient";

  // Bottom tab items: prefer items flagged mobile, fall back to first 4 + "More"
  const mobileTabItems = navItems.filter((i) => i.mobile).slice(0, 4);
  const primaryTabs = mobileTabItems.length > 0 ? mobileTabItems : navItems.slice(0, 4);
  const secondaryNavItems = navItems.filter((i) => !primaryTabs.includes(i));

  const SidebarContent = (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-sidebar-border">
        <div className="rounded-xl bg-primary p-2 shadow-soft">
          <Stethoscope className="h-4 w-4 text-primary-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-sm truncate leading-tight">{brand}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{PORTAL_LABEL[portal]} Portal</p>
        </div>
        <Button
          variant="ghost"
          size="iconSm"
          className="lg:hidden text-muted-foreground"
          onClick={() => setMobileNavOpen(false)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
        {navItems.map((item) => {
          const active = view.page === item.page;
          const Icon = item.icon;
          return (
            <button
              key={item.page}
              onClick={() => {
                nav(portal, item.page);
                setMobileNavOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all tap-highlight-none",
                active
                  ? "bg-primary text-primary-foreground shadow-soft"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              <span className="flex-1 text-left truncate">{item.label}</span>
              {item.badge ? (
                <Badge variant={active ? "secondary" : "outline"} className="h-5 px-1.5 text-[10px] font-semibold">
                  {item.badge}
                </Badge>
              ) : null}
            </button>
          );
        })}
      </nav>
      <div className="border-t border-sidebar-border p-3 safe-pb">
        <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground hover:text-foreground" onClick={logout}>
          <LogOut className="h-4 w-4 mr-2" /> Sign out
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Mobile header (compact, sticky) */}
      <header className="lg:hidden sticky top-0 z-30 safe-pt bg-background/90 backdrop-blur-md border-b border-border/60">
        <div className="flex h-14 items-center gap-2 px-3">
          {!isPatient && (
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 -ml-1"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
          )}
          <button onClick={() => nav(portal, "dashboard")} className="flex items-center gap-2 min-w-0">
            <div className="rounded-lg bg-primary/10 p-1.5 shrink-0">
              <Stethoscope className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0 text-left">
              <p className="font-bold text-sm leading-tight truncate">{brand}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider leading-tight">{PORTAL_LABEL[portal]}</p>
            </div>
          </button>
          <div className="flex-1" />
          {searchSlot}
          {notifications > 0 && (
            <button
              onClick={() => nav(portal, "notifications")}
              className="relative rounded-full p-2 hover:bg-accent tap-highlight-none"
              aria-label={`${notifications} notifications`}
            >
              <Bell className="h-5 w-5 text-muted-foreground" />
              <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                {notifications > 99 ? "99+" : notifications}
              </span>
            </button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="rounded-full hover:bg-accent p-0.5 tap-highlight-none" aria-label="Account menu">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary/10 text-primary text-[11px] font-semibold">
                    {initials(sessionName || "User")}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col">
                  <span className="text-sm font-medium leading-none truncate">{sessionName}</span>
                  <span className="text-xs text-muted-foreground mt-1">{PORTAL_LABEL[portal]} Portal</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => nav(portal, "settings")}>Settings</DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("public", "home")}>Back to site</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="text-rose-600 focus:text-rose-600">
                <LogOut className="h-4 w-4 mr-2" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Desktop header (full) */}
      <header className="hidden lg:flex sticky top-0 z-30 h-16 items-center gap-3 border-b border-border/60 bg-background/90 backdrop-blur-md px-6">
        <div className="lg:w-64 lg:shrink-0 -ml-2" />
        <div className="flex-1 flex items-center justify-end gap-1.5">
          {notifications > 0 && (
            <button
              onClick={() => nav(portal, "notifications")}
              className="relative rounded-full p-2 hover:bg-accent tap-highlight-none"
              aria-label={`${notifications} notifications`}
            >
              <Bell className="h-5 w-5 text-muted-foreground" />
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                {notifications > 99 ? "99+" : notifications}
              </span>
            </button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-accent tap-highlight-none">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary/10 text-primary text-[11px] font-semibold">
                    {initials(sessionName || "User")}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium max-w-[140px] truncate">{sessionName}</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col">
                  <span className="text-sm font-medium leading-none truncate">{sessionName}</span>
                  <span className="text-xs text-muted-foreground mt-1">{PORTAL_LABEL[portal]} Portal</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => nav(portal, "settings")}>Settings</DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("public", "home")}>Back to site</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="text-rose-600 focus:text-rose-600">
                <LogOut className="h-4 w-4 mr-2" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Mobile nav sheet (for non-patient portals) */}
      {!isPatient && (
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetContent side="left" className="w-72 p-0 [&>button]:hidden">
            <SheetTitle className="sr-only">Navigation menu</SheetTitle>
            {SidebarContent}
          </SheetContent>
        </Sheet>
      )}

      <div className="flex flex-1">
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex lg:w-64 lg:shrink-0 border-r border-border/60 bg-sidebar">
          <div className="sticky top-16 h-[calc(100vh-4rem)] w-full">{SidebarContent}</div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0">
          <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-8 lg:px-8 lg:py-10 pb-28 lg:pb-10">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile bottom tab bar (patient) */}
      {isPatient && (
        <BottomTabBar
          portal={portal}
          primaryTabs={primaryTabs}
          secondaryNavItems={secondaryNavItems}
          notifications={notifications}
        />
      )}

      <footer className="hidden lg:block border-t border-border/60 bg-background py-4 px-6 text-xs text-muted-foreground">
        <div className="mx-auto max-w-7xl flex items-center justify-between gap-2">
          <span>© {new Date().getFullYear()} Royal Palace Health Care — Prototype</span>
          <span className="flex items-center gap-3">
            <button onClick={() => navigate("public", "home")} className="hover:text-foreground">Home</button>
            <button onClick={() => navigate("public", "help")} className="hover:text-foreground">Help</button>
            <span className="text-muted-foreground/70">Synthetic data · Simulated services</span>
          </span>
        </div>
      </footer>
    </div>
  );
}

interface BottomTabBarProps {
  portal: string;
  primaryTabs: NavItem[];
  secondaryNavItems: NavItem[];
  notifications: number;
}

function BottomTabBar({ portal, primaryTabs, secondaryNavItems, notifications }: BottomTabBarProps) {
  const { view, navigate: nav } = useNav();
  const [moreOpen, setMoreOpen] = useState(false);

  const tabs: (NavItem | { label: "More"; page: "__more__"; icon: typeof Menu; badge?: number })[] = [
    ...primaryTabs,
    ...(secondaryNavItems.length > 0
      ? [{ label: "More" as const, page: "__more__" as const, icon: Menu, badge: notifications > 0 ? notifications : undefined }]
      : []),
  ];

  // Cap at 5 tabs total (4 primary + More)
  const finalTabs = tabs.slice(0, 5);

  return (
    <>
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-background/95 backdrop-blur-md border-t border-border/60 safe-pb">
        <div className="grid" style={{ gridTemplateColumns: `repeat(${finalTabs.length}, minmax(0, 1fr))` }}>
          {finalTabs.map((tab) => {
            const active = view.page === tab.page;
            const Icon = tab.icon;
            return (
              <button
                key={tab.page}
                onClick={() => {
                  if (tab.page === "__more__") setMoreOpen(true);
                  else nav(portal as any, tab.page);
                }}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 py-2.5 tap-highlight-none transition-colors relative",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                <span className="relative">
                  <Icon className={cn("h-[22px] w-[22px]", active && "stroke-[2.5]")} />
                  {tab.badge ? (
                    <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
                      {tab.badge > 99 ? "99+" : tab.badge}
                    </span>
                  ) : null}
                </span>
                <span className={cn("text-[10px] font-medium leading-none", active && "font-semibold")}>{tab.label}</span>
                {active && <span className="absolute top-0 inset-x-4 h-0.5 rounded-full bg-primary" />}
              </button>
            );
          })}
        </div>
      </nav>

      {moreOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex items-end" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative w-full bg-background rounded-t-3xl border-t shadow-soft-lg safe-pb"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <p className="font-semibold">More</p>
              <Button variant="ghost" size="iconSm" onClick={() => setMoreOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="px-3 pb-4 grid grid-cols-3 gap-2">
              {secondaryNavItems.map((item) => {
                const active = view.page === item.page;
                const Icon = item.icon;
                return (
                  <button
                    key={item.page}
                    onClick={() => {
                      nav(portal as any, item.page);
                      setMoreOpen(false);
                    }}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-2xl border p-3 text-center tap-highlight-none transition-colors",
                      active ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:bg-accent"
                    )}
                  >
                    <span className="relative">
                      <Icon className="h-6 w-6" />
                      {item.badge ? (
                        <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
                          {item.badge}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-[11px] font-medium leading-tight">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
