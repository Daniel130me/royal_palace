"use client";

import { navigate } from "@/lib/nav";
import { Button } from "@/components/ui/button";
import { Stethoscope, Menu, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useNav } from "@/lib/nav";

const NAV = [
  { label: "Home", page: "home" },
  { label: "Services", page: "services" },
  { label: "Find Doctors", page: "providers" },
  { label: "Pharmacies", page: "pharmacies" },
  { label: "Laboratories", page: "laboratories" },
  { label: "Pricing", page: "pricing" },
  { label: "How it works", page: "how-it-works" },
  { label: "Help", page: "help" },
];

export function PublicLayout({ children }: { children: React.ReactNode }) {
  const { view, session, sessionName, logout } = useNav();
  const [open, setOpen] = useState(false);
  const page = view.page;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 h-14 flex items-center justify-between">
          <button onClick={() => navigate("public", "home")} className="flex items-center gap-2">
            <div className="rounded-lg bg-emerald-600 p-1.5">
              <Stethoscope className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold">Royal Palace Health Care</span>
          </button>

          <nav className="hidden lg:flex items-center gap-1">
            {NAV.map((n) => (
              <button
                key={n.page}
                onClick={() => navigate("public", n.page)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  page === n.page ? "bg-emerald-50 text-emerald-700" : "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
              >
                {n.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {session ? (
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => navigate(useNav.getState().session?.role === "doctor" ? "provider" : (useNav.getState().session?.role as any) ?? "public", "dashboard")}>
                Go to dashboard
              </Button>
            ) : (
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => navigate("login", "login")}>
                Sign in
              </Button>
            )}
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen((o) => !o)}>
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>
        {open && (
          <div className="lg:hidden border-t bg-background">
            <nav className="mx-auto max-w-7xl px-4 py-2 grid grid-cols-2 gap-1">
              {NAV.map((n) => (
                <button
                  key={n.page}
                  onClick={() => { navigate("public", n.page); setOpen(false); }}
                  className={cn("rounded-md px-3 py-2 text-sm text-left", page === n.page ? "bg-emerald-50 text-emerald-700" : "text-muted-foreground hover:bg-accent")}
                >
                  {n.label}
                </button>
              ))}
            </nav>
          </div>
        )}
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t bg-muted/30">
        <div className="mx-auto max-w-7xl px-4 py-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="rounded-lg bg-emerald-600 p-1.5">
                <Stethoscope className="h-4 w-4 text-white" />
              </div>
              <span className="font-bold">Royal Palace Health Care</span>
            </div>
            <p className="text-sm text-muted-foreground">
              A managed healthcare platform connecting consultations, records, laboratory, pharmacy and delivery.
            </p>
          </div>
          <div>
            <p className="font-semibold text-sm mb-2">Services</p>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li><button className="hover:text-foreground" onClick={() => navigate("public", "services")}>All services</button></li>
              <li><button className="hover:text-foreground" onClick={() => navigate("public", "providers")}>Find a doctor</button></li>
              <li><button className="hover:text-foreground" onClick={() => navigate("public", "laboratories")}>Laboratory tests</button></li>
              <li><button className="hover:text-foreground" onClick={() => navigate("public", "pharmacies")}>Pharmacy</button></li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-sm mb-2">Platform</p>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li><button className="hover:text-foreground" onClick={() => navigate("public", "how-it-works")}>How it works</button></li>
              <li><button className="hover:text-foreground" onClick={() => navigate("public", "pricing")}>Pricing</button></li>
              <li><button className="hover:text-foreground" onClick={() => navigate("public", "help")}>Help & support</button></li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-sm mb-2">Get started</p>
            <Button className="bg-emerald-600 hover:bg-emerald-700 w-full" onClick={() => navigate("login", "login")}>Sign in</Button>
            <p className="mt-3 text-xs text-muted-foreground">Synthetic data · Simulated services · Prototype only</p>
          </div>
        </div>
        <div className="border-t py-4 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Royal Palace Health Care — Prototype. All data is fictional.
        </div>
      </footer>
    </div>
  );
}
