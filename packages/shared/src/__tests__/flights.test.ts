import { describe, expect, it } from "vitest";

import { anyFlightLabel, flightLabel, priceFlights, roundTripLabel, type FlightOption } from "../flights";

const options: FlightOption[] = [
  {
    id: "f-out-jed", season: "1448", direction: "outbound",
    origin: "Karachi", destination: "Jeddah", airline: "PIA",
    label: "Karachi - Jeddah (PIA)", price: 165_000, sortOrder: 1, active: true,
  },
  {
    id: "f-out-med", season: "1448", direction: "outbound",
    origin: "Karachi", destination: "Madinah", airline: "Saudia",
    label: "Karachi - Madinah (Saudia)", price: 178_000, sortOrder: 2, active: true,
  },
  {
    id: "f-in-jed", season: "1448", direction: "inbound",
    origin: "Jeddah", destination: "Karachi", airline: "PIA",
    label: "Jeddah - Karachi (PIA)", price: 158_000, sortOrder: 1, active: true,
  },
  {
    id: "f-rt-jed", season: "1448", direction: "roundtrip",
    origin: "Karachi", destination: "Jeddah", returnFrom: "", airline: "PIA",
    label: "Karachi <-> Jeddah (PIA)", price: 300_000, sortOrder: 1, active: true,
  },
  {
    id: "f-rt-open-jaw", season: "1448", direction: "roundtrip",
    origin: "Karachi", destination: "Madinah", returnFrom: "Jeddah", airline: "Saudia",
    label: "Karachi - Madinah / Jeddah - Karachi (Saudia)", price: 320_000, sortOrder: 2, active: true,
  },
];

describe("priceFlights", () => {
  it("charges nothing when the package excludes flights", () => {
    const priced = priceFlights({ included: false, returnRequired: false }, options);
    expect(priced.total).toBe(0);
    expect(priced.included).toBe(false);
    expect(priced.issues).toEqual([]);
  });

  it("charges the outbound fare for a one-way package", () => {
    const priced = priceFlights(
      { included: true, outboundId: "f-out-jed", returnRequired: false },
      options,
    );
    expect(priced.total).toBe(165_000);
    expect(priced.inbound).toBeNull();
    expect(priced.issues).toEqual([]);
  });

  it("adds the return fare when a return is wanted", () => {
    const priced = priceFlights(
      { included: true, outboundId: "f-out-jed", returnRequired: true, inboundId: "f-in-jed" },
      options,
    );
    expect(priced.total).toBe(165_000 + 158_000);
    expect(priced.outbound?.destination).toBe("Jeddah");
    expect(priced.inbound?.origin).toBe("Jeddah");
  });

  it("lets the guest fly out to Madinah and home from Jeddah", () => {
    const priced = priceFlights(
      { included: true, outboundId: "f-out-med", returnRequired: true, inboundId: "f-in-jed" },
      options,
    );
    expect(priced.outbound?.destination).toBe("Madinah");
    expect(priced.inbound?.origin).toBe("Jeddah");
    expect(priced.total).toBe(178_000 + 158_000);
  });

  it("reports what is missing instead of throwing", () => {
    const priced = priceFlights({ included: true, returnRequired: true }, options);
    expect(priced.issues).toHaveLength(2);
    expect(priced.total).toBe(0);
  });

  it("freezes the fare onto the selection", () => {
    const priced = priceFlights(
      { included: true, outboundId: "f-out-jed", returnRequired: false },
      options,
    );
    expect(priced.outbound).toMatchObject({
      optionId: "f-out-jed", airline: "PIA", price: 165_000,
    });
  });
});

/**
 * A round-trip is one two-way ticket at a single fare - the common Pakistani
 * "return ticket". It fills both legs and its own fare wins over any sectors.
 */
describe("priceFlights - round trip", () => {
  it("charges the single two-way fare and fills both legs", () => {
    const priced = priceFlights(
      { included: true, roundTrip: true, roundTripId: "f-rt-jed", returnRequired: true },
      options,
    );
    expect(priced.total).toBe(300_000);
    expect(priced.outbound?.origin).toBe("Karachi");
    expect(priced.outbound?.destination).toBe("Jeddah");
    expect(priced.inbound?.origin).toBe("Jeddah");
    expect(priced.inbound?.destination).toBe("Karachi");
    expect(priced.issues).toEqual([]);
  });

  it("follows an open-jaw return from a different city", () => {
    const priced = priceFlights(
      { included: true, roundTrip: true, roundTripId: "f-rt-open-jaw", returnRequired: true },
      options,
    );
    expect(priced.outbound?.destination).toBe("Madinah");
    expect(priced.inbound?.origin).toBe("Jeddah");
    expect(priced.total).toBe(320_000);
  });

  it("ignores any separate sectors once a round-trip is chosen", () => {
    const priced = priceFlights(
      {
        included: true,
        roundTrip: true,
        roundTripId: "f-rt-jed",
        outboundId: "f-out-jed",
        inboundId: "f-in-jed",
        returnRequired: true,
      },
      options,
    );
    expect(priced.total).toBe(300_000); // not 165k + 158k
  });

  it("asks for a round-trip when the mode is on but none is chosen", () => {
    const priced = priceFlights({ included: true, roundTrip: true, returnRequired: true }, options);
    expect(priced.issues).toEqual(["Choose a round-trip flight."]);
    expect(priced.total).toBe(0);
  });
});

describe("flightLabel", () => {
  it("reads as a route with the airline", () => {
    expect(flightLabel({ origin: "Karachi", destination: "Jeddah", airline: "PIA" })).toBe(
      "Karachi - Jeddah (PIA)",
    );
  });

  it("omits the airline when there is none", () => {
    expect(flightLabel({ origin: "Karachi", destination: "Jeddah", airline: "" })).toBe(
      "Karachi - Jeddah",
    );
  });
});

describe("roundTripLabel", () => {
  it("uses a two-way arrow when the return mirrors the outbound", () => {
    expect(
      roundTripLabel({ origin: "Karachi", destination: "Jeddah", returnFrom: "", airline: "PIA" }),
    ).toBe("Karachi <-> Jeddah (PIA)");
  });

  it("spells out both legs for an open-jaw ticket", () => {
    expect(
      roundTripLabel({
        origin: "Karachi",
        destination: "Madinah",
        returnFrom: "Jeddah",
        airline: "Saudia",
      }),
    ).toBe("Karachi - Madinah / Jeddah - Karachi (Saudia)");
  });

  it("anyFlightLabel picks the shape from the direction", () => {
    expect(
      anyFlightLabel({
        direction: "roundtrip",
        origin: "Karachi",
        destination: "Jeddah",
        returnFrom: "",
        airline: "PIA",
      }),
    ).toBe("Karachi <-> Jeddah (PIA)");
    expect(
      anyFlightLabel({
        direction: "outbound",
        origin: "Karachi",
        destination: "Jeddah",
        returnFrom: "",
        airline: "PIA",
      }),
    ).toBe("Karachi - Jeddah (PIA)");
  });
});
