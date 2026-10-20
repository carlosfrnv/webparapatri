"use client";

import { Atom } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import { ToolPage } from "@/components/ToolPage";
import { Spinner } from "@/components/ui";
import { useT } from "@/lib/i18n";

// El visor 3D (three.js) solo se descarga al abrir esta página.
const Molecules3D = dynamic(() => import("@/components/Molecules3D"), { ssr: false, loading: () => <Spinner /> });

export default function MoleculesPage() {
  const t = useT().tools.molecules;
  return (
    <ToolPage icon={Atom} title={t.title} subtitle={t.subtitle}>
      <Molecules3D />
    </ToolPage>
  );
}
