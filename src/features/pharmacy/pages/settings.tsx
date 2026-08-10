"use client";

import { useNav, navigate } from "@/lib/nav";
import { usePharmacyContext } from "../use-pharmacy-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader, LoadingState, ErrorState } from "@/components/healthcare/page-header";
import { StatusBadge } from "@/components/healthcare/status-badge";
import { formatCurrency } from "@/lib/format";
import { Building2, MapPin, Phone, Mail, Star, ShieldAlert, LogOut } from "lucide-react";
import { toast } from "sonner";

export function PharmacySettings() {
  const { profile, loading, error, refresh, pharmacyId, unread, orders, prescriptions } = usePharmacyContext();
  const { logout } = useNav();

  if (loading) return <LoadingState label="Loading settings…" />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;
  if (!profile) return <ErrorState message="Pharmacy profile not found." />;

  return (
    <div>
      <PageHeader
        title="Pharmacy settings"
        description="View your pharmacy profile and platform configuration."
        breadcrumbs={[{ label: "Pharmacy" }, { label: "Settings" }]}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4 text-emerald-500" /> Pharmacy profile
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-muted-foreground">Pharmacy name</dt>
                  <dd className="font-medium">{profile.name}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Pharmacy number</dt>
                  <dd className="font-medium font-mono">{profile.pharmacyNumber}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Verification</dt>
                  <dd><StatusBadge status={profile.verificationStatus} /></dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Rating</dt>
                  <dd className="font-medium flex items-center gap-1">
                    <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                    {profile.rating.toFixed(1)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Phone</dt>
                  <dd className="font-medium flex items-center gap-1">
                    <Phone className="h-3 w-3" /> {profile.phone}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Email</dt>
                  <dd className="font-medium flex items-center gap-1 truncate">
                    <Mail className="h-3 w-3" /> {profile.email}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">Address</dt>
                  <dd className="font-medium flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {profile.address}, {profile.city}, {profile.state}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Contact information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
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
            </CardContent>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <Card className="border-sky-200 bg-sky-50/40">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-sky-900 flex items-center gap-2">
                <ShieldAlert className="h-4 w-4" /> Platform commission
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2 text-sky-900">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Platform rate</span>
                <span className="font-bold text-lg">{profile.commissionPct}%</span>
              </div>
              <p className="text-xs text-sky-700">
                Set by Royal Palace admin. Cannot be edited by the pharmacy.
              </p>
              <Button variant="outline" size="sm" className="w-full mt-2" onClick={() => navigate("pharmacy", "commissions")}>
                View commission reports
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Account summary</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total orders</span>
                <span className="font-medium">{orders.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total prescriptions</span>
                <span className="font-medium">{prescriptions.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Unread notifications</span>
                <span className="font-medium">{unread}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <Button variant="outline" className="w-full text-rose-700 hover:bg-rose-50 hover:text-rose-800" onClick={logout}>
                <LogOut className="h-4 w-4 mr-2" /> Sign out
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
