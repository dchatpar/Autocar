"use client";

import { useState } from "react";
import { Users, Car, Calendar, Handshake, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useCreateLead } from "@/hooks/useLeads";
import { LEAD_SOURCES } from "@/lib/mock-data";

interface QuickAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  description: string;
}

const ACTIONS: QuickAction[] = [
  { id: "lead", label: "Add Lead", icon: <Users className="h-5 w-5" />, description: "Capture a new prospect" },
  { id: "vehicle", label: "Add Vehicle", icon: <Car className="h-5 w-5" />, description: "Stock a new unit" },
  { id: "appointment", label: "Schedule", icon: <Calendar className="h-5 w-5" />, description: "Book a test drive" },
  { id: "deal", label: "New Deal", icon: <Handshake className="h-5 w-5" />, description: "Start a deal jacket" },
];

export function QuickActions() {
  const [openAction, setOpenAction] = useState<string | null>(null);
  const [leadName, setLeadName] = useState("");
  const [leadEmail, setLeadEmail] = useState("");
  const [leadSource, setLeadSource] = useState<string>("Website");

  const createLead = useCreateLead({
    onSuccess: () => {
      setOpenAction(null);
      setLeadName("");
      setLeadEmail("");
    },
  });

  function renderModal(actionId: string) {
    if (actionId === "lead") {
      return (
        <Modal
          isOpen={openAction === "lead"}
          onClose={() => setOpenAction(null)}
          title="Add lead"
          description="Capture a new prospect into the pipeline"
          size="md"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!leadName.trim()) return;
              createLead.mutate({ name: leadName, email: leadEmail, source: leadSource as never });
            }}
            className="space-y-4"
          >
            <Input
              label="Full name"
              placeholder="Jane Doe"
              value={leadName}
              onChange={(e) => setLeadName(e.target.value)}
              required
              autoFocus
            />
            <Input
              label="Email"
              type="email"
              placeholder="jane@email.com"
              value={leadEmail}
              onChange={(e) => setLeadEmail(e.target.value)}
            />
            <Select
              label="Source"
              options={LEAD_SOURCES.map((s) => ({ value: s, label: s }))}
              value={leadSource}
              onChange={setLeadSource}
            />
            <div className="flex gap-3 justify-end pt-2">
              <Button type="button" variant="secondary" onClick={() => setOpenAction(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" isLoading={createLead.isPending}>
                <Plus className="h-4 w-4" />
                Add lead
              </Button>
            </div>
          </form>
        </Modal>
      );
    }

    if (actionId === "vehicle") {
      return (
        <Modal
          isOpen={openAction === "vehicle"}
          onClose={() => setOpenAction(null)}
          title="Add vehicle"
          description="Use the inventory page to add a new unit. Quick add is coming soon."
          size="sm"
        >
          <div className="flex justify-end pt-2">
            <Button variant="secondary" onClick={() => setOpenAction(null)}>
              <X className="h-4 w-4" /> Got it
            </Button>
          </div>
        </Modal>
      );
    }

    if (actionId === "appointment") {
      return (
        <Modal
          isOpen={openAction === "appointment"}
          onClose={() => setOpenAction(null)}
          title="Schedule appointment"
          description="Pick a time for the customer."
          size="sm"
        >
          <div className="flex justify-end pt-2">
            <Button variant="secondary" onClick={() => setOpenAction(null)}>
              Close
            </Button>
          </div>
        </Modal>
      );
    }

    return (
      <Modal
        isOpen={openAction === "deal"}
        onClose={() => setOpenAction(null)}
        title="New deal"
        description="Start a new deal jacket — coming soon."
        size="sm"
      >
        <div className="flex justify-end pt-2">
          <Button variant="secondary" onClick={() => setOpenAction(null)}>
            Close
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3" role="group" aria-label="Quick actions">
        {ACTIONS.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setOpenAction(a.id)}
            className="group flex items-center gap-3 p-4 bg-bg-card border border-border rounded-xl text-left hover:border-border-active hover:bg-bg-elevated/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary min-h-[64px]"
            aria-label={`${a.label}: ${a.description}`}
          >
            <div
              className="p-2 rounded-lg bg-bg-elevated text-accent group-hover:text-bg-primary group-hover:bg-accent transition-colors flex-shrink-0"
              aria-hidden="true"
            >
              {a.icon}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-primary">{a.label}</p>
              <p className="text-xs text-text-muted truncate">{a.description}</p>
            </div>
          </button>
        ))}
      </div>
      {openAction && renderModal(openAction)}
    </>
  );
}
