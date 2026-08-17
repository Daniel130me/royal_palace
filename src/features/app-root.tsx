"use client";

import { useNav } from "@/lib/nav";
import { useEffect, useState } from "react";
import { PublicSite } from "@/features/public/public-site";
import { LoginPage } from "@/features/auth/login-page";
import { SignupPage } from "@/features/auth/signup-page";
import { PersonaSwitcher } from "@/features/auth/persona-switcher";
import { PatientPortal } from "@/features/patient/patient-portal";
import { ProviderPortal } from "@/features/provider/provider-portal";
import { PharmacyPortal } from "@/features/pharmacy/pharmacy-portal";
import { LaboratoryPortal } from "@/features/laboratory/laboratory-portal";
import { LogisticsPortal } from "@/features/logistics/logistics-portal";
import { AdminPortal } from "@/features/admin/admin-portal";

export function AppRoot() {
  const { session, view } = useNav();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Guard: any portal other than public/login requires a session.
  const needsAuth = view.portal !== "public" && view.portal !== "login";
  const showLogin = needsAuth && !session;

  if (!mounted) {
    // Avoid SSR/CSR mismatch on hash-derived state.
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-foreground" />
      </div>
    );
  }

  return (
    <>
      {showLogin ? (
        <LoginPage />
      ) : view.portal === "public" ? (
        <PublicSite />
      ) : view.portal === "login" ? (
        view.page === "signup" ? <SignupPage /> : <LoginPage />
      ) : view.portal === "patient" ? (
        <PatientPortal />
      ) : view.portal === "provider" ? (
        <ProviderPortal />
      ) : view.portal === "pharmacy" ? (
        <PharmacyPortal />
      ) : view.portal === "laboratory" ? (
        <LaboratoryPortal />
      ) : view.portal === "logistics" ? (
        <LogisticsPortal />
      ) : view.portal === "admin" ? (
        <AdminPortal />
      ) : (
        <PublicSite />
      )}
      <PersonaSwitcher />
    </>
  );
}
