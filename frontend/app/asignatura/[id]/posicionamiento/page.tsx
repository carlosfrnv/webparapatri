"use client";

import { Ruler } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import { ToolPage } from "@/components/ToolPage";
import { Spinner } from "@/components/ui";
import { useT } from "@/lib/i18n";

// La herramienta solo se descarga al abrir esta página.
const Positioning = dynamic(() => import("@/components/Positioning"), { ssr: false, loading: () => <Spinner /> });

export default function PositioningPage() {
  const t = useT().tools.positioning;
  return (
    <ToolPage icon={Ruler} title={t.title} subtitle={t.subtitle}>
      <Positioning />
    </ToolPage>
  );
}
