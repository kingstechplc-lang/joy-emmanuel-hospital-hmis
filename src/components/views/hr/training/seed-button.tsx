"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Settings } from "lucide-react";
import { toast } from "sonner";

export function SeedTrainingDefaultsButton() {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);

  const seed = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/seed-training-defaults", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(`Seeded: ${data.results.programsCreated} programs, ${data.results.competenciesCreated} competencies`);
      qc.invalidateQueries({ queryKey: ["training-programs"] });
      qc.invalidateQueries({ queryKey: ["training-competencies"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
      <div className="text-sm text-blue-900 mb-2">
        No training programs yet? Seed standard defaults (BLS, IPC, Fire Safety, etc.) with one click.
      </div>
      <Button size="sm" onClick={seed} disabled={loading} className="bg-blue-600 hover:bg-blue-700">
        <Settings className="w-3 h-3 mr-1" /> {loading ? "Seeding..." : "Seed Defaults"}
      </Button>
    </div>
  );
}
