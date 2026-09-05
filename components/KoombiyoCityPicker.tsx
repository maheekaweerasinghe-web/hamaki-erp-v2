"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

export type KoombiyoCityOption = {
  city_id: string;
  city_name: string;
  postal_code?: string | null;
  district_id: string;
  district_name: string;
};

type Props = {
  cityId: string;
  cityName: string;
  districtId: string;
  districtName: string;
  onChange: (value: KoombiyoCityOption | null) => void;
  disabled?: boolean;
};

export default function KoombiyoCityPicker({
  cityId,
  cityName,
  districtId,
  districtName,
  onChange,
  disabled = false,
}: Props) {
  const [input, setInput] = useState(cityName || "");
  const [options, setOptions] = useState<KoombiyoCityOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const requestNo = useRef(0);

  useEffect(() => {
    setInput(cityName || "");
  }, [cityName, cityId]);

  useEffect(() => {
    const q = input.trim();

    if (!open || q.length < 2) {
      setOptions([]);
      return;
    }

    const current = ++requestNo.current;

    const timer = window.setTimeout(async () => {
      try {
        setLoading(true);

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) return;

        const res = await fetch("/api/koombiyo/city-search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ query: q }),
        });

        const result = await res.json();

        if (current !== requestNo.current) return;

        if (res.ok) {
          setOptions(result?.cities || []);
        } else {
          setOptions([]);
        }
      } finally {
        if (current === requestNo.current) setLoading(false);
      }
    }, 220);

    return () => window.clearTimeout(timer);
  }, [input, open]);

  return (
    <div className="relative">
      <input
        className="soft-input"
        value={input}
        disabled={disabled}
        placeholder="Type city name"
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setInput(e.target.value);
          setOpen(true);

          // If staff edits a previously selected city, clear the structured IDs
          // until they choose a valid Koombiyo result again.
          if (cityId || districtId) onChange(null);
        }}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 150);
        }}
      />

      {open && input.trim().length >= 2 && (
        <div className="absolute z-[120] mt-1 max-h-[260px] w-full overflow-y-auto rounded-[12px] border border-[#cbd5e1] bg-white shadow-xl">
          {loading ? (
            <div className="p-3 text-sm text-[var(--muted)]">Searching Koombiyo cities...</div>
          ) : options.length === 0 ? (
            <div className="p-3 text-sm text-[var(--muted)]">
              No matching Koombiyo city found.
            </div>
          ) : (
            options.map((option) => (
              <button
                key={`${option.district_id}-${option.city_id}`}
                type="button"
                className="block w-full border-b border-[#eef2f7] px-3 py-2 text-left last:border-b-0 hover:bg-[#f1f5f9]"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setInput(option.city_name);
                  onChange(option);
                  setOpen(false);
                  setOptions([]);
                }}
              >
                <div className="font-bold text-[var(--text)]">{option.city_name}</div>
                <div className="mt-0.5 text-xs text-[var(--muted)]">
                  {option.district_name}
                  {option.postal_code ? ` · ${option.postal_code}` : ""}
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {cityId && districtId ? (
        <div className="mt-1 text-xs font-semibold text-[#166534]">
          Koombiyo location confirmed ✓
        </div>
      ) : input.trim() ? (
        <div className="mt-1 text-xs font-semibold text-[#b45309]">
          Select a city from the Koombiyo suggestions.
        </div>
      ) : null}
    </div>
  );
}
