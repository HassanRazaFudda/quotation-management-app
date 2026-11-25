"use client";

import { passengerIncomplete, passengersFor } from "@junaidi/shared";

import { Card } from "@/components/ui";
import type { Quotation } from "@/lib/types";

/**
 * The people on a confirmed booking, read-only. They are entered (and
 * completed later) in the Confirm booking dialog.
 */
export function PassengersCard({ quotation, onEdit }: { quotation: Quotation; onEdit?: () => void }) {
  const passengers = passengersFor(quotation);
  const missing = passengers.filter(passengerIncomplete).length;

  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Passengers ({passengers.length})</p>
        <div className="flex items-baseline gap-3 text-xs">
          {missing > 0 && (
            <span className="text-amber-700">
              {missing} with missing details
            </span>
          )}
          {onEdit && (
            <button type="button" onClick={onEdit} className="font-medium text-brand-600 hover:text-brand-700">
              Edit passengers
            </button>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="py-1.5 pr-3 font-medium">#</th>
              <th className="py-1.5 pr-3 font-medium">Name</th>
              <th className="py-1.5 pr-3 font-medium">Gender</th>
              <th className="py-1.5 pr-3 font-medium">Passport</th>
              <th className="py-1.5 pr-3 font-medium">Contact</th>
            </tr>
          </thead>
          <tbody>
            {passengers.map((passenger, index) => {
              const name = [passenger.surname, passenger.givenName].filter(Boolean).join(" ");
              return (
                <tr key={index} className="border-t border-line">
                  <td className="py-1.5 pr-3 text-muted tabular-nums">{index + 1}</td>
                  <td className="py-1.5 pr-3 text-ink">{name || <span className="text-muted">-</span>}</td>
                  <td className="py-1.5 pr-3 capitalize text-ink">{passenger.gender || <span className="text-muted">-</span>}</td>
                  <td className="py-1.5 pr-3 text-ink">{passenger.passportNo || <span className="text-muted">-</span>}</td>
                  <td className="py-1.5 pr-3 text-ink">{passenger.contact || <span className="text-muted">-</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
