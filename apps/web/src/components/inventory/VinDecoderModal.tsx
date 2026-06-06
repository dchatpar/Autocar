"use client";

import { useState, useEffect } from "react";
import { ScanLine, Loader2, Plus, X, Check } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCreateVehicle, useDecodeVin } from "@/hooks/useInventory";
import { formatCurrency } from "@/lib/utils";
import type { Vehicle } from "@/types/api";

interface VinDecoderModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface DecodedState {
  vin: string;
  make: string;
  model: string;
  year: string;
  trim: string;
  mileage: string;
  price: string;
  color: string;
  stockNumber: string;
}

const EMPTY: DecodedState = {
  vin: "",
  make: "",
  model: "",
  year: String(new Date().getFullYear()),
  trim: "",
  mileage: "",
  price: "",
  color: "",
  stockNumber: "",
};

export function VinDecoderModal({ isOpen, onClose }: VinDecoderModalProps) {
  const [step, setStep] = useState<"vin" | "form">("vin");
  const [state, setState] = useState<DecodedState>(EMPTY);
  const [vinInput, setVinInput] = useState("");

  const decode = useDecodeVin(step === "form" ? state.vin : null);
  const createVehicle = useCreateVehicle({
    onSuccess: () => {
      handleClose();
    },
  });

  // When the decode returns, pre-fill the form once.
  useEffect(() => {
    if (step === "form" && decode.data && !state.make && !state.model) {
      setState((s) => ({
        ...s,
        make: decode.data?.make ?? "",
        model: decode.data?.model ?? "",
        year: String(decode.data?.year ?? s.year),
      }));
    }
    // We intentionally only want this to run when decode.data first arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decode.data]);

  function handleClose() {
    setStep("vin");
    setState(EMPTY);
    setVinInput("");
    onClose();
  }

  function handleDecode(e: React.FormEvent) {
    e.preventDefault();
    if (vinInput.length < 11) return;
    setState((s) => ({ ...s, vin: vinInput }));
    setStep("form");
  }

  function update<K extends keyof DecodedState>(key: K, value: DecodedState[K]) {
    setState((s) => ({ ...s, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload: Partial<Vehicle> = {
      vin: state.vin,
      stockNumber: state.stockNumber,
      make: state.make,
      model: state.model,
      year: Number(state.year),
      trim: state.trim,
      mileage: Number(state.mileage) || 0,
      price: Number(state.price) || 0,
      color: state.color,
      status: "available",
    };
    createVehicle.mutate(payload);
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={step === "vin" ? "Add vehicle" : "Vehicle details"}
      description={
        step === "vin"
          ? "Scan or paste a VIN — we'll decode the make, model, and year for you."
          : "Review and complete the details before adding to inventory."
      }
      size="md"
    >
      {step === "vin" ? (
        <form onSubmit={handleDecode} className="space-y-4">
          <div>
            <label
              htmlFor="vin-input"
              className="text-sm font-medium text-text-primary block mb-1.5"
            >
              VIN
            </label>
            <Input
              id="vin-input"
              placeholder="1HGBH41JXMN109186"
              value={vinInput}
              onChange={(e) => setVinInput(e.target.value.toUpperCase())}
              leftIcon={<ScanLine className="h-4 w-4" aria-hidden="true" />}
              required
              maxLength={17}
              autoFocus
              aria-describedby="vin-hint"
            />
            <p id="vin-hint" className="text-xs text-text-muted mt-1.5">
              17 characters · validated against the NHTSA database
            </p>
          </div>
          <div className="flex justify-between gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={handleClose}>
              <X className="h-4 w-4" /> Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={vinInput.length < 11}>
              <ScanLine className="h-4 w-4" /> Decode VIN
            </Button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {decode.isFetching && (
            <div
              className="flex items-center gap-2 text-xs text-info px-3 py-2 bg-info/10 border border-info/20 rounded-lg"
              role="status"
            >
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              <span>Decoding VIN…</span>
            </div>
          )}

          {decode.isSuccess && (
            <div
              className="flex items-center gap-2 text-xs text-success px-3 py-2 bg-success/10 border border-success/20 rounded-lg"
              role="status"
            >
              <Check className="h-3 w-3" aria-hidden="true" />
              <span>Decoded from VIN</span>
            </div>
          )}

          <Input
            label="VIN"
            value={state.vin}
            onChange={(e) => update("vin", e.target.value.toUpperCase())}
            required
            maxLength={17}
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Stock #"
              value={state.stockNumber}
              onChange={(e) => update("stockNumber", e.target.value)}
              required
            />
            <Input
              label="Year"
              type="number"
              value={state.year}
              onChange={(e) => update("year", e.target.value)}
              required
              min={1900}
              max={new Date().getFullYear() + 1}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Make"
              value={state.make}
              onChange={(e) => update("make", e.target.value)}
              required
            />
            <Input
              label="Model"
              value={state.model}
              onChange={(e) => update("model", e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Trim"
              value={state.trim}
              onChange={(e) => update("trim", e.target.value)}
            />
            <Input
              label="Color"
              value={state.color}
              onChange={(e) => update("color", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Mileage"
              type="number"
              value={state.mileage}
              onChange={(e) => update("mileage", e.target.value)}
              min={0}
            />
            <Input
              label="Price"
              type="number"
              value={state.price}
              onChange={(e) => update("price", e.target.value)}
              min={0}
              leftIcon={<span className="text-xs">$</span>}
            />
          </div>

          {state.price && Number(state.price) > 0 && (
            <p className="text-xs text-text-muted">
              Will be listed at <span className="text-text-primary font-semibold">{formatCurrency(Number(state.price))}</span>
            </p>
          )}

          <div className="flex justify-between gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setStep("vin")}>
              Back
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" isLoading={createVehicle.isPending}>
                <Plus className="h-4 w-4" /> Add to inventory
              </Button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}
