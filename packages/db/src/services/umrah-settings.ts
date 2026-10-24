/**
 * Umrah settings: letterhead and default text.
 *
 * Reads never fail: until an admin has saved anything, a built-in fallback is
 * returned, so a quotation can always be printed.
 */

import type { StyledLine } from "@junaidi/shared";

import { UmrahSettingsModel } from "../models/umrah-settings";

export interface UmrahCompany {
  name: string;
  subheading: string;
  tagline: string;
  address: string;
  contact: string;
  social: { facebook: string; instagram: string; youtube: string; whatsapp: string };
}

export interface UmrahSettings {
  company: UmrahCompany;
  defaults: { includes: StyledLine[]; requirements: StyledLine[]; terms: StyledLine[] };
}

const SETTINGS_KEY = "umrah";

/** What prints until an admin fills the settings page in. Contact fields stay blank rather than borrow Hajj's. */
export const UMRAH_FALLBACK_SETTINGS: UmrahSettings = {
  company: {
    name: "JUNAIDI A TRAVEL",
    subheading: "",
    tagline: "",
    address: "",
    contact: "",
    social: { facebook: "", instagram: "", youtube: "", whatsapp: "" },
  },
  defaults: {
    includes: [],
    requirements: [],
    terms: [{ text: "All above rates are subject to availability.", color: "", bold: false }],
  },
};

const line = (value: { text?: string | null; color?: string | null; bold?: boolean | null }): StyledLine => ({
  text: value.text ?? "",
  color: value.color ?? "",
  bold: value.bold ?? false,
});

export async function getUmrahSettings(): Promise<UmrahSettings> {
  const doc = await UmrahSettingsModel.findOne({ key: SETTINGS_KEY }).lean();
  if (!doc) return UMRAH_FALLBACK_SETTINGS;

  return {
    company: {
      name: doc.company?.name || UMRAH_FALLBACK_SETTINGS.company.name,
      subheading: doc.company?.subheading ?? "",
      tagline: doc.company?.tagline ?? "",
      address: doc.company?.address ?? "",
      contact: doc.company?.contact ?? "",
      social: {
        facebook: doc.company?.social?.facebook ?? "",
        instagram: doc.company?.social?.instagram ?? "",
        youtube: doc.company?.social?.youtube ?? "",
        whatsapp: doc.company?.social?.whatsapp ?? "",
      },
    },
    defaults: {
      includes: (doc.defaults?.includes ?? []).map(line),
      requirements: (doc.defaults?.requirements ?? []).map(line),
      terms: (doc.defaults?.terms ?? []).map(line),
    },
  };
}

export async function updateUmrahSettings(data: UmrahSettings, userId: string): Promise<UmrahSettings> {
  await UmrahSettingsModel.findOneAndUpdate(
    { key: SETTINGS_KEY },
    { $set: { company: data.company, defaults: data.defaults, updatedBy: userId } },
    { upsert: true, returnDocument: "after" },
  );
  return getUmrahSettings();
}
