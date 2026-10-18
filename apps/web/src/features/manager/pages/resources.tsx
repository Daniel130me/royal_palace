"use client";

import { ArrowRight, CheckCircle2, FileText, Link2, LifeBuoy, ShieldCheck } from "lucide-react";

import { PageHeader, SectionCard } from "@/components/healthcare/page-header";

const RESPONSIBILITIES = [
  {
    title: "Share approved referral links",
    body: "Use the purpose-specific patient or organization links issued to you. Applicants enter and submit their own information.",
  },
  {
    title: "Track referral outcomes",
    body: "Follow privacy-limited application status and your own earnings. Do not request or retain applicant records outside approved channels.",
  },
  {
    title: "Escalate support safely",
    body: "Open and follow a ticket using its reference, subject name, category, and only the minimum information needed to identify the issue.",
  },
  {
    title: "Protect confidential information",
    body: "Managers do not access clinical records, verification documents, organization accounts, patient payments, or Royal Palace gross revenue.",
  },
] as const;

export function ManagerResources() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Resources"
        description="Manager responsibilities, privacy boundaries, and support escalation guidance."
      />
      <SectionCard
        title="Manager responsibilities"
        icon={CheckCircle2}
        description="The approved operating model"
      >
        <ul className="space-y-3">
          {RESPONSIBILITIES.map((item) => (
            <li key={item.title} className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              <div>
                <p className="text-sm font-semibold">{item.title}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </SectionCard>
      <SectionCard
        title="How referrals work"
        icon={Link2}
        description="Attribution without portfolio access"
      >
        <ol className="space-y-2">
          <Step
            title="1 · Share a purpose-specific link"
            body="Choose the patient, hospital, pharmacy, or laboratory link created for the intended audience."
          />
          <Step
            title="2 · Applicant self-submits"
            body="The applicant completes the form directly. You do not collect documents or enter information on their behalf."
          />
          <Step
            title="3 · Royal Palace reviews"
            body="Support can request information; administrators alone approve, reject, or change verification status."
          />
          <Step
            title="4 · Track status and earnings"
            body="You see a minimal status reference and commission earned from eligible patient activity—not what the patient paid Royal Palace."
          />
        </ol>
      </SectionCard>
      <SectionCard
        title="Support escalation"
        icon={LifeBuoy}
        description="Minimum necessary disclosure"
      >
        <p className="text-sm leading-relaxed text-muted-foreground">
          Create a ticket with a short subject name, an optional non-sensitive reference, and the
          issue category. Royal Palace Support investigates using its authorized records. Follow up
          through the ticket ID; never paste health information, identity documents, payment
          credentials, or clinical details into a manager ticket.
        </p>
      </SectionCard>
      <SectionCard title="Programme documents" icon={FileText} description="Controlled publication">
        <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/30 p-4">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <p className="text-sm leading-relaxed text-muted-foreground">
            Only current, administrator-published programme documents will appear here. The
            application does not claim that an agreement was accepted and does not expose
            placeholder downloads.
          </p>
        </div>
      </SectionCard>
    </div>
  );
}

function Step({ title, body }: { title: string; body: string }) {
  return (
    <li className="flex items-start gap-3 rounded-xl border border-border/60 p-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
      </div>
      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/50" />
    </li>
  );
}
