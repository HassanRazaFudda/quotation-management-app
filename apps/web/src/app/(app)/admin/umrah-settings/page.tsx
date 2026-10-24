"use client";

import { useEffect, useState } from "react";
import { Save } from "lucide-react";

import type { StyledLine } from "@junaidi/shared";

import { PageHeader } from "@/components/app-shell";
import { toast } from "@/components/toast";
import { Button, Card, CardHeader, Field, Input, Spinner, Textarea } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { UmrahSettings } from "@/lib/umrah-types";

const toText = (items: StyledLine[]): string => items.map((item) => item.text).join("\n");

/** Back to styled lines; a line that still reads as before keeps its colour and weight. */
const toLines = (text: string, known: StyledLine[]): StyledLine[] =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const before = known.find((k) => k.text === line);
      return { text: line, color: before?.color ?? "", bold: before?.bold ?? false };
    });

/**
 * What prints at the top of every Umrah quotation, and the text a new Umrah
 * quotation starts with. Saved here, not in code, so a new number or address is
 * a change of a few seconds. The logo and colours are shared with Hajj.
 */
export default function UmrahSettingsPage() {
  const [saved, setSaved] = useState<UmrahSettings | null>(null);
  const [company, setCompany] = useState<UmrahSettings["company"] | null>(null);
  const [includes, setIncludes] = useState("");
  const [requirements, setRequirements] = useState("");
  const [terms, setTerms] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get<UmrahSettings>("/api/umrah-settings")
      .then((settings) => {
        setSaved(settings);
        setCompany(settings.company);
        setIncludes(toText(settings.defaults.includes));
        setRequirements(toText(settings.defaults.requirements));
        setTerms(toText(settings.defaults.terms));
      })
      .catch((err) => toast.error(err instanceof ApiError ? err.message : "Could not load the settings."));
  }, []);

  if (!saved || !company) return <Spinner label="Loading settings…" />;

  const set = (patch: Partial<UmrahSettings["company"]>) => setCompany({ ...company, ...patch });
  const setSocial = (patch: Partial<UmrahSettings["company"]["social"]>) =>
    setCompany({ ...company, social: { ...company.social, ...patch } });

  async function save() {
    if (!company) return;
    setSaving(true);
    try {
      const known = [...saved!.defaults.includes, ...saved!.defaults.requirements, ...saved!.defaults.terms];
      const next = await api.patch<UmrahSettings>("/api/umrah-settings", {
        company,
        defaults: {
          includes: toLines(includes, known),
          requirements: toLines(requirements, known),
          terms: toLines(terms, known),
        },
      });
      setSaved(next);
      toast.success("Settings saved");
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors.length > 0) toast.error(err.fieldErrors[0]!);
      else toast.error(err instanceof ApiError ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Umrah Settings"
        subtitle="The letterhead on Umrah quotations, and the text new ones start with"
        action={
          <Button icon={<Save className="size-4" />} loading={saving} onClick={save}>
            Save
          </Button>
        }
      />

      <div className="space-y-5 p-5 lg:p-8">
        <Card>
          <CardHeader title="Letterhead" subtitle="Printed at the top of every Umrah quotation" />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Company name" hint="The first word prints in red">
              <Input value={company.name} onChange={(e) => set({ name: e.target.value })} placeholder="JUNAIDI A TRAVEL" />
            </Field>
            <Field label="Sub-heading (optional)">
              <Input value={company.subheading} onChange={(e) => set({ subheading: e.target.value })} />
            </Field>
            <Field label="Tagline (optional)" className="sm:col-span-2">
              <Input value={company.tagline} onChange={(e) => set({ tagline: e.target.value })} />
            </Field>
            <Field label="Address" className="sm:col-span-2">
              <Input value={company.address} onChange={(e) => set({ address: e.target.value })} />
            </Field>
            <Field label="Phone / e-mail line" hint="Printed as one line under the address" className="sm:col-span-2">
              <Input
                value={company.contact}
                onChange={(e) => set({ contact: e.target.value })}
                placeholder="Phone: 021-00000000 | E-Mail: info@example.com"
              />
            </Field>
            <Field label="WhatsApp number" hint="Digits with an optional +; links to a WhatsApp chat">
              <Input
                value={company.social.whatsapp}
                onChange={(e) => setSocial({ whatsapp: e.target.value })}
                placeholder="+92 300 1234567"
              />
            </Field>
            <Field label="Facebook" hint="Full link, starting with https://">
              <Input value={company.social.facebook} onChange={(e) => setSocial({ facebook: e.target.value })} />
            </Field>
            <Field label="Instagram">
              <Input value={company.social.instagram} onChange={(e) => setSocial({ instagram: e.target.value })} />
            </Field>
            <Field label="YouTube">
              <Input value={company.social.youtube} onChange={(e) => setSocial({ youtube: e.target.value })} />
            </Field>
            <p className="text-xs text-muted sm:col-span-2">
              A field left empty is simply not printed. Until the address and contact are filled in, Umrah quotations
              print without them.
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Default text"
            subtitle="New Umrah quotations start with these lines; staff can change them on each quotation. One line each"
          />
          <div className="grid gap-4 p-5 sm:grid-cols-3">
            <Field label="Price includes">
              <Textarea rows={8} value={includes} onChange={(e) => setIncludes(e.target.value)} />
            </Field>
            <Field label="Visa requirements">
              <Textarea rows={8} value={requirements} onChange={(e) => setRequirements(e.target.value)} />
            </Field>
            <Field label="Terms & taxes">
              <Textarea rows={8} value={terms} onChange={(e) => setTerms(e.target.value)} />
            </Field>
          </div>
        </Card>
      </div>
    </>
  );
}
