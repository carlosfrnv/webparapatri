"use client";

import { Bone } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader, Spinner } from "@/components/ui";
import { useT } from "@/lib/i18n";

// El visor 3D (three.js y los modelos) solo se descarga al abrir esta página: el resto de la web no lo carga.
const Atlas3D = dynamic(() => import("@/components/Atlas3D"), { ssr: false, loading: () => <Spinner /> });

export default function AtlasPage() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  return (
    <>
      <Link href={`/asignatura/${id}`} className="text-accent mb-3 inline-block text-sm font-medium">
        ← {t.common.back}
      </Link>
      <PageHeader icon={Bone} title={t.atlas.title} subtitle={t.atlas.subtitle} />
      <Atlas3D subjectId={id} />
    </>
  );
}
