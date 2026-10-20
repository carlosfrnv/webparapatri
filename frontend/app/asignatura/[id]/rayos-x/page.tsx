"use client";

import { Radioactive } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import { ToolPage } from "@/components/ToolPage";
import { Spinner } from "@/components/ui";
import { useT } from "@/lib/i18n";

// El simulador solo se descarga al abrir esta página.
const XRaySim = dynamic(() => import("@/components/XRaySim"), { ssr: false, loading: () => <Spinner /> });

export default function XRayPage() {
  const t = useT().tools.xray;
  return (
    <ToolPage icon={Radioactive} title={t.title} subtitle={t.subtitle}>
      <XRaySim />
    </ToolPage>
  );
}
