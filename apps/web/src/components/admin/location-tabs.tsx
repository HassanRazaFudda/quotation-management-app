"use client";

import { useEffect, useState } from "react";

import type { Location } from "@junaidi/shared";

import { RadioGroup } from "@/components/ui";

/**
 * Which destination an admin screen is currently showing. Defaults to the
 * first location once the config loads; stays put after that, even if the
 * list changes - nothing here persists across a reload, same as neither
 * screen persisted any other view state before.
 */
export function useActiveLocation(locations: Location[]): {
  activeLocationId: string;
  setActiveLocationId: (id: string) => void;
} {
  const [activeLocationId, setActiveLocationId] = useState("");

  useEffect(() => {
    if (!activeLocationId && locations.length > 0) {
      setActiveLocationId(locations[0]!.id);
    }
  }, [activeLocationId, locations]);

  return { activeLocationId, setActiveLocationId };
}

/** The Makkah / Madinah / Aziziya / Mina tab bar shared by the hotel admin screens. */
export function LocationTabs({
  locations,
  value,
  onChange,
}: {
  locations: Location[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <RadioGroup
      options={locations.map((l) => ({ value: l.id, label: l.name }))}
      value={value}
      onChange={onChange}
    />
  );
}
