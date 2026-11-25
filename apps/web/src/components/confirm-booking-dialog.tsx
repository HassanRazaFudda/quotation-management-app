"use client";

import { passengersFor, type Passenger } from "@junaidi/shared";
import { useEffect, useState } from "react";

import { Button, Field, Input, Modal, Select } from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { Quotation, QuotationStay } from "@/lib/types";

const OTHER_STAFF = "__other__";

export interface ConfirmPayload {
  hbNumber: string;
  assignedStaffUserId: string | null;
  assignedStaffName: string;
  careOfUserId: string | null;
  careOfName: string;
  passengers: Passenger[];
}

/** "Double" / "Separate - Triple" / "Deluxe": what one room of a split is called. */
function roomName(room: NonNullable<QuotationStay["rooms"]>[number]): string {
  return room.roomLabel?.trim() || room.occupancy?.trim() || room.minaTier?.trim() || room.roomType || "Room";
}

// No placeholders: an empty cell must look empty, not filled with a sample name.
const TEXT_FIELDS: Array<{ key: keyof Passenger; label: string; width: string }> = [
  { key: "surname", label: "Surname", width: "w-32" },
  { key: "givenName", label: "Given name", width: "w-36" },
  { key: "passportNo", label: "Passport no.", width: "w-32" },
  { key: "contact", label: "Contact", width: "w-32" },
  { key: "email", label: "Registration email", width: "w-48" },
  { key: "preRegNo", label: "Pre-reg no.", width: "w-40" },
];

/**
 * Confirming a booking asks for its HB number - required, and unique - and the
 * staff handling it. It is also where each passenger is recorded for the
 * passenger sheet: every one of those fields is optional, and a blank simply
 * prints blank. Reopening the dialog on a confirmed booking loads what was
 * saved, so details can be completed later.
 */
