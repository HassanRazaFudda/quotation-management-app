"use client";

import { formatPrice } from "@junaidi/shared";
import { useEffect, useState } from "react";

import { PageHeader } from "@/components/app-shell";
import { Card, EmptyState, Spinner } from "@/components/ui";
import { api } from "@/lib/api";

interface StaffRow {
  userId: string;
  name: string;
  quotations: number;
  totalQuoted: number;
  discountGiven: number;
}

export default function ReportsPage() {
  const [rows, setRows] = useState<StaffRow[] | null>(null);

  useEffect(() => {
    api.get<{ rows: StaffRow[] }>("/api/admin/reports/staff").then((r) => setRows(r.rows));
  }, []);

  if (!rows) return <Spinner label="Loading report…" />;

  return (
    <>
      <PageHeader title="Staff Report" subtitle="Quotations and discounts by staff member" />
      <div className="p-5 lg:p-8">
        {rows.length === 0 ? (
          <EmptyState title="No data yet" hint="Reports appear once quotations are created." />
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-canvas text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-5 py-3 font-semibold">Staff</th>
                  <th className="px-5 py-3 text-right font-semibold">Quotations</th>
                  <th className="px-5 py-3 text-right font-semibold">Total quoted</th>
                  <th className="px-5 py-3 text-right font-semibold">Discount given</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((row) => (
                  <tr key={row.userId}>
                    <td className="px-5 py-3 font-medium text-ink">{row.name}</td>
                    <td className="px-5 py-3 text-right">{row.quotations}</td>
                    <td className="px-5 py-3 text-right">{formatPrice(row.totalQuoted)}</td>
                    <td className="px-5 py-3 text-right text-amber-700">
                      {formatPrice(row.discountGiven)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </>
  );
}
