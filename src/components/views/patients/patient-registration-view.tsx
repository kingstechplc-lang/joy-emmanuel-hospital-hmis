"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, AlertTriangle, Check, Save } from "lucide-react";
import { toast } from "sonner";

import { FieldLabel } from "@/components/ui/required-label";
import { safeJson } from "@/components/ui-helpers";
import { InsuranceProviderSelect, type EntitySelectValue } from "@/components/ui/entity-select";

interface DuplicateMatch {
  matchType: string;
  patient: {
    id: string;
    patientNumber: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    sex: string;
    phone: string;
  };
}

export function PatientRegistrationView() {
  const setView = useAppStore((s) => s.setView);
  const selectPatient = useAppStore((s) => s.selectPatient);
  const activeFacilityId = useAppStore((s) => s.activeFacilityId);
  const qc = useQueryClient();

  const [duplicates, setDuplicates] = useState<DuplicateMatch[] | null>(null);
  const [forceCreate, setForceCreate] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    firstName: "", middleName: "", lastName: "", previousName: "",
    dateOfBirth: "", sex: "", maritalStatus: "", nationality: "Ghanaian",
    occupation: "", phone: "", alternativePhone: "", email: "",
    address: "", city: "", region: "", preferredLanguage: "en", bloodGroup: "",
    ghanaCard: "", passport: "",
    insuranceProviderId: "", insuranceProviderName: "",
    membershipNumber: "", policyNumber: "",
    principalMember: "", relationshipToPrincipal: "self",
    coverageStart: "", coverageEnd: "",
    emergencyContactName: "", emergencyContactRelationship: "", emergencyContactPhone: "",
    nextOfKinName: "", nextOfKinRelationship: "", nextOfKinPhone: "",
  });

  const setField = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const submitPatient = async (force: boolean) => {
    const payload = { ...form, registeredAtFacilityId: activeFacilityId, force };
    const res = await fetch("/api/patients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await safeJson(res);
    if (!res.ok) {
      if (res.status === 409 && data.duplicates) {
        return { status: 409, duplicates: data.duplicates as DuplicateMatch[] };
      }
      throw new Error(data.error || `Failed (${res.status})`);
    }
    return { status: 201, patient: data.patient };
  };

  const mutation = useMutation({
    mutationFn: (force: boolean) => submitPatient(force),
    onSuccess: (result: any) => {
      if (result.status === 409) {
        setDuplicates(result.duplicates);
        setForceCreate(false);
        toast.info("Possible duplicates found — please review");
        return;
      }
      toast.success("Patient registered successfully");
      qc.invalidateQueries({ queryKey: ["patients-list"] });
      selectPatient(result.patient.id);
      setView("patient_360");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to register patient");
    },
    onSettled: () => setSaving(false),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName || !form.lastName) {
      toast.error("First name and last name are required");
      return;
    }
    setSaving(true);
    mutation.mutate(forceCreate);
  };

  const handleUseExistingPatient = (id: string) => {
    selectPatient(id);
    setView("patient_360");
    toast.success("Opening existing patient record");
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => setView("patients")} className="gap-1">
          <ArrowLeft className="w-4 h-4" /> Back to Patients
        </Button>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-slate-900">Register New Patient</h2>
        <p className="text-sm text-slate-500">Capture the patient&apos;s demographic, contact, and identification details.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Personal Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Personal Information</CardTitle>
            <CardDescription>Basic demographic details about the patient.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <FieldLabel required>First Name</FieldLabel>
              <Input value={form.firstName} onChange={(e) => setField("firstName", e.target.value)} required />
            </div>
            <div>
              <Label>Middle Name</Label>
              <Input value={form.middleName} onChange={(e) => setField("middleName", e.target.value)} />
            </div>
            <div>
              <FieldLabel required>Last Name</FieldLabel>
              <Input value={form.lastName} onChange={(e) => setField("lastName", e.target.value)} required />
            </div>
            <div>
              <Label>Previous Name</Label>
              <Input value={form.previousName} onChange={(e) => setField("previousName", e.target.value)} />
            </div>
            <div>
              <Label>Date of Birth</Label>
              <Input type="date" value={form.dateOfBirth} onChange={(e) => setField("dateOfBirth", e.target.value)} />
            </div>
            <div>
              <Label>Sex</Label>
              <Select value={form.sex || undefined} onValueChange={(v) => setField("sex", v)}>
                <SelectTrigger><SelectValue placeholder="Select sex" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="intersex">Intersex</SelectItem>
                  <SelectItem value="unknown">Unknown</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Marital Status</Label>
              <Select value={form.maritalStatus || undefined} onValueChange={(v) => setField("maritalStatus", v)}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">Single</SelectItem>
                  <SelectItem value="married">Married</SelectItem>
                  <SelectItem value="divorced">Divorced</SelectItem>
                  <SelectItem value="widowed">Widowed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nationality</Label>
              <Input value={form.nationality} onChange={(e) => setField("nationality", e.target.value)} />
            </div>
            <div>
              <Label>Occupation</Label>
              <Input value={form.occupation} onChange={(e) => setField("occupation", e.target.value)} />
            </div>
            <div>
              <Label>Blood Group</Label>
              <Select value={form.bloodGroup || undefined} onValueChange={(v) => setField("bloodGroup", v)}>
                <SelectTrigger><SelectValue placeholder="Unknown" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="A+">A+</SelectItem>
                  <SelectItem value="A-">A-</SelectItem>
                  <SelectItem value="B+">B+</SelectItem>
                  <SelectItem value="B-">B-</SelectItem>
                  <SelectItem value="AB+">AB+</SelectItem>
                  <SelectItem value="AB-">AB-</SelectItem>
                  <SelectItem value="O+">O+</SelectItem>
                  <SelectItem value="O-">O-</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Preferred Language</Label>
              <Select value={form.preferredLanguage || undefined} onValueChange={(v) => setField("preferredLanguage", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="tw">Twi</SelectItem>
                  <SelectItem value="ga">Ga</SelectItem>
                  <SelectItem value="ee">Ewe</SelectItem>
                  <SelectItem value="ha">Hausa</SelectItem>
                  <SelectItem value="dag">Dagbani</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Contact */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setField("phone", e.target.value)} placeholder="e.g. 024 123 4567" />
            </div>
            <div>
              <Label>Alternative Phone</Label>
              <Input value={form.alternativePhone} onChange={(e) => setField("alternativePhone", e.target.value)} />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} />
            </div>
            <div>
              <Label>Address</Label>
              <Input value={form.address} onChange={(e) => setField("address", e.target.value)} />
            </div>
            <div>
              <Label>City / Town</Label>
              <Input value={form.city} onChange={(e) => setField("city", e.target.value)} />
            </div>
            <div>
              <Label>Region</Label>
              <Input value={form.region} onChange={(e) => setField("region", e.target.value)} />
            </div>
          </CardContent>
        </Card>

        {/* Emergency Contact */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Emergency Contact</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Full Name</Label>
              <Input value={form.emergencyContactName} onChange={(e) => setField("emergencyContactName", e.target.value)} />
            </div>
            <div>
              <Label>Relationship</Label>
              <Input value={form.emergencyContactRelationship} onChange={(e) => setField("emergencyContactRelationship", e.target.value)} placeholder="e.g. Parent, Spouse" />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.emergencyContactPhone} onChange={(e) => setField("emergencyContactPhone", e.target.value)} />
            </div>
          </CardContent>
        </Card>

        {/* Next of Kin */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Next of Kin</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Full Name</Label>
              <Input value={form.nextOfKinName} onChange={(e) => setField("nextOfKinName", e.target.value)} />
            </div>
            <div>
              <Label>Relationship</Label>
              <Input value={form.nextOfKinRelationship} onChange={(e) => setField("nextOfKinRelationship", e.target.value)} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.nextOfKinPhone} onChange={(e) => setField("nextOfKinPhone", e.target.value)} />
            </div>
          </CardContent>
        </Card>

        {/* Insurance */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Insurance Information</CardTitle>
            <CardDescription>Select an insurance provider to enable NHIS/insurance membership capture. Leave blank for self-pay patients.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-3">
              <Label>Insurance Provider</Label>
              <InsuranceProviderSelect
                value={form.insuranceProviderId ? { id: form.insuranceProviderId, label: form.insuranceProviderName || "" } as EntitySelectValue : null}
                onChange={(v) => {
                  setField("insuranceProviderId", v?.id || "");
                  setField("insuranceProviderName", v?.label || "");
                }}
              />
              {!form.insuranceProviderId && (
                <p className="text-[11px] text-slate-500 mt-1">
                  No provider selected — patient will be registered as self-pay. You can add insurance later from the patient record.
                </p>
              )}
            </div>
            <div>
              <Label>Membership / Insurance Number</Label>
              <Input value={form.membershipNumber} onChange={(e) => setField("membershipNumber", e.target.value)} disabled={!form.insuranceProviderId} placeholder={form.insuranceProviderId ? "e.g. NHIS1234567890" : "Select provider first"} />
            </div>
            <div>
              <Label>Policy Number</Label>
              <Input value={form.policyNumber} onChange={(e) => setField("policyNumber", e.target.value)} disabled={!form.insuranceProviderId} />
            </div>
            <div>
              <Label>Principal Member</Label>
              <Input value={form.principalMember} onChange={(e) => setField("principalMember", e.target.value)} disabled={!form.insuranceProviderId} placeholder="Self or name of principal" />
            </div>
            <div>
              <Label>Relationship to Principal</Label>
              <Select value={form.relationshipToPrincipal || undefined} onValueChange={(v) => setField("relationshipToPrincipal", v)} disabled={!form.insuranceProviderId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="self">Self</SelectItem>
                  <SelectItem value="spouse">Spouse</SelectItem>
                  <SelectItem value="child">Child</SelectItem>
                  <SelectItem value="parent">Parent</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Coverage Start</Label>
              <Input type="date" value={form.coverageStart} onChange={(e) => setField("coverageStart", e.target.value)} disabled={!form.insuranceProviderId} />
            </div>
            <div>
              <Label>Coverage End</Label>
              <Input type="date" value={form.coverageEnd} onChange={(e) => setField("coverageEnd", e.target.value)} disabled={!form.insuranceProviderId} />
            </div>
          </CardContent>
        </Card>

        {/* Identifiers */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Identifiers</CardTitle>
            <CardDescription>Ghana Card is used for duplicate detection across the organization.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Ghana Card Number</Label>
              <Input value={form.ghanaCard} onChange={(e) => setField("ghanaCard", e.target.value)} placeholder="e.g. GHA-123456789-0" />
            </div>
            <div>
              <Label>Passport Number</Label>
              <Input value={form.passport} onChange={(e) => setField("passport", e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setView("patients")}>Cancel</Button>
          <Button type="submit" disabled={saving} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            {saving ? <Save className="w-4 h-4 animate-pulse" /> : <Check className="w-4 h-4" />}
            {saving ? "Saving..." : "Register Patient"}
          </Button>
        </div>
      </form>

      {/* Duplicate detection modal */}
      <Dialog open={!!duplicates} onOpenChange={(o) => !o && setDuplicates(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="w-5 h-5" /> Possible Duplicate Patient Found
            </DialogTitle>
            <DialogDescription>
              We found one or more existing patients that may match this entry. Please review and choose to either use an existing record or create a new one anyway.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {duplicates?.map((d, i) => (
              <Card key={d.patient.id + i}>
                <CardContent className="p-3 flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-slate-900">
                      {d.patient.firstName} {d.patient.lastName}
                    </div>
                    <div className="text-xs text-slate-500">
                      {d.patient.patientNumber} • DOB: {d.patient.dateOfBirth ? new Date(d.patient.dateOfBirth).toLocaleDateString() : "—"} • Sex: {d.patient.sex} • Phone: {d.patient.phone || "—"}
                    </div>
                    <span className="inline-block mt-1 px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-700 border border-amber-200">
                      Matched by: {d.matchType}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleUseExistingPatient(d.patient.id)}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    Use Existing
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDuplicates(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                setDuplicates(null);
                setForceCreate(true);
                setTimeout(() => {
                  const form = document.querySelector("form") as HTMLFormElement | null;
                  form?.requestSubmit();
                }, 0);
              }}
            >
              Create Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
