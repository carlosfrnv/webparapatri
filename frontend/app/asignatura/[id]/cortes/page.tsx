"use client";

import { Scan } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import { ToolPage } from "@/components/ToolPage";
import { Spinner } from "@/components/ui";
import { useT } from "@/lib/i18n";

// El visor 3D (three.js y los modelos del atlas) solo se descarga al abrir esta página.
const Slices3D = dynamic(() => import("@/components/Slices3D"), { ssr: false, loading: () => <Spinner /> });

export default function SlicesPage() {
  const t = useT().tools.slices;
  return (
    <ToolPage icon={Scan} title={t.title} subtitle={t.subtitle}>
      <Slices3D />
    </ToolPage>
  );
}
