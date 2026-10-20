"use client";

import { Rainbow } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import { ToolPage } from "@/components/ToolPage";
import { Spinner } from "@/components/ui";
import { useT } from "@/lib/i18n";

const SpectrumTool = dynamic(() => import("@/components/SpectrumTool"), { ssr: false, loading: () => <Spinner /> });

export default function SpectrumPage() {
  const t = useT().tools.spectrum;
  return (
    <ToolPage icon={Rainbow} title={t.title} subtitle={t.subtitle}>
      <SpectrumTool />
    </ToolPage>
  );
}
