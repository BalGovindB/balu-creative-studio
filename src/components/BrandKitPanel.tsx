"use client";

import { useRef, useState } from "react";
import type { BrandKit } from "@/core/types";

const DEFAULT_COLORS = { primary: "#1f3cff", secondary: "#0b1330", accent: "#ffc53d", text: "#ffffff" };

/**
 * Brand kit picker plus an inline creator. The logo, colours and font chosen here are what the
 * compositor burns into every export - captions, CTA chip, end card and logo bug.
 */
export default function BrandKitPanel({
  brandKits,
  selectedId,
  onSelect,
  onCreated,
}: {
  brandKits: BrandKit[];
  selectedId?: string;
  onSelect: (id: string | undefined) => void;
  onCreated: (kit: BrandKit) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [colors, setColors] = useState(DEFAULT_COLORS);
  const [tagline, setTagline] = useState("");
  const [website, setWebsite] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logoRef = useRef<HTMLInputElement>(null);
  const fontRef = useRef<HTMLInputElement>(null);

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const form = new FormData();
      form.append("kit", JSON.stringify({ name, colors, tagline, website, phone }));
      const logo = logoRef.current?.files?.[0];
      const font = fontRef.current?.files?.[0];
      if (logo) form.append("logo", logo);
      if (font) form.append("font", font);

      const response = await fetch("/api/brand-kits", { method: "POST", body: form });
      const body = (await response.json()) as { brandKit?: BrandKit; error?: string };
      if (!response.ok || !body.brandKit) throw new Error(body.error ?? "Could not save the brand kit.");

      onCreated(body.brandKit);
      setOpen(false);
      setName("");
      setTagline("");
      setWebsite("");
      setPhone("");
      if (logoRef.current) logoRef.current.value = "";
      if (fontRef.current) fontRef.current.value = "";
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the brand kit.");
    } finally {
      setSaving(false);
    }
  }

  const selected = brandKits.find((kit) => kit.id === selectedId);

  return (
    <section className="card">
      <h2>6 · Brand kit</h2>
      <p className="hint">Optional. Drives caption colours, the CTA chip, the logo bug and the end card.</p>

      <div className="choices" style={{ marginBottom: 12 }}>
        <button type="button" className={`choice ${!selectedId ? "selected" : ""}`} onClick={() => onSelect(undefined)}>
          No brand kit
          <small>Studio defaults</small>
        </button>
        {brandKits.map((kit) => (
          <button
            key={kit.id}
            type="button"
            className={`choice ${kit.id === selectedId ? "selected" : ""}`}
            onClick={() => onSelect(kit.id)}
          >
            {kit.name}
            <small>
              {kit.logoFile ? "logo · " : ""}
              {kit.fontFile ? "font · " : ""}
              {kit.colors.primary}
            </small>
          </button>
        ))}
      </div>

      {selected && (
        <div className="choices" style={{ marginBottom: 12 }}>
          {(["primary", "secondary", "accent", "text"] as const).map((key) => (
            <span key={key} className="pill" style={{ borderColor: selected.colors[key] }}>
              <span
                style={{
                  display: "inline-block",
                  width: 9,
                  height: 9,
                  borderRadius: 2,
                  background: selected.colors[key],
                  marginRight: 6,
                }}
              />
              {key}
            </span>
          ))}
        </div>
      )}

      {!open ? (
        <button type="button" className="btn small" onClick={() => setOpen(true)}>
          + New brand kit
        </button>
      ) : (
        <div className="character">
          {error && <div className="error">{error}</div>}
          <label className="field">
            <span>Brand name *</span>
            <input type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Suraksha Insurance" />
          </label>

          <div className="row">
            {(["primary", "secondary", "accent", "text"] as const).map((key) => (
              <label className="field" key={key}>
                <span>{key} colour</span>
                <input
                  type="color"
                  value={colors[key]}
                  onChange={(event) => setColors((current) => ({ ...current, [key]: event.target.value }))}
                />
              </label>
            ))}
          </div>

          <div className="row">
            <label className="field">
              <span>Tagline</span>
              <input type="text" value={tagline} onChange={(event) => setTagline(event.target.value)} />
            </label>
            <label className="field">
              <span>Website</span>
              <input type="text" value={website} onChange={(event) => setWebsite(event.target.value)} placeholder="brand.com" />
            </label>
            <label className="field">
              <span>Phone</span>
              <input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} />
            </label>
          </div>

          <label className="field">
            <span>Logo (PNG with transparency works best)</span>
            <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/webp" />
          </label>
          <label className="field">
            <span>Brand font (.ttf or .otf)</span>
            <input ref={fontRef} type="file" accept=".ttf,.otf" />
          </label>

          <div className="generate-bar">
            <button type="button" className="btn primary" disabled={saving || !name.trim()} onClick={() => void save()}>
              {saving ? "Saving…" : "Save brand kit"}
            </button>
            <button type="button" className="btn small" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
