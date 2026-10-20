"use client";

import { MagnifyingGlass } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import { ToolPage } from "@/components/ToolPage";
import { Spinner } from "@/components/ui";
import { useT } from "@/lib/i18n";

// La herramienta solo se descarga al abrir esta página.
const RadioAnatomy = dynamic(() => import("@/components/RadioAnatomy"), { ssr: false, loading: () => <Spinner /> });

export default function RadioAnatomyPage() {
  const t = useT().tools.radio;
  return (
    <ToolPage icon={MagnifyingGlass} title={t.title} subtitle={t.subtitle}>
      <RadioAnatomy />
    </ToolPage>
  );
}
