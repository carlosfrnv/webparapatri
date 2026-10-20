"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { DeckView } from "@/components/Decks";
import { Spinner } from "@/components/ui";

function DeckPageContent() {
  const { id } = useParams<{ id: string }>();
  // ?estudiar=1 (desde la lista de mazos): empieza directamente a estudiar.
  const study = useSearchParams().get("estudiar") === "1";
  return <DeckView key={id} id={id} startStudying={study} />;
}

export default function DeckPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <DeckPageContent />
    </Suspense>
  );
}
