"use client";

import { useNav, navigate } from "@/lib/nav";
import { PublicHome } from "./pages/home";
import { PublicServices } from "./pages/services";
import { PublicProviders } from "./pages/providers";
import { PublicProviderProfile } from "./pages/provider-profile";
import { PublicPharmacies } from "./pages/pharmacies";
import { PublicLaboratories } from "./pages/laboratories";
import { PublicPricing } from "./pages/pricing";
import { PublicHowItWorks } from "./pages/how-it-works";
import { PublicHelp } from "./pages/help";
import { PublicLayout } from "./public-layout";

export function PublicSite() {
  const { view } = useNav();
  const page = view.page;
  return (
    <PublicLayout>
      {page === "services" ? (
        <PublicServices />
      ) : page === "providers" ? (
        <PublicProviders />
      ) : page === "provider" ? (
        <PublicProviderProfile />
      ) : page === "pharmacies" ? (
        <PublicPharmacies />
      ) : page === "laboratories" ? (
        <PublicLaboratories />
      ) : page === "pricing" ? (
        <PublicPricing />
      ) : page === "how-it-works" ? (
        <PublicHowItWorks />
      ) : page === "help" ? (
        <PublicHelp />
      ) : (
        <PublicHome />
      )}
    </PublicLayout>
  );
}
