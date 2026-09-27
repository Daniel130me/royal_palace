// GET /api/manager/payouts
// Payout requests + available balance + masked bank details (plan §3.6).
// The raw bank account number NEVER leaves the server.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getManagerContext, ManagerAccessError, maskAccountNumber } from "@/lib/manager-access";

export async function GET(req: Request) {
  try {
    const { manager } = await getManagerContext(req);

    const [payouts, availableAgg, bankAccount] = await Promise.all([
      db.payoutRequest.findMany({
        where: { entityType: "manager", managerId: manager.id },
        orderBy: { requestedAt: "desc" },
        include: { allocatedEarnings: { select: { earningNumber: true, amount: true } } },
      }),
      db.managerEarning.aggregate({
        where: { managerId: manager.id, status: { in: ["available", "paid"] }, payoutRequestId: null },
        _sum: { amount: true },
      }),
      db.managerBankAccount.findUnique({ where: { managerId: manager.id } }),
    ]);

    return NextResponse.json({
      data: {
        payouts: payouts.map((p) => ({
          id: p.id,
          payoutNumber: p.payoutNumber,
          amountRequested: p.amountRequested,
          periodStart: p.periodStart,
          periodEnd: p.periodEnd,
          status: p.status,
          method: p.method,
          notes: p.notes,
          requestedAt: p.requestedAt,
          processedAt: p.processedAt,
          adminNote: p.adminNote,
          allocatedEarnings: p.allocatedEarnings,
        })),
        availableBalance: Math.max(availableAgg._sum.amount ?? 0, 0),
        bankAccount: bankAccount
          ? {
              id: bankAccount.id,
              bankName: bankAccount.bankName,
              bankCode: bankAccount.bankCode,
              accountName: bankAccount.accountName,
              accountNumberMasked: maskAccountNumber(bankAccount.accountNumber),
              verificationStatus: bankAccount.verificationStatus,
            }
          : null,
      },
    });
  } catch (error) {
    if (error instanceof ManagerAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[manager/payouts]", error);
    return NextResponse.json({ error: "Failed to load payouts." }, { status: 500 });
  }
}
