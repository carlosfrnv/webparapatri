"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";
import { AREAS, type Area, type Subject } from "@/lib/types";

export interface SubjectInput {
  name: string;
  year: number | null;
  area: Area | null;
}

export function SubjectForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  initial?: Partial<Subject>;
  onSubmit: (data: SubjectInput) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
}) {
  const t = useT();
  const [name, setName] = useState(initial?.name ?? "");
  const [year, setYear] = useState<string>(initial?.year ? String(initial.year) : "1");
  const [area, setArea] = useState<string>(initial?.area ?? "");
  const [saving, setSaving] = useState(false);

  return (
    <form
      className="card space-y-3 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
          await onSubmit({ name: name.trim(), year: year ? Number(year) : null, area: (area || null) as Area | null });
        } finally {
          setSaving(false);
        }
      }}
    >
      <label className="block">
        <span className="mb-1 block text-sm font-medium">{t.subjectForm.name}</span>
        <input
          className="input"
          required
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">{t.subjectForm.year}</span>
          <select className="input" value={year} onChange={(e) => setYear(e.target.value)}>
            {[1, 2, 3, 4].map((y) => (
              <option key={y} value={y}>
                {t.library.yearN(y)}
              </option>
            ))}
            <option value="">{t.subjectForm.noYear}</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">{t.subjectForm.area}</span>
          <select className="input" value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="">—</option>
            {AREAS.map((value) => (
              <option key={value} value={value}>
                {t.areas[value]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onCancel}>
          {t.common.cancel}
        </button>
        <button className="btn-primary" disabled={saving || !name.trim()}>
          {saving ? t.common.saving : submitLabel}
        </button>
      </div>
    </form>
  );
}
