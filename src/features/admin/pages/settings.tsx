"use client";

import { useEffect, useState } from "react";
import { navigate } from "@/lib/nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/healthcare/page-header";
import { toast } from "sonner";
import { Settings as SettingsIcon, Save, Phone, Mail, Globe, Percent, AlertTriangle } from "lucide-react";

const STORAGE_KEY = "royalPalaceAdminSettings";

interface PlatformSettings {
  defaultCurrency: string;
  supportPhone: string;
  supportEmail: string;
  defaultPharmacyCommission: string;
  defaultProviderMargin: string;
  defaultLabMargin: string;
  defaultLogisticsMargin: string;
  maintenanceMode: boolean;
}

const DEFAULTS: PlatformSettings = {
  defaultCurrency: "NGN",
  supportPhone: "+234 800 ROYAL",
  supportEmail: "support@royalpalace.health",
  defaultPharmacyCommission: "8",
  defaultProviderMargin: "27",
  defaultLabMargin: "25",
  defaultLogisticsMargin: "20",
  maintenanceMode: false,
};

function loadSettings(): PlatformSettings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

export function AdminSettings() {
  const [settings, setSettings] = useState<PlatformSettings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSettings(loadSettings());
    setLoaded(true);
  }, []);

  const update = (key: keyof PlatformSettings, value: string | boolean) => {
    setSettings((s) => ({ ...s, [key]: value }));
  };

  const save = () => {
    setSaving(true);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      toast.success("Platform settings saved.");
    } catch {
      toast.error("Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setSettings(DEFAULTS);
    window.localStorage.removeItem(STORAGE_KEY);
    toast.success("Settings reset to defaults.");
  };

  if (!loaded) return null;

  return (
    <div>
      <PageHeader
        title="Platform Settings"
        description="Configure platform-wide defaults. Saved to local storage for this prototype."
        breadcrumbs={[{ label: "Admin", onClick: () => navigate("admin", "dashboard") }, { label: "Settings" }]}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={reset} disabled={saving}>Reset</Button>
            <Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              <Save className="h-4 w-4 mr-1" /> {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        }
      />

      {settings.maintenanceMode && (
        <Card className="mb-6 border-amber-300 bg-amber-50">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800">Maintenance mode is ON</p>
              <p className="text-xs text-amber-700">New bookings are disabled in this mode. The platform remains read-only for existing data.</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Localisation & contact */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Globe className="h-4 w-4" /> Localisation &amp; support</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="currency" className="text-xs">Default currency</Label>
              <Select value={settings.defaultCurrency} onValueChange={(v) => update("defaultCurrency", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NGN">NGN — Nigerian Naira (₦)</SelectItem>
                  <SelectItem value="USD">USD — US Dollar</SelectItem>
                  <SelectItem value="GBP">GBP — British Pound</SelectItem>
                  <SelectItem value="EUR">EUR — Euro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone" className="text-xs flex items-center gap-1"><Phone className="h-3 w-3" /> Support phone</Label>
              <Input id="phone" value={settings.supportPhone} onChange={(e) => update("supportPhone", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs flex items-center gap-1"><Mail className="h-3 w-3" /> Support email</Label>
              <Input id="email" type="email" value={settings.supportEmail} onChange={(e) => update("supportEmail", e.target.value)} />
            </div>
          </CardContent>
        </Card>

        {/* Commission defaults */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Percent className="h-4 w-4" /> Commission &amp; margin defaults</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rxComm" className="text-xs">Default pharmacy commission (%)</Label>
              <Input id="rxComm" type="number" step="0.1" value={settings.defaultPharmacyCommission} onChange={(e) => update("defaultPharmacyCommission", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="provMargin" className="text-xs">Default provider margin (%)</Label>
              <Input id="provMargin" type="number" step="0.1" value={settings.defaultProviderMargin} onChange={(e) => update("defaultProviderMargin", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="labMargin" className="text-xs">Default laboratory margin (%)</Label>
              <Input id="labMargin" type="number" step="0.1" value={settings.defaultLabMargin} onChange={(e) => update("defaultLabMargin", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="logMargin" className="text-xs">Default logistics margin (%)</Label>
              <Input id="logMargin" type="number" step="0.1" value={settings.defaultLogisticsMargin} onChange={(e) => update("defaultLogisticsMargin", e.target.value)} />
            </div>
            <div className="sm:col-span-2 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
              These defaults are applied when onboarding new entities. Individual overrides remain in effect for existing accounts.
            </div>
          </CardContent>
        </Card>

        {/* Platform controls */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><SettingsIcon className="h-4 w-4" /> Platform controls</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-accent/40">
              <input
                type="checkbox"
                checked={settings.maintenanceMode}
                onChange={(e) => update("maintenanceMode", e.target.checked)}
                className="mt-0.5"
              />
              <div>
                <p className="text-sm font-medium">Maintenance mode</p>
                <p className="text-xs text-muted-foreground">Disables new bookings while preserving read access.</p>
              </div>
            </label>
            <div className="rounded-lg border p-3">
              <p className="text-sm font-medium">Audit retention</p>
              <p className="text-xs text-muted-foreground mt-1">7 years (regulatory compliance)</p>
              <Button variant="ghost" size="sm" className="mt-2 px-0">View retention policy</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