export function ConfirmBookingDialog({
  open,
  saving,
  quotation,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  saving: boolean;
  quotation: Quotation;
  onCancel: () => void;
  onConfirm: (payload: ConfirmPayload) => void;
}) {
  const [hb, setHb] = useState(quotation.hbNumber);
  const [staff, setStaff] = useState<Array<{ id: string; name: string }>>([]);
  const [staffChoice, setStaffChoice] = useState("");
  const [otherName, setOtherName] = useState("");
  const [careChoice, setCareChoice] = useState("");
  const [careName, setCareName] = useState("");
  const [passengers, setPassengers] = useState<Passenger[]>([]);

  useEffect(() => {
    api
      .get<{ users: Array<{ id: string; name: string }> }>("/api/users/basic")
      .then((r) => setStaff(r.users))
      .catch(() => undefined);
  }, []);

  // Reset the fields each time the dialog opens, from what the booking holds.
  useEffect(() => {
    if (!open) return;
    setHb(quotation.hbNumber);
    const assigned = quotation.assignedStaff;
    if (assigned?.userId) {
      setStaffChoice(assigned.userId);
      setOtherName("");
    } else if (assigned?.name) {
      setStaffChoice(OTHER_STAFF);
      setOtherName(assigned.name);
    } else {
      setStaffChoice("");
      setOtherName("");
    }
    // C/O works the same way: a user, or any typed name.
    const careOf = quotation.careOf;
    if (careOf?.userId) {
      setCareChoice(careOf.userId);
      setCareName("");
    } else if (careOf?.name) {
      setCareChoice(OTHER_STAFF);
      setCareName(careOf.name);
    } else {
      setCareChoice("");
      setCareName("");
    }
    setPassengers(passengersFor(quotation));
  }, [open, quotation]);

  const trimmed = hb.trim();
  const splitStays = quotation.stays
    .map((stay, index) => ({ stay, index }))
    .filter(({ stay }) => (stay.rooms?.length ?? 0) > 0);

  function update(index: number, patch: Partial<Passenger>) {
    setPassengers((list) => list.map((passenger, i) => (i === index ? { ...passenger, ...patch } : passenger)));
  }

  function pick(passengerIndex: number, stayIndex: number, room: number) {
    setPassengers((list) =>
      list.map((passenger, i) =>
        i === passengerIndex
          ? { ...passenger, roomPicks: passenger.roomPicks.map((value, s) => (s === stayIndex ? room : value)) }
          : passenger,
      ),
    );
  }

  const label = (passenger: Passenger, index: number) => {
    const name = [passenger.surname, passenger.givenName].filter(Boolean).join(" ");
    return name ? `${index + 1}. ${name}` : `Passenger ${index + 1}`;
  };

  return (
    <Modal open={open} onClose={onCancel} title="Confirm booking" size="xl">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!trimmed) return;
          onConfirm({
            hbNumber: trimmed,
            assignedStaffUserId: staffChoice && staffChoice !== OTHER_STAFF ? staffChoice : null,
            assignedStaffName: staffChoice === OTHER_STAFF ? otherName.trim() : "",
            careOfUserId: careChoice && careChoice !== OTHER_STAFF ? careChoice : null,
            careOfName: careChoice === OTHER_STAFF ? careName.trim() : "",
            passengers,
          });
        }}
        className="space-y-6"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="HB Number" hint="Unique - the same number cannot be used on another booking">
            <Input
              value={hb}
              onChange={(e) => setHb(e.target.value)}
              placeholder="HB-1448-0001"
              autoFocus
              required
            />
          </Field>
          <div className="space-y-2">
            <Field label="Assigned staff (optional)">
              <Select
                options={[
                  { value: "", label: "- none -" },
                  ...staff.map((s) => ({ value: s.id, label: s.name })),
                  { value: OTHER_STAFF, label: "Other (type a name)" },
                ]}
                value={staffChoice}
                onChange={(e) => setStaffChoice(e.target.value)}
              />
            </Field>
            {staffChoice === OTHER_STAFF && (
              <Input value={otherName} onChange={(e) => setOtherName(e.target.value)} placeholder="Staff name" />
            )}
          </div>
          <div className="space-y-2 sm:col-start-2">
            <Field label="C/O (optional)" hint="Who the booking came through - pick a user or type any name">
              <Select
                options={[
                  { value: "", label: "- none -" },
                  ...staff.map((s) => ({ value: s.id, label: s.name })),
                  { value: OTHER_STAFF, label: "Other (type a name)" },
                ]}
                value={careChoice}
                onChange={(e) => setCareChoice(e.target.value)}
              />
            </Field>
            {careChoice === OTHER_STAFF && (
              <Input value={careName} onChange={(e) => setCareName(e.target.value)} placeholder="Name, e.g. SELF" />
            )}
          </div>
        </div>

        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-semibold text-ink">Passengers ({passengers.length})</h3>
            <p className="text-xs text-muted">
              {quotation.flight?.included ? "With ticket" : "Without ticket"} · every field is optional; a blank
              prints blank on the passenger sheet
            </p>
          </div>
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-sm">
              <thead className="bg-canvas text-left text-xs text-muted">
                <tr>
                  <th className="px-2 py-2 font-medium">#</th>
                  {TEXT_FIELDS.slice(0, 2).map((field) => (
                    <th key={field.key} className="px-2 py-2 font-medium">
                      {field.label}
                    </th>
                  ))}
                  <th className="px-2 py-2 font-medium">Gender</th>
                  {TEXT_FIELDS.slice(2).map((field) => (
                    <th key={field.key} className="px-2 py-2 font-medium">
                      {field.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {passengers.map((passenger, index) => {
                  const text = (field: (typeof TEXT_FIELDS)[number]) => (
                    <td key={field.key} className="px-1.5 py-1.5">
                      <Input
                        aria-label={`${field.label}, passenger ${index + 1}`}
                        value={passenger[field.key] as string}
                        onChange={(e) => update(index, { [field.key]: e.target.value })}
                        className={cn("h-9", field.width)}
                      />
                    </td>
                  );
                  return (
                    <tr key={index} className="border-t border-line">
                      <td className="px-2 py-1.5 text-muted tabular-nums">{index + 1}</td>
                      {TEXT_FIELDS.slice(0, 2).map(text)}
                      <td className="px-1.5 py-1.5">
                        <Select
                          aria-label={`Gender, passenger ${index + 1}`}
                          options={[
                            { value: "", label: "-" },
                            { value: "male", label: "Male" },
                            { value: "female", label: "Female" },
                          ]}
                          value={passenger.gender}
                          onChange={(e) => update(index, { gender: e.target.value as Passenger["gender"] })}
                          className="h-9 w-28"
                        />
                      </td>
                      {TEXT_FIELDS.slice(2).map(text)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {splitStays.map(({ stay, index: stayIndex }) => {
          const rooms = stay.rooms ?? [];
          const taken = rooms.map((_, room) => passengers.filter((p) => p.roomPicks[stayIndex] === room).length);
          return (
            <section key={stayIndex} className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-semibold text-ink">
                  {stay.locationName} · {stay.accommodationName}
                  <span className="ml-2 text-sm font-normal text-muted">{stay.blockLabelHijri}</span>
                </h3>
                <p className="flex flex-wrap gap-3 text-xs">
                  {rooms.map((room, roomIndex) => (
                    <span
                      key={roomIndex}
                      className={cn(taken[roomIndex] === room.headcount ? "text-ok" : "text-muted")}
                    >
                      {roomName(room)}: {taken[roomIndex]} of {room.headcount} assigned
                    </span>
                  ))}
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {passengers.map((passenger, passengerIndex) => {
                  const current = passenger.roomPicks[stayIndex] ?? -1;
                  return (
                    <label key={passengerIndex} className="flex items-center gap-2 text-sm">
                      <span className="w-40 shrink-0 truncate text-ink">{label(passenger, passengerIndex)}</span>
                      <select
                        value={current}
                        onChange={(e) => pick(passengerIndex, stayIndex, Number(e.target.value))}
                        className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-white px-2 text-sm"
                      >
                        <option value={-1}>Not assigned</option>
                        {rooms.map((room, roomIndex) => {
                          // A full room can only be kept, not joined.
                          const full = taken[roomIndex]! >= room.headcount && current !== roomIndex;
                          const hotel =
                            room.accommodationName && room.accommodationName !== stay.accommodationName
                              ? ` · ${room.accommodationName}`
                              : "";
                          return (
                            <option key={roomIndex} value={roomIndex} disabled={full}>
                              {roomName(room)}
                              {hotel}
                              {full ? " (full)" : ""}
                            </option>
                          );
                        })}
                      </select>
                    </label>
                  );
                })}
              </div>
            </section>
          );
        })}

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" loading={saving} disabled={!trimmed}>
            {quotation.status === "confirmed" ? "Save booking" : "Confirm booking"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
