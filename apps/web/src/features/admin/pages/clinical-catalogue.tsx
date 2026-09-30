"use client";

import type { ClinicalCatalogueEntry } from "@royal-palace/contracts";
import { BookOpen, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from "@/components/healthcare/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { clinicalCatalogueService } from "@/lib/services";

type CatalogueCollection = "professions" | "specialties";

export function AdminClinicalCatalogue() {
  const [collection, setCollection] = useState<CatalogueCollection>("specialties");
  const [entries, setEntries] = useState<readonly ClinicalCatalogueEntry[]>([]);
  const [endCursor, setEndCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    category: "",
    code: "",
    description: "",
    name: "",
    sourceUri: "",
  });

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    clinicalCatalogueService
      .list(collection)
      .then((response) => {
        setEntries(response.data);
        setEndCursor(response.pageInfo.endCursor);
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Catalogue could not be loaded."),
      )
      .finally(() => setLoading(false));
  }, [collection]);
  useEffect(() => {
    load();
  }, [load]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const entry = await clinicalCatalogueService.create(collection, {
        ...(collection === "specialties" ? { category: form.category } : {}),
        code: form.code,
        description: form.description || null,
        name: form.name,
        sourceUri: form.sourceUri || null,
      });
      setEntries((current) =>
        [...current, entry].sort((left, right) => left.name.localeCompare(right.name)),
      );
      setForm({ category: "", code: "", description: "", name: "", sourceUri: "" });
      toast.success("Catalogue entry created.");
    } catch (reason) {
      toast.error(
        reason instanceof Error ? reason.message : "Catalogue entry could not be created.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function loadMore() {
    if (endCursor === null) return;
    setBusy(true);
    try {
      const response = await clinicalCatalogueService.list(collection, endCursor);
      setEntries((current) => [...current, ...response.data]);
      setEndCursor(response.pageInfo.endCursor);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "More entries could not be loaded.");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(entry: ClinicalCatalogueEntry) {
    setBusy(true);
    try {
      const updated = await clinicalCatalogueService.update(
        collection,
        entry,
        entry.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
      );
      setEntries((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (reason) {
      toast.error(
        reason instanceof Error ? reason.message : "Catalogue entry could not be updated.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Clinical catalogue"
        description="Administrator-governed professions and specialties. Entries are deactivated, never deleted, so historical records remain valid."
      />
      <div className="flex gap-2">
        <Button
          variant={collection === "specialties" ? "default" : "outline"}
          onClick={() => setCollection("specialties")}
        >
          Specialties
        </Button>
        <Button
          variant={collection === "professions" ? "default" : "outline"}
          onClick={() => setCollection("professions")}
        >
          Professions
        </Button>
      </div>
      <Card>
        <CardContent className="p-5">
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={create}>
            <Field label="Code">
              <Input
                value={form.code}
                onChange={(event) =>
                  setForm((current) => ({ ...current, code: event.target.value.toLowerCase() }))
                }
                placeholder="cardiology"
                required
              />
            </Field>
            <Field label="Name">
              <Input
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
                required
              />
            </Field>
            {collection === "specialties" ? (
              <Field label="Category">
                <Input
                  value={form.category}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, category: event.target.value }))
                  }
                  required
                />
              </Field>
            ) : null}
            <Field label="Authoritative source URL (optional)">
              <Input
                type="url"
                value={form.sourceUri}
                onChange={(event) =>
                  setForm((current) => ({ ...current, sourceUri: event.target.value }))
                }
              />
            </Field>
            <Field label="Description" wide>
              <Textarea
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({ ...current, description: event.target.value }))
                }
              />
            </Field>
            <Button type="submit" disabled={busy}>
              <Plus className="h-4 w-4" /> Add entry
            </Button>
          </form>
        </CardContent>
      </Card>
      {loading ? (
        <LoadingState label="Loading catalogue…" />
      ) : error !== null ? (
        <ErrorState message={error} onRetry={load} />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No catalogue entries"
          description="Add the first governed entry above."
        />
      ) : (
        <Card>
          <CardContent className="divide-y p-0">
            {entries.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-semibold">{entry.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {entry.code}
                    {entry.category === null ? "" : ` · ${entry.category}`} · v{entry.version}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void toggle(entry)}
                >
                  {entry.status === "ACTIVE" ? "Deactivate" : "Activate"}
                </Button>
              </div>
            ))}
            {endCursor !== null ? (
              <div className="p-4 text-center">
                <Button variant="outline" disabled={busy} onClick={() => void loadMore()}>
                  Load more
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Field({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1.5 ${wide ? "sm:col-span-2" : ""}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
