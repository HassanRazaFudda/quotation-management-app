import { PageHeader } from "@/components/app-shell";
import { Builder } from "@/components/builder/builder";

export default function NewPackagePage() {
  return (
    <>
      <PageHeader title="New Package" subtitle="A reusable quotation staff can start from" />
      <Builder asPackage />
    </>
  );
}
