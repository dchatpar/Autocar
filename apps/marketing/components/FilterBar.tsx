/**
 * FilterBar — search/filter controls for the inventory list.
 *
 * Renders inside a server component. State is held in the URL
 * (searchParams), so back/forward and shareable links work without
 * client JS. On submit, the form GETs the same page with the
 * updated query string; Next re-renders the filtered list.
 *
 * For the more dynamic "live filter as you type" behaviour, the
 * parent page can hydrate the form with a small client component
 * (use a 'use client' subcomponent) — but the default UX here is
 * server-rendered and accessible.
 */

"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState, useTransition } from "react";

interface FilterBarProps {
  /** Base path of the inventory page (e.g. /acme/inventory) */
  basePath: string;
  /** Optional list of makes to populate the dropdown. */
  makes?: string[];
  /** Optional list of body styles. */
  bodyStyles?: string[];
}

export function FilterBar({
  basePath,
  makes = [],
  bodyStyles = [],
}: FilterBarProps): React.ReactElement {
  const router = useRouter();
  const search = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Hydrate from URL.
  const [make, setMake] = useState<string>(search.get("make") ?? "");
  const [condition, setCondition] = useState<string>(search.get("condition") ?? "");
  const [bodyStyle, setBodyStyle] = useState<string>(search.get("bodyStyle") ?? "");
  const [minPrice, setMinPrice] = useState<string>(search.get("minPrice") ?? "");
  const [maxPrice, setMaxPrice] = useState<string>(search.get("maxPrice") ?? "");
  const [maxMileage, setMaxMileage] = useState<string>(search.get("maxMileage") ?? "");
  const [searchText, setSearchText] = useState<string>(search.get("search") ?? "");

  const applyFilters = useCallback(
    (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      const params = new URLSearchParams();
      if (make) params.set("make", make);
      if (condition) params.set("condition", condition);
      if (bodyStyle) params.set("bodyStyle", bodyStyle);
      if (minPrice) params.set("minPrice", minPrice);
      if (maxPrice) params.set("maxPrice", maxPrice);
      if (maxMileage) params.set("maxMileage", maxMileage);
      if (searchText) params.set("search", searchText);

      const qs = params.toString();
      const url = qs ? `${basePath}?${qs}` : basePath;
      startTransition(() => {
        router.push(url, { scroll: false });
      });
    },
    [basePath, bodyStyle, condition, make, maxMileage, maxPrice, minPrice, router, searchText],
  );

  const reset = useCallback(() => {
    setMake("");
    setCondition("");
    setBodyStyle("");
    setMinPrice("");
    setMaxPrice("");
    setMaxMileage("");
    setSearchText("");
    startTransition(() => {
      router.push(basePath, { scroll: false });
    });
  }, [basePath, router]);

  return (
    <form
      onSubmit={applyFilters}
      className="card grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
      aria-label="Filter inventory"
    >
      <div className="lg:col-span-2">
        <label className="label" htmlFor="filter-search">
          Search
        </label>
        <input
          id="filter-search"
          type="search"
          className="input"
          placeholder="Make, model, VIN, stock #"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
      </div>

      <div>
        <label className="label" htmlFor="filter-make">
          Make
        </label>
        <select
          id="filter-make"
          className="input"
          value={make}
          onChange={(e) => setMake(e.target.value)}
        >
          <option value="">All makes</option>
          {makes.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label" htmlFor="filter-condition">
          Condition
        </label>
        <select
          id="filter-condition"
          className="input"
          value={condition}
          onChange={(e) => setCondition(e.target.value)}
        >
          <option value="">All</option>
          <option value="NEW">New</option>
          <option value="USED">Used</option>
          <option value="CERTIFIED">Certified pre-owned</option>
        </select>
      </div>

      <div>
        <label className="label" htmlFor="filter-body">
          Body style
        </label>
        <select
          id="filter-body"
          className="input"
          value={bodyStyle}
          onChange={(e) => setBodyStyle(e.target.value)}
        >
          <option value="">All</option>
          {bodyStyles.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label" htmlFor="filter-min-price">
          Min price
        </label>
        <input
          id="filter-min-price"
          type="number"
          inputMode="numeric"
          min={0}
          className="input"
          placeholder="$0"
          value={minPrice}
          onChange={(e) => setMinPrice(e.target.value)}
        />
      </div>

      <div>
        <label className="label" htmlFor="filter-max-price">
          Max price
        </label>
        <input
          id="filter-max-price"
          type="number"
          inputMode="numeric"
          min={0}
          className="input"
          placeholder="$100,000"
          value={maxPrice}
          onChange={(e) => setMaxPrice(e.target.value)}
        />
      </div>

      <div>
        <label className="label" htmlFor="filter-max-mileage">
          Max mileage
        </label>
        <input
          id="filter-max-mileage"
          type="number"
          inputMode="numeric"
          min={0}
          className="input"
          placeholder="50,000"
          value={maxMileage}
          onChange={(e) => setMaxMileage(e.target.value)}
        />
      </div>

      <div className="flex items-end gap-2 lg:col-span-4">
        <button type="submit" className="btn-primary" disabled={isPending}>
          {isPending ? "Filtering…" : "Apply filters"}
        </button>
        <button type="button" className="btn-secondary" onClick={reset}>
          Reset
        </button>
      </div>
    </form>
  );
}
