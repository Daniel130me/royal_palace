"use client";

import { cn } from "@/lib/utils";
import { useNav, navigate } from "@/lib/nav";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useState } from "react";
import { Menu, LogOut, Bell, ChevronDown, Stethoscope } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
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
}

interface AppShellProps {
  portal: "patient" | "provider" | "pharmacy" | "laboratory" | "logistics" | "admin";
  brand: string;
  navItems: NavItem[];
  notifications?: number;
  children: React.ReactNode;
}

const PORTAL_LABEL: Record<string, string> = {
  patient: "Patient Portal",
  provider: "Provider Portal",
  pharmacy: "Pharmacy Portal",
  laboratory: "Laboratory Portal",
  logistics: "Logistics Portal",
  admin: "Admin Console",
};

export function AppShell({ portal, brand, navItems, notifications = 0, children }: AppShellProps) {
  const { view, navigate: nav, sessionName, logout } = useNav();
  const [mobileOpen, setMobileOpen] = useState(false);

  const SidebarContent = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 py-4 border-b">
        <div className="rounded-lg bg-primary p-1.5">
          <Stethoscope className="h-5 w-5 text-primary-foreground" />
        </div>
        <div className="min-w-0">
          <p className="font-bold text-sm truncate">{brand}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{PORTAL_LABEL[portal]}</p>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {navItems.map((item) => {
          const active = view.page === item.page;
          const Icon = item.icon;
          return (
            <button
              key={item.page}
              onClick={() => {
                nav(portal, item.page);
                setMobileOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-left truncate">{item.label}</span>
              {item.badge ? (
                <Badge variant={active ? "secondary" : "outline"} className="h-5 px-1.5 text-[10px]">
                  {item.badge}
                </Badge>
              ) : null}
            </button>
          );
        })}
      </nav>
      <div className="border-t p-3">
        <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={logout}>
          <LogOut className="h-4 w-4 mr-2" /> Sign out
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      {/* Top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background px-3 sm:px-4">
        {/* Mobile menu */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="lg:hidden">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            {SidebarContent}
          </SheetContent>
        </Sheet>

        {/* Desktop sidebar trigger (always visible) */}
        <div className="hidden lg:flex lg:w-64 lg:shrink-0" />

        <div className="flex-1 flex items-center justify-end gap-2">
          {notifications > 0 && (
            <button
              onClick={() => nav(portal, "notifications")}
              className="relative rounded-md p-2 hover:bg-accent"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5 text-muted-foreground" />
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                {notifications > 99 ? "99+" : notifications}
              </span>
            </button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-accent">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                    {initials(sessionName || "User")}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden sm:block text-sm font-medium max-w-[120px] truncate">{sessionName}</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col">
                  <span className="text-sm font-medium leading-none">{sessionName}</span>
                  <span className="text-xs text-muted-foreground mt-1">{PORTAL_LABEL[portal]}</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => nav(portal, "settings")}>Settings</DropdownMenuItem>
              <DropdownMenuItem onClick={logout}>Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Desktop sidebar */}
        <aside className="hidden lg:block lg:w-64 lg:shrink-0 border-r bg-background">
          <div className="sticky top-14 h-[calc(100vh-3.5rem)]">{SidebarContent}</div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0">
          <div className="mx-auto max-w-7xl px-3 py-6 sm:px-6 sm:py-8">{children}</div>
        </main>
      </div>

      <footer className="border-t bg-background py-4 px-4 text-center text-xs text-muted-foreground">
        <div className="mx-auto max-w-7xl flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>© {new Date().getFullYear()} Royal Palace Health Care — Prototype</span>
          <span className="flex items-center gap-3">
            <Link href="#" onClick={(e) => { e.preventDefault(); navigate("public", "home"); }} className="hover:underline">Home</Link>
            <Link href="#" onClick={(e) => { e.preventDefault(); navigate("public", "help"); }} className="hover:underline">Help</Link>
            <span>Synthetic data · Simulated services</span>
          </span>
        </div>
      </footer>
    </div>
  );
}
