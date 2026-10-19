import { AlertTriangle, LockKeyhole } from "lucide-react";

import { PageHeader, SectionCard } from "@/components/healthcare/page-header";
import { Badge } from "@/components/ui/badge";

export function GovernedCapabilityPending({
  description,
  decisions,
  title,
}: {
  decisions: readonly string[];
  description: string;
  title: string;
}) {
  return (
    <div className="space-y-4">
      <PageHeader
        title={title}
        description={description}
        actions={<Badge variant="outline">Awaiting governed activation</Badge>}
      />
      <SectionCard title="Protected until policy approval" icon={LockKeyhole}>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
            <div>
              <p className="text-sm font-semibold">This approved capability remains in scope.</p>
              <p className="mt-1 text-xs leading-relaxed text-amber-800">
                It is intentionally read-only until the required rules are approved and can be
                enforced by the production API and database. No demo data or browser-only action is
                treated as real platform state.
              </p>
            </div>
          </div>
        </div>
        <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
          {decisions.map((decision) => (
            <li key={decision} className="flex gap-2">
              <span aria-hidden className="text-primary">
                •
              </span>
              <span>{decision}</span>
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}
