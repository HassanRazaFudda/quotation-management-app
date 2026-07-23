import { PageHeader } from "@/components/app-shell";
import { Builder } from "@/components/builder/builder";

export default function NewQuotationPage() {
  return (
    <>
      <PageHeader title="New Quotation" subtitle="Build a Hajj package quotation" />
      <Builder />
    </>
  );
}
