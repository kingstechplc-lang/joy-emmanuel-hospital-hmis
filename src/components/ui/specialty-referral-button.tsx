"use client";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { safeJson, calculateAge } from "@/components/ui-helpers";
import { FieldLabel } from "@/components/ui/required-label";
import { PatientPicker, type PatientPickerValue } from "@/components/ui/patient-picker";
import { DepartmentSelect, type EntitySelectValue } from "@/components/ui/entity-select";

const SPECIALTIES = [
  { code: "DENTAL", label: "Dental" },
  { code: "OPHTH", label: "Ophthalmology" },
  { code: "ENT", label: "ENT" },
  { code: "PHYSIO", label: "Physiotherapy" },
  { code: "PSYCH", label: "Psychiatry" },
  { code: "DERM", label: "Dermatology" },
  { code: "CARDIO", label: "Cardiology" },
  { code: "NEURO", label: "Neurology" },
  { code: "ORTHO", label: "Orthopaedics" },
  { code: "URO", label: "Urology" },
  { code: "ENDO", label: "Endocrinology" },
  { code: "PAED", label: "Paediatrics" },
];

async function sendJson(url: string, method: string, body: any) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) { const e = await safeJson(res); throw new Error(e.error || `Failed: ${res.status}`); }
  return safeJson(res);
}

interface SpecialtyReferralButtonProps {
  /** Pre-selected patient (e.g., from OPD patient list) */
  patient?: { id: string; firstName?: string; middleName?: string; lastName?: string; dateOfBirth?: string; sex?: string; phone?: string; patientNumber?: string } | null;
  /** Pre-fill the "from department" field */
  fromDepartment?: string;
  /** Label for the trigger button */
  label?: string;
  /** Button variant */
  variant?: "default" | "outline" | "ghost" | "secondary";
  /** Button size */
  size?: "default" | "sm" | "lg" | "icon";
  /** Additional className for the trigger button */
  className?: string;
}

/**
 * Reusable "Refer to Specialty" button + dialog.
 * Can be dropped into ANY module (OPD, encounters, consultations, etc.)
 * to let clinicians refer a patient to a specialty clinic.
 *
 * If `patient` is provided, the patient field is pre-filled and read-only.
 * If not, the user can search for a patient via PatientPicker.
 */
