"use client";

import { useEffect, useState } from "react";
import { laboratoryService } from "@/lib/services";
import type { Laboratory } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { MapPin, Phone, Star, FlaskConical, ShieldCheck } from "lucide-react";
import { PageHeader, LoadingState, EmptyState } from "@/components/healthcare/page-header";

export function PublicLaboratories() {
  const [items, setItems] = useState<Laboratory[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    laboratoryService.list().then((p) => { setItems(p); setLoading(false); });
  }, []);
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <PageHeader title="Laboratories" description="Verified diagnostic laboratories for your tests." />
      {loading ? <LoadingState /> : items.length === 0 ? <EmptyState icon={FlaskConical} title="No laboratories yet" /> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => (
            <Card key={p.id}>
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-violet-100 p-2.5"><FlaskConical className="h-5 w-5 text-violet-600" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{p.name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                      <ShieldCheck className="h-3 w-3 text-emerald-500" /> Verified
                      <span>·</span><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{p.rating}
                    </div>
                  </div>
                </div>
                <div className="mt-4 space-y-1 text-sm text-muted-foreground">
                  <p className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{p.address}</p>
                  <p className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{p.phone}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
