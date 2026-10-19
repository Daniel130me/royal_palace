"use client";

import {
  Activity,
  AlertTriangle,
  BarChart3,
  Stethoscope,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { CompactListItem, StatTile } from "@/components/healthcare/compact-list";
import {
  EmptyState,
  ErrorState,
  PageHeader,
  SectionCard,
  SkeletonGrid,
} from "@/components/healthcare/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatMinorCurrency } from "@/lib/format";
import { navigate } from "@/lib/nav";
import { administrationService, productionOrganizationFinanceService } from "@/lib/services";

type OperationalReport = Awaited<ReturnType<typeof administrationService.operationalReport>>;
type FinancePeriod = Awaited<
  ReturnType<typeof productionOrganizationFinanceService.admin.advancedReport>
>["data"][number];

const REPORT_DAYS = 14;
const CATEGORY_COLORS = ["#10b981", "#f59e0b", "#0ea5e9", "#8b5cf6"];

export function AdminReports() {
  const [report, setReport] = useState<OperationalReport | null>(null);
  const [financePeriods, setFinancePeriods] = useState<FinancePeriod[]>([]);
  const [currency, setCurrency] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { from, to } = reportRange();
    try {
      const [operations, finance] = await Promise.all([
        administrationService.operationalReport({ from, to }),
        productionOrganizationFinanceService.admin.advancedReport(from, to, "DAY"),
      ]);
      setReport(operations);
      setFinancePeriods([...finance.data]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Reports could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => void load(), [load]);

  const currencies = useMemo(
    () => reportCurrencies(report, financePeriods),
    [financePeriods, report],
  );
  useEffect(() => {
    if (currencies.length > 0 && !currencies.includes(currency)) setCurrency(currencies[0]!);
  }, [currencies, currency]);

  const view = useMemo(() => buildReportView(report, currency), [currency, report]);

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-9 w-48 animate-pulse rounded-lg bg-muted" />
        <SkeletonGrid count={4} />
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="h-64 animate-pulse rounded-2xl bg-muted/40" />
          <div className="h-64 animate-pulse rounded-2xl bg-muted/40" />
        </div>
      </div>
    );
  }
  if (error !== null) return <ErrorState message={error} onRetry={() => void load()} />;
  if (report === null) return <ErrorState message="The operational report is unavailable." />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports & Insights"
        description="Bounded operational and financial trends from production records."
        breadcrumbs={[
          { label: "Admin", onClick: () => navigate("admin", "dashboard") },
          { label: "Reports" },
        ]}
        actions={
          currencies.length > 0 ? (
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger className="w-36" aria-label="Report currency">
                <SelectValue placeholder="Currency" />
              </SelectTrigger>
              <SelectContent>
                {currencies.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatTile
          label="Net payment volume"
          value={formatAmount(view.netPayments, currency)}
          icon={TrendingUp}
          tone="success"
        />
        <StatTile
          label="Refunded"
          value={formatAmount(view.refunded, currency)}
          icon={Activity}
          tone="warning"
        />
        <StatTile
          label="Avg transaction"
          value={formatAmount(view.averagePayment, currency)}
          icon={WalletCards}
          tone="info"
        />
        <StatTile
          label="Top provider appts"
          value={report.topPractitioners[0]?.appointmentCount ?? 0}
          icon={Stethoscope}
          tone="violet"
        />
      </div>

      <SectionCard title={`Audited finance summary · last ${REPORT_DAYS} days`} icon={WalletCards}>
        {financePeriods.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No immutable organization earnings have been recorded in this period.
          </p>
        ) : (
          <div className="space-y-3">
            {financePeriods.map((period) => (
              <div
                key={`${period.periodStart}-${period.currency}`}
                className="grid gap-2 rounded-xl border border-border/60 p-3 text-sm sm:grid-cols-5"
              >
                <div>
                  <p className="text-xs text-muted-foreground">Period / currency</p>
                  <p className="font-semibold">
                    {new Date(period.periodStart).toLocaleDateString()} · {period.currency}
                  </p>
                </div>
                <ReportAmount
                  label="Gross"
                  value={period.grossAmountMinor}
                  currency={period.currency}
                />
                <ReportAmount
                  label="Payable"
                  value={period.payableAmountMinor}
                  currency={period.currency}
                />
                <ReportAmount
                  label="Paid out"
                  value={period.paidAmountMinor}
                  currency={period.currency}
                />
                <div>
                  <p className="text-xs text-muted-foreground">Exceptions</p>
                  <p className="flex items-center gap-1 font-semibold">
                    {period.failedPayoutCount + period.reconciliationCount > 0 ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                    ) : null}
                    {period.failedPayoutCount} failed · {period.reconciliationCount} reconcile
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title={`Consultations · last ${REPORT_DAYS} days`} icon={BarChart3}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={view.consultations} margin={{ top: 5, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={1} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#10b981" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>
        <SectionCard
          title={`Cumulative net payments${currency ? ` · ${currency}` : ""}`}
          icon={TrendingUp}
        >
          {view.paymentTrend.length === 0 ? (
            <ChartEmpty />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={view.paymentTrend} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={1} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(value: number) => formatChartAmount(value, currency)} />
                <Line
                  type="monotone"
                  dataKey="cumulative"
                  stroke="#0ea5e9"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title={`Organization earnings by entity${currency ? ` · ${currency}` : ""}`}
          icon={Activity}
        >
          {view.organizationFinance.length === 0 ? (
            <ChartEmpty />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={view.organizationFinance}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={(entry) => entry.name}
                >
                  {view.organizationFinance.map((entry, index) => (
                    <Cell key={entry.name} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => formatChartAmount(value, currency)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
        <SectionCard title="Appointment status mix" icon={BarChart3}>
          {view.statuses.length === 0 ? (
            <ChartEmpty />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={view.statuses}
                layout="vertical"
                margin={{ top: 5, right: 16, left: 8, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={110} />
                <Tooltip />
                <Bar dataKey="value" fill="#8b5cf6" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Top providers" icon={Stethoscope} dense>
        {report.topPractitioners.length === 0 ? (
          <EmptyState icon={Stethoscope} title="No provider activity yet" compact />
        ) : (
          <div className="divide-y divide-border/40">
            {report.topPractitioners.map((provider, index) => {
              const total = provider.paymentTotals.find((item) => item.currency === currency);
              return (
                <CompactListItem
                  key={provider.id}
                  leading={
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${index === 0 ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground"}`}
                    >
                      {index + 1}
                    </div>
                  }
                  title={provider.displayName}
                  subtitle={provider.primarySpecialty ?? "Specialty not listed"}
                  trailing={
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-sm font-semibold">
                        {provider.appointmentCount} appts
                      </span>
                      <span className="text-xs text-emerald-700">
                        {total === undefined
                          ? "No selected-currency volume"
                          : `${formatMinorCurrency(total.amountMinor, total.currency)} net`}
                      </span>
                    </div>
                  }
                />
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function reportRange() {
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - REPORT_DAYS);
  return { from: from.toISOString(), to: to.toISOString() };
}

function reportCurrencies(report: OperationalReport | null, finance: readonly FinancePeriod[]) {
  const values = new Set<string>();
  report?.payments.forEach((item) => values.add(item.currency));
  report?.organizationFinance.forEach((item) => values.add(item.currency));
  report?.topPractitioners.forEach((item) =>
    item.paymentTotals.forEach((total) => values.add(total.currency)),
  );
  finance.forEach((item) => values.add(item.currency));
  return [...values].sort();
}

function buildReportView(report: OperationalReport | null, currency: string) {
  if (report === null) return emptyReportView();
  const consultations = dailyAppointmentTotals(report);
  const payments = report.payments.filter((item) => item.currency === currency);
  let cumulative = BigInt(0);
  const paymentTrend = payments.flatMap((item) => {
    cumulative += BigInt(item.netAmountMinor);
    const value = minorToChartNumber(cumulative, currency);
    return value === null
      ? []
      : [
          {
            cumulative: value,
            label: new Date(item.periodStart).toLocaleDateString(undefined, {
              day: "2-digit",
              month: "short",
            }),
          },
        ];
  });
  const netPayments = payments.reduce((sum, item) => sum + BigInt(item.netAmountMinor), BigInt(0));
  const refunded = payments.reduce(
    (sum, item) => sum + BigInt(item.refundedAmountMinor),
    BigInt(0),
  );
  const paymentCount = payments.reduce((sum, item) => sum + item.paymentCount, 0);
  const statuses = [
    ...groupCounts(
      report.appointments.map(
        (item) => [item.status.replaceAll("_", " ").toLowerCase(), item.count] as const,
      ),
    ).entries(),
  ].map(([name, value]) => ({ name, value }));
  const organizationFinance = report.organizationFinance
    .filter((item) => item.currency === currency)
    .flatMap((item) => {
      const value = minorToChartNumber(BigInt(item.grossAmountMinor), currency);
      return value === null ? [] : [{ name: item.organizationType.toLowerCase(), value }];
    });
  return {
    averagePayment: paymentCount === 0 ? null : netPayments / BigInt(paymentCount),
    consultations,
    netPayments,
    organizationFinance,
    paymentTrend,
    refunded,
    statuses,
  };
}

function dailyAppointmentTotals(report: OperationalReport) {
  const totals = new Map<string, number>();
  for (const item of report.appointments)
    totals.set(item.periodStart, (totals.get(item.periodStart) ?? 0) + item.count);
  return [...totals.entries()].map(([periodStart, count]) => ({
    count,
    label: new Date(periodStart).toLocaleDateString(undefined, { day: "2-digit", month: "short" }),
  }));
}

function groupCounts(values: readonly (readonly [string, number])[]) {
  const totals = new Map<string, number>();
  for (const [key, value] of values) totals.set(key, (totals.get(key) ?? 0) + value);
  return totals;
}

function currencyDigits(currency: string): number {
  if (!currency) return 0;
  try {
    return (
      new Intl.NumberFormat(undefined, { currency, style: "currency" }).resolvedOptions()
        .maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}

function minorToChartNumber(amount: bigint, currency: string): number | null {
  const divisor = BigInt(10) ** BigInt(currencyDigits(currency));
  if (amount > BigInt(Number.MAX_SAFE_INTEGER) * divisor) return null;
  return Number(amount) / Number(divisor);
}

function formatAmount(amount: bigint | null, currency: string) {
  return amount === null || !currency ? "—" : formatMinorCurrency(amount.toString(), currency);
}

function formatChartAmount(value: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { currency, style: "currency" }).format(value);
  } catch {
    return `${value.toLocaleString()} ${currency}`.trim();
  }
}

function emptyReportView() {
  return {
    averagePayment: null,
    consultations: [],
    netPayments: BigInt(0),
    organizationFinance: [],
    paymentTrend: [],
    refunded: BigInt(0),
    statuses: [],
  };
}

function ChartEmpty() {
  return (
    <p className="py-12 text-center text-sm text-muted-foreground">
      No report data for this period.
    </p>
  );
}

function ReportAmount({
  label,
  value,
  currency,
}: {
  label: string;
  value: string;
  currency: string;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold">{formatMinorCurrency(value, currency)}</p>
    </div>
  );
}
