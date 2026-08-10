"use client";

import { useNav, navigate } from "@/lib/nav";
import { usePharmacyContext } from "../use-pharmacy-context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { PageHeader, SectionCard, BottomActionBar, LoadingState, ErrorState } from "@/components/healthcare/page-header";
import { MiniMetric } from "@/components/healthcare/metric-card";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { initials } from "@/lib/format";
import { Building2, MapPin, Phone, Mail, Star, ShieldAlert, LogOut, Receipt } from "lucide-react";
import { toast } from "sonner";

export function PharmacySettings() {
  const { profile, loading, error, refresh, unread, orders, prescriptions } = usePharmacyContext();
  const { logout } = useNav();

  if (loading) return <LoadingState label="Loading settings…" />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;
  if (!profile) return <ErrorState message="Pharmacy profile not found." />;

  return (
    <div className="pb-28 lg:pb-0 space-y-6">
      <PageHeader
        title="Pharmacy settings"
        description="View your pharmacy profile and platform configuration."
      />

      <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
        <div className="lg:col-span-2 space-y-6">
          {/* Profile card with avatar header */}
          <SectionCard title="Pharmacy profile" icon={Building2}>
            <div className="flex items-center gap-3 mb-4 pb-4 border-b border-border/60">
              <Avatar className="h-14 w-14 shrink-0">
                <AvatarFallback className="bg-primary/10 text-primary text-base font-semibold">
                  {initials(profile.name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-base truncate">{profile.name}</p>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">{profile.pharmacyNumber}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <StatusBadge status={profile.verificationStatus} size="sm" />
                  <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                    <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
                    {profile.rating.toFixed(1)}
                  </span>
                </div>
              </div>
            </div>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wider">Phone</dt>
                <dd className="font-medium mt-0.5 flex items-center gap-1.5">
                  <Phone className="h-3 w-3 text-muted-foreground" /> {profile.phone}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wider">Email</dt>
                <dd className="font-medium mt-0.5 flex items-center gap-1.5 truncate">
                  <Mail className="h-3 w-3 text-muted-foreground" /> {profile.email}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-muted-foreground uppercase tracking-wider">Address</dt>
                <dd className="font-medium mt-0.5 flex items-center gap-1.5">
                  <MapPin className="h-3 w-3 text-muted-foreground" /> {profile.address}, {profile.city}, {profile.state}
                </dd>
              </div>
            </dl>
          </SectionCard>

          <SectionCard title="Contact information" description="Editable fields">
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" defaultValue={profile.phone} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" defaultValue={profile.email} />
              </div>
              <Button
                variant="outline"
                onClick={() => toast.info("Profile updates are disabled in this prototype.")}
              >
                Save changes
              </Button>
            </div>
          </SectionCard>
        </div>

        <div className="space-y-6">
          <Card className="border-sky-200 bg-sky-50/40">
            <CardContent className="p-4">
              <p className="text-sm font-semibold text-sky-900 flex items-center gap-2 mb-1.5">
                <ShieldAlert className="h-4 w-4" /> Platform commission
              </p>
              <div className="flex justify-between items-center">
                <span className="text-xs text-sky-700">Platform rate</span>
                <span className="font-bold text-lg text-sky-900">{profile.commissionPct}%</span>
              </div>
              <p className="text-xs text-sky-700 mt-1 leading-relaxed">
                Set by Royal Palace admin. Cannot be edited by the pharmacy.
              </p>
              <Button variant="outline" size="sm" className="w-full mt-3" onClick={() => navigate("pharmacy", "commissions")}>
                <Receipt className="h-3.5 w-3.5 mr-1" /> View commission reports
              </Button>
            </CardContent>
          </Card>

          <SectionCard title="Account summary" icon={Building2}>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <MiniMetric label="Orders" value={orders.length} tone="info" />
              <MiniMetric label="Prescriptions" value={prescriptions.length} tone="violet" />
              <MiniMetric label="Unread" value={unread} tone={unread > 0 ? "warning" : "default"} />
              <MiniMetric label="Rating" value={`★ ${profile.rating.toFixed(1)}`} tone="success" />
            </div>
            <Separator className="my-2" />
            <Button variant="outline" size="sm" className="w-full" onClick={() => navigate("pharmacy", "dashboard")}>
              Back to dashboard
            </Button>
          </SectionCard>

          <Card className="hidden lg:block">
            <CardContent className="p-4">
              <Button variant="outline" className="w-full text-rose-700 hover:bg-rose-50 hover:text-rose-800" onClick={logout}>
                <LogOut className="h-4 w-4 mr-2" /> Sign out
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Mobile bottom action bar */}
      <BottomActionBar className="lg:hidden">
        <Button variant="outline" className="w-full text-rose-700 hover:bg-rose-50 hover:text-rose-800" onClick={logout}>
          <LogOut className="h-4 w-4" /> Sign out
        </Button>
      </BottomActionBar>
    </div>
  );
}
