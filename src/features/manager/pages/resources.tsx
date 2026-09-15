"use client";

// Resources page (plan §3.1): the Manager responsibilities checklist, the
// support routing guide and the (simulated) agreement documents. Static
// content only — no fabricated external links anywhere on this page.

import { PageHeader, SectionCard } from "@/components/healthcare/page-header";
import { Button } from "@/components/ui/button";
import { ManagerStatusBadge } from "../components/manager-shared";
import {
  ArrowRight, Building2, CheckCircle2, Download, FileText, FlaskConical,
  Landmark, LifeBuoy, ShieldCheck, Users,
} from "lucide-react";

const RESPONSIBILITIES = [
  {
    title: "Acquire & onboard organizations",
    body: "Bring pharmacies and laboratories onto the Royal Palace platform: applications, business verification details and activation follow-up.",
  },
  {
    title: "Monitor non-clinical status",
    body: "Keep an eye on each portfolio organization's account, verification and payment status. Managers never access patient or clinical data.",
  },
  {
    title: "Provide first-level support",
    body: "Own Level 1 support for your portfolio: investigate tickets, ask the organization for details, and resolve account or billing questions.",
  },
  {
    title: "Escalate to Royal Palace",
    body: "Anything you cannot resolve goes to Royal Palace with a clear reason — it is then routed to Finance, Technical, Operations or Compliance.",
  },
];

const AGREEMENTS = [
  {
    title: "Manager Services Agreement",
    description: "The master agreement covering your role, portfolio responsibilities and conduct on the platform.",
    accepted: true,
  },
  {
    title: "Revenue Share Schedule",
    description: "The schedule of revenue share rates applied per organization type and transaction type.",
    accepted: true,
  },
  {
    title: "Support & Escalation Addendum",
    description: "The service expectations for first-level support, response windows and escalation handling.",
    accepted: true,
  },
];

export function ManagerResources() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Resources"
        description="Your responsibilities, how support routing works and your signed agreements."
      />

      {/* Responsibilities checklist */}
      <SectionCard title="Manager responsibilities" icon={CheckCircle2} description="What Royal Palace expects from every Manager">
        <ul className="space-y-3">
          {RESPONSIBILITIES.map((r) => (
            <li key={r.title} className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold">{r.title}</p>
                <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">{r.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </SectionCard>

      {/* Support routing guide */}
      <SectionCard
        title="How support routing works"
        icon={LifeBuoy}
        description="Pharmacy / Laboratory → Manager (Level 1) → Royal Palace (Level 2) → specialist departments"
      >
        <ol className="space-y-2">
          <RoutingStep
            icon={Building2}
            tone="bg-primary/10 text-primary"
            title="1 · Organization raises a ticket"
            body="A pharmacy or laboratory opens a support ticket about a non-clinical issue (account, payments, platform)."
          />
          <RoutingStep
            icon={Users}
            tone="bg-sky-50 text-sky-700"
            title="2 · Manager — Level 1"
            body="You investigate as the first line of support, working directly with the organization on your portfolio."
          />
          <RoutingStep
            icon={LifeBuoy}
            tone="bg-amber-50 text-amber-700"
            title="3 · Royal Palace — Level 2"
            body="Unresolved tickets are escalated to Royal Palace with your reason. They investigate and coordinate the outcome."
          />
          <RoutingStep
            icon={ShieldCheck}
            tone="bg-violet-50 text-violet-700"
            title="4 · Specialist departments"
            body="Royal Palace routes the issue to Finance, Technical, Operations or Compliance, then the resolution flows back down the same chain."
          />
        </ol>
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-border/60 bg-muted/30 p-3">
          <FlaskConical className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Tickets keep their organization, manager and department trail so every side can see where an issue currently sits — statuses are shown identically across the Manager and Admin portals.
          </p>
        </div>
      </SectionCard>

      {/* Agreement placeholders */}
      <SectionCard
        title="Agreements"
        icon={FileText}
        description="Signed agreements on file with Royal Palace"
      >
        <div className="space-y-2">
          {AGREEMENTS.map((a) => (
            <div key={a.title} className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-border/60 p-3">
              <div className="rounded-lg bg-primary/10 p-2 shrink-0 self-start">
                <Landmark className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold">{a.title}</p>
                  <ManagerStatusBadge status="approved" label="Accepted" />
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{a.description}</p>
              </div>
              <Button size="sm" variant="outline" disabled className="shrink-0">
                <Download className="h-4 w-4" /> Download agreement (PDF placeholder)
              </Button>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Agreement acceptance is simulated in this prototype — the documents above are placeholders and downloads are disabled. In production these would be versioned PDFs with countersignature tracking.
        </p>
      </SectionCard>
    </div>
  );
}

function RoutingStep({ icon: Icon, tone, title, body }: { icon: React.ComponentType<{ className?: string }>; tone: string; title: string; body: string }) {
  return (
    <li className="flex items-start gap-3">
      <div className={`rounded-lg p-2 shrink-0 ${tone}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1 border-b border-border/40 pb-2 last:border-0">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">{body}</p>
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground/40 shrink-0 mt-2 hidden sm:block" />
    </li>
  );
}
