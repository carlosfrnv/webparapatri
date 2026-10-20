"use client";

import { Microscope } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import { ToolPage } from "@/components/ToolPage";
import { Spinner } from "@/components/ui";
import { useT } from "@/lib/i18n";

// El visor 3D (three.js) solo se descarga al abrir esta página.
const Cell3D = dynamic(() => import("@/components/Cell3D"), { ssr: false, loading: () => <Spinner /> });

export default function CellPage() {
  const t = useT().tools.cell;
  return (
    <ToolPage icon={Microscope} title={t.title} subtitle={t.subtitle}>
      <Cell3D />
    </ToolPage>
  );
}