export function SpecialtyReferralButton({
  patient,
  fromDepartment = "OPD",
  label = "Refer to Specialty",
  variant = "outline",
  size = "sm",
  className = "",
}: SpecialtyReferralButtonProps) {
  const setView = useAppStore((s) => s.setView);
  const [open, setOpen] = useState(false);

  // If a patient object is provided, convert it to PatientPickerValue
  const preselectedPatient: PatientPickerValue | null = patient
    ? {
        patientId: patient.id,
        patientName: [patient.firstName, patient.middleName, patient.lastName].filter(Boolean).join(" "),
        patientAge: patient.dateOfBirth ? (typeof calculateAge(patient.dateOfBirth) === "number" ? calculateAge(patient.dateOfBirth) as number : null) : null,
        patientSex: patient.sex || null,
        patientPhone: patient.phone || null,
        patientNumber: patient.patientNumber || null,
      }
    : null;

  const [pickerPatient, setPickerPatient] = useState<PatientPickerValue | null>(null);
  const [fromDept, setFromDept] = useState<EntitySelectValue | null>(
    fromDepartment ? { id: null, label: fromDepartment } : null
  );
  const [form, setForm] = useState({
    fromClinicianName: "",
    toDepartmentCode: "CARDIO",
    toClinicianName: "",
    urgency: "routine",
    reason: "",
    clinicalSummary: "",
  });
  const set = (k: string, v: any) => setForm((s) => ({ ...s, [k]: v }));

  const createMut = useMutation({
    mutationFn: (payload: any) => sendJson("/api/specialty/referrals", "POST", payload),
    onSuccess: () => {
      toast.success("Referral created — specialty clinic notified");
      setOpen(false);
      // Reset form
      setForm({
        fromClinicianName: "",
        toDepartmentCode: "CARDIO",
        toClinicianName: "",
        urgency: "routine",
        reason: "",
        clinicalSummary: "",
      });
      setPickerPatient(null);
      setFromDept(fromDepartment ? { id: null, label: fromDepartment } : null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // The effective patient (pre-selected OR from picker)
  const effectivePatient = preselectedPatient || pickerPatient;

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={() => setOpen(true)}
      >
        <Share2 className="w-4 h-4 mr-1" /> {label}
      </Button>

      {open && (
        <Dialog open onOpenChange={setOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Share2 className="w-5 h-5 text-amber-600" />
                Refer to Specialty Clinic
              </DialogTitle>
              <DialogDescription>
                Create a referral to a specialty clinic — the receiving team will be notified automatically.
              </DialogDescription>
            </DialogHeader>

            {preselectedPatient ? (
              // Patient already known — show chip
              <div className="flex items-center gap-2 p-2 border rounded-lg bg-emerald-50 border-emerald-200">
                <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-semibold text-xs flex-shrink-0">
                  {patient?.firstName?.[0]?.toUpperCase()}{patient?.lastName?.[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-900 truncate">
                    {preselectedPatient.patientName}
                  </div>
                  <div className="text-xs text-slate-500 truncate">
                    {preselectedPatient.patientNumber && <span className="font-mono">{preselectedPatient.patientNumber}</span>}
                    {preselectedPatient.patientAge != null && <span> · {preselectedPatient.patientAge}y</span>}
                    {preselectedPatient.patientSex && <span> · {preselectedPatient.patientSex}</span>}
                  </div>
                </div>
              </div>
            ) : (
              // No pre-selected patient — show picker
              <PatientPicker
                label="Patient"
                required
                value={pickerPatient}
                onChange={setPickerPatient}
                onRegisterNew={() => {
                  setOpen(false);
                  setView("patient_new");
                }}
              />
            )}

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <Label>Urgency</Label>
                <Select value={form.urgency} onValueChange={(v) => set("urgency", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="routine">Routine</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                    <SelectItem value="emergency">Emergency</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <DepartmentSelect
                  label="From Department"
                  required
                  value={fromDept}
                  onChange={setFromDept}
                  allowManual
                />
              </div>
              <div>
                <Label>Referring Clinician</Label>
                <Input value={form.fromClinicianName} onChange={(e) => set("fromClinicianName", e.target.value)} />
              </div>
              <div>
                <FieldLabel>To Specialty</FieldLabel>
                <Select value={form.toDepartmentCode} onValueChange={(v) => set("toDepartmentCode", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SPECIALTIES.map((s) => (
                      <SelectItem key={s.code} value={s.code}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Receiving Clinician (optional)</Label>
                <Input value={form.toClinicianName} onChange={(e) => set("toClinicianName", e.target.value)} />
              </div>
              <div className="col-span-2 md:col-span-3">
                <FieldLabel>Reason for Referral</FieldLabel>
                <Textarea value={form.reason} onChange={(e) => set("reason", e.target.value)} rows={2} placeholder="Brief reason for referral..." />
              </div>
              <div className="col-span-2 md:col-span-3">
                <Label>Clinical Summary</Label>
                <Textarea value={form.clinicalSummary} onChange={(e) => set("clinicalSummary", e.target.value)} rows={3} placeholder="Relevant history, findings, current medications..." />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button
                onClick={() => {
                  if (!effectivePatient) return;
                  createMut.mutate({
                    ...form,
                    fromDepartment: fromDept?.label || null,
                    patientId: effectivePatient.patientId,
                    patientName: effectivePatient.patientName,
                    patientAge: effectivePatient.patientAge || null,
                    patientSex: effectivePatient.patientSex || null,
                    patientPhone: effectivePatient.patientPhone || null,
                  });
                }}
                disabled={createMut.isPending || !effectivePatient?.patientName || !form.reason || !fromDept?.label}
                className="bg-gradient-to-r from-amber-500 to-orange-600 text-white"
              >
                {createMut.isPending ? "Creating..." : "Create Referral"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
