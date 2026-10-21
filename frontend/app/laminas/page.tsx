"use client";

import { ArrowLeft, Stack } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { PageHeader, Spinner } from "@/components/ui";
import { useT } from "@/lib/i18n";

// La herramienta solo se descarga al abrir esta página.
const Plates = dynamic(() => import("@/components/Plates"), { ssr: false, loading: () => <Spinner /> });

export default function PlatesPage() {
  const t = useT();
  return (
    <div>
      <Link href="/estudiar" className="text-accent mb-4 inline-flex items-center gap-1 font-semibold">
        <ArrowLeft size={18} aria-hidden="true" /> {t.tools.plates.back}
      </Link>
      <PageHeader icon={Stack} title={t.tools.plates.title} subtitle={t.tools.plates.subtitle} />
      <Plates />
    </div>
  );
}
