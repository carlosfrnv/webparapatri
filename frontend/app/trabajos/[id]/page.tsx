"use client";

import { useParams } from "next/navigation";
import { AssignmentView } from "@/components/Assignments";

export default function AssignmentPage() {
  const { id } = useParams<{ id: string }>();
  return <AssignmentView key={id} id={id} />;
}
