import { describe, expect, it } from "vitest";
import { isValidTimeZone } from "../trips/validation";
import { validateActionUrl } from "../admin/validation";
import airports from "./starter-airports.json";
import airlines from "./starter-airlines.json";
import vendors from "./starter-vendors.json";
import journeyOperators from "./starter-journey-operators.json";

describe("bundled travel catalogues", () => {
  it("keeps airport identifiers unique and every time zone valid", () => {
    expect(new Set(airports.map((airport) => airport.stableKey)).size).toBe(airports.length);
    expect(new Set(airports.map((airport) => airport.iataCode)).size).toBe(airports.length);
    expect(airports.every((airport) => /^[A-Z0-9]{3}$/.test(airport.iataCode))).toBe(true);
    expect(airports.every((airport) => isValidTimeZone(airport.timezone))).toBe(true);
  });

  it("covers prominent Indian and regional airports used by the target trips", () => {
    const codes = new Set(airports.map((airport) => airport.iataCode));
    expect(airports.filter((airport) => airport.countryCode === "IN")).toHaveLength(39);
    expect(
      [
        "DEL",
        "BOM",
        "BLR",
        "HYD",
        "MAA",
        "CCU",
        "COK",
        "GOI",
        "GOX",
        "PNQ",
        "GAU",
        "LKO",
        "JAI",
        "TRV",
        "CCJ",
        "IXC",
        "SXR",
        "ATQ",
        "VNS",
        "NAG"
      ].every((code) => codes.has(code))
    ).toBe(true);
    expect(
      ["SIN", "KUL", "PEN", "LGK", "DPS", "CGK", "SUB", "YIA", "LOP", "LBJ"].every((code) =>
        codes.has(code)
      )
    ).toBe(true);
  });

  it("keeps airline identifiers unique and external actions safe", () => {
    expect(new Set(airlines.map((airline) => airline.stableKey)).size).toBe(airlines.length);
    expect(new Set(airlines.map((airline) => airline.iataCode)).size).toBe(airlines.length);
    for (const airline of airlines) {
      expect(/^[A-Z0-9]{2}$/.test(airline.iataCode)).toBe(true);
      expect(
        [
          airline.checkInUrlTemplate,
          airline.manageBookingUrlTemplate,
          airline.statusUrlTemplate,
          airline.trackerUrlTemplate
        ].every((url) => url === null || validateActionUrl(url))
      ).toBe(true);
    }
  });

  it("includes the popular active passenger airlines for the four focus countries", () => {
    const codes = new Set(airlines.map((airline) => airline.iataCode));
    expect(["AI", "6E", "IX", "QP", "SG", "9I"].every((code) => codes.has(code))).toBe(true);
    expect(["SQ", "TR"].every((code) => codes.has(code))).toBe(true);
    expect(["MH", "AK", "D7", "OD", "FY"].every((code) => codes.has(code))).toBe(true);
    expect(
      ["GA", "QG", "JT", "ID", "QZ", "IU", "IW", "IP", "8B"].every((code) => codes.has(code))
    ).toBe(true);
  });

  it("includes the common accommodation booking vendors", () => {
    const keys = new Set(vendors.map((vendor) => vendor.stableKey));
    expect(vendors).toHaveLength(9);
    expect(["booking-com", "agoda", "airbnb", "trip-com"].every((key) => keys.has(key))).toBe(true);
    expect(
      vendors.every((vendor) => vendor.websiteUrl === null || validateActionUrl(vendor.websiteUrl))
    ).toBe(true);
  });

  it("keeps a mode-aware regional journey operator starter set", () => {
    const keys = journeyOperators.map(
      (operator) => `${operator.mode}:${operator.name.toLocaleLowerCase()}`
    );
    expect(new Set(keys).size).toBe(keys.length);
    expect(
      journeyOperators.every(
        (operator) =>
          ["train", "bus", "ferry", "cab"].includes(operator.mode) &&
          operator.region &&
          operator.aliases
      )
    ).toBe(true);
    const names = new Set(journeyOperators.map((operator) => operator.name));
    expect(
      [
        "Indian Railways",
        "Qistna Express",
        "Causeway Link",
        "DAMRI",
        "BatamFast",
        "Bintan Resort Ferries",
        "Ola",
        "Grab",
        "Bluebird"
      ].every((name) => names.has(name))
    ).toBe(true);
  });
});
