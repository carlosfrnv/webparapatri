"use client";

import type { Icon as PhIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { useT } from "@/lib/i18n";

/** Marco común de las herramientas interactivas de cada asignatura (volver + cabecera). */
export function ToolPage({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: PhIcon;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  return (
    <>
      <Link href={`/asignatura/${id}`} className="text-accent mb-3 inline-block text-sm font-medium">
        ← {t.common.back}
      </Link>
      <PageHeader icon={icon} title={title} subtitle={subtitle} />
      {children}
    </>
  );
}
