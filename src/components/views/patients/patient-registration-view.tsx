"use client";
import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, AlertTriangle, Check, Save, User, MapPin, Phone, Shield, Heart, Users, FileText, Camera, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { FieldLabel } from "@/components/ui/required-label";
import { safeJson } from "@/components/ui-helpers";
import { InsuranceProviderSelect, type EntitySelectValue } from "@/components/ui/entity-select";
import {
  GHANA_REGIONS,
  getDistrictsByRegion,
  RELATIONSHIP_TYPES,
} from "@/lib/ghana-reference-data";
import { validateGhanaCard, validateGhanaPhone } from "@/lib/ghana-validation";

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

// Section definitions for the navigator
const SECTIONS = [
  { id: "identification", label: "Identification", icon: Shield },
  { id: "personal", label: "Personal Info", icon: User },
  { id: "contact", label: "Contact", icon: Phone },
  { id: "address", label: "Address", icon: MapPin },
  { id: "emergency", label: "Emergency Contact", icon: AlertTriangle },
  { id: "kin", label: "Next of Kin", icon: Heart },
  { id: "insurance", label: "Insurance", icon: Users },
  { id: "additional", label: "Additional", icon: FileText },
] as const;

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
    address: "", city: "", region: "", district: "", preferredLanguage: "en", bloodGroup: "",
    ghanaCard: "", passport: "",
    emergencyContactName: "", emergencyContactRelationship: "", emergencyContactRelationshipOther: "",
    emergencyContactPhone: "", emergencyContactAltPhone: "", emergencyContactAddress: "",
    nextOfKinName: "", nextOfKinRelationship: "", nextOfKinRelationshipOther: "",
    nextOfKinPhone: "", nextOfKinAltPhone: "", nextOfKinAddress: "",
    nokSameAsEmergency: false,
  });

  // Multiple insurance coverages — array of coverage objects.
  // The first one with isPrimary=true is the primary coverage.
  // Additional ones are secondary/tertiary.
  const [insuranceCoverages, setInsuranceCoverages] = useState<Array<{
    insuranceProviderId: string;
    insuranceProviderName: string;
    membershipNumber: string;
    policyNumber: string;
    principalMember: string;
    relationshipToPrincipal: string;
    coverageStart: string;
    coverageEnd: string;
    isPrimary: boolean;
  }>>([]);

  const addInsuranceCoverage = () => {
    setInsuranceCoverages((prev) => {
      // First coverage is automatically primary
      const isFirst = prev.length === 0;
      return [
        ...prev,
        {
          insuranceProviderId: "",
          insuranceProviderName: "",
          membershipNumber: "",
          policyNumber: "",
          principalMember: "",
          relationshipToPrincipal: "self",
          coverageStart: "",
          coverageEnd: "",
          isPrimary: isFirst, // first one is primary by default
        },
      ];
    });
  };

  const removeInsuranceCoverage = (index: number) => {
    setInsuranceCoverages((prev) => {
      const next = prev.filter((_, i) => i !== index);
      // If we removed the primary, make the first remaining one primary
      if (next.length > 0 && !next.some((c) => c.isPrimary)) {
        next[0].isPrimary = true;
      }
      return next;
    });
  };

  const setInsuranceField = (index: number, field: string, value: string | boolean) => {
    setInsuranceCoverages((prev) => {
      const next = [...prev];
      (next[index] as any)[field] = value;
      // If setting isPrimary=true, unmark all others
      if (field === "isPrimary" && value === true) {
        next.forEach((c, i) => {
          if (i !== index) c.isPrimary = false;
        });
      }
      return next;
    });
  };

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  const setField = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  // Districts depend on selected region (cascading)
  const districts = useMemo(() => {
    if (!form.region) return [];
    const region = GHANA_REGIONS.find((r) => r.name === form.region);
    return region ? getDistrictsByRegion(region.code) : [];
  }, [form.region]);

  // Calculate age from DOB
  const calculatedAge = useMemo(() => {
    if (!form.dateOfBirth) return null;
    const dob = new Date(form.dateOfBirth);
    if (isNaN(dob.getTime())) return null;
    const now = new Date();
    let age = now.getFullYear() - dob.getFullYear();
    const m = now.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
    return age >= 0 && age < 150 ? age : null;
  }, [form.dateOfBirth]);

  // Validate the form before submission
  const validateForm = (): boolean => {
    const errs: Record<string, string> = {};

    if (!form.firstName.trim()) errs.firstName = "First name is required";
    if (!form.lastName.trim()) errs.lastName = "Last name is required";

    // DOB future check
    if (form.dateOfBirth) {
      const dob = new Date(form.dateOfBirth);
      if (dob > new Date()) {
        errs.dateOfBirth = "Date of birth cannot be in the future";
      }
    }

    // Ghana Card validation
    if (form.ghanaCard) {
      const ghResult = validateGhanaCard(form.ghanaCard);
      if (!ghResult.valid) {
        errs.ghanaCard = ghResult.error || "Invalid Ghana Card format";
      }
    }

    // Phone validation
    if (form.phone) {
      const phoneResult = validateGhanaPhone(form.phone);
      if (!phoneResult.valid) {
        errs.phone = phoneResult.error || "Invalid phone number";
      }
    }
    if (form.alternativePhone) {
      const phoneResult = validateGhanaPhone(form.alternativePhone);
      if (!phoneResult.valid) {
        errs.alternativePhone = phoneResult.error || "Invalid phone number";
      }
    }
    if (form.emergencyContactPhone) {
      const phoneResult = validateGhanaPhone(form.emergencyContactPhone);
      if (!phoneResult.valid) {
        errs.emergencyContactPhone = phoneResult.error || "Invalid phone number";
      }
    }
    if (form.nextOfKinPhone) {
      const phoneResult = validateGhanaPhone(form.nextOfKinPhone);
      if (!phoneResult.valid) {
        errs.nextOfKinPhone = phoneResult.error || "Invalid phone number";
      }
    }

    // Email validation
    if (form.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(form.email)) {
        errs.email = "Invalid email format";
      }
    }

    // "Other" relationship requires a description
    if (form.emergencyContactRelationship === "Other" && !form.emergencyContactRelationshipOther.trim()) {
      errs.emergencyContactRelationshipOther = "Please specify the relationship";
    }
    if (form.nextOfKinRelationship === "Other" && !form.nextOfKinRelationshipOther.trim()) {
      errs.nextOfKinRelationshipOther = "Please specify the relationship";
    }

    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      toast.error("Please fix the validation errors before submitting");
    }
    return Object.keys(errs).length === 0;
  };

  const submitPatient = async (force: boolean) => {
    // Normalize phone numbers + Ghana Card before submission
    const normalizedPhone = form.phone ? validateGhanaPhone(form.phone).normalized : "";
    const normalizedAltPhone = form.alternativePhone ? validateGhanaPhone(form.alternativePhone).normalized : "";
    const normalizedEmergencyPhone = form.emergencyContactPhone ? validateGhanaPhone(form.emergencyContactPhone).normalized : "";
    const normalizedNokPhone = form.nextOfKinPhone ? validateGhanaPhone(form.nextOfKinPhone).normalized : "";
    const normalizedGhanaCard = form.ghanaCard ? validateGhanaCard(form.ghanaCard).normalized : "";

    // If next-of-kin is same as emergency contact, copy the values
    const finalNokName = form.nokSameAsEmergency ? form.emergencyContactName : form.nextOfKinName;
    const finalNokRel = form.nokSameAsEmergency ? form.emergencyContactRelationship : form.nextOfKinRelationship;
    const finalNokRelOther = form.nokSameAsEmergency ? form.emergencyContactRelationshipOther : form.nextOfKinRelationshipOther;
    const finalNokPhone = form.nokSameAsEmergency ? normalizedEmergencyPhone : normalizedNokPhone;
    const finalNokAltPhone = form.nokSameAsEmergency ? form.emergencyContactAltPhone : form.nextOfKinAltPhone;
    const finalNokAddress = form.nokSameAsEmergency ? form.emergencyContactAddress : form.nextOfKinAddress;

    const payload = {
      ...form,
      phone: normalizedPhone,
      alternativePhone: normalizedAltPhone,
      emergencyContactPhone: normalizedEmergencyPhone,
      emergencyContactAltPhone: form.emergencyContactAltPhone ? validateGhanaPhone(form.emergencyContactAltPhone).normalized : "",
      nextOfKinName: finalNokName,
      nextOfKinRelationship: finalNokRel,
      nextOfKinRelationshipOther: finalNokRelOther,
      nextOfKinPhone: finalNokPhone,
      nextOfKinAltPhone: finalNokAltPhone,
      nextOfKinAddress: finalNokAddress,
      ghanaCard: normalizedGhanaCard,
      region: form.region, // store region name (the API stores this in Patient.region)
      district: form.district, // store district name (API stores this in Patient.city for now — backward compatible)
      // Multiple insurance coverages
      insuranceCoverages: insuranceCoverages.filter((c) => c.insuranceProviderId),
      registeredAtFacilityId: activeFacilityId,
      force,
    };
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
    if (!validateForm()) return;
    setSaving(true);
    mutation.mutate(forceCreate);
  };

  const handleUseExistingPatient = (id: string) => {
    selectPatient(id);
    setView("patient_360");
    toast.success("Opening existing patient record");
  };

  // Scroll to a section when clicking the navigator
  const scrollToSection = (sectionId: string) => {
    const el = document.getElementById(`section-${sectionId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="space-y-4 pb-8">
      {/* Header with Back button */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => setView("patients")} className="gap-1">
          <ArrowLeft className="w-4 h-4" /> Back to Patients
        </Button>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-slate-900">Register New Patient</h2>
        <p className="text-sm text-slate-500">
          Capture the patient&apos;s demographic, contact, and identification details.
        </p>
      </div>

      {/* Layout: section navigator (left, sticky) + form (right, fills width) */}
      <div className="flex flex-col md:flex-row gap-4 md:items-start">
        {/* Section Navigator — sticky inside the main scroll container.
            Uses top-2 to account for the <main> padding.
            items-start on the parent prevents the nav from stretching to
            match the form's height (which would prevent sticky from working). */}
        <nav className="md:w-52 shrink-0">
          <div className="md:sticky md:top-2 z-10">
            <div className="hidden md:flex flex-col gap-1 p-3 rounded-lg bg-slate-50 border border-slate-200">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1 px-2">
                Registration Sections
              </p>
              {SECTIONS.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => scrollToSection(s.id)}
                  className="flex items-center gap-2 px-2 py-1.5 rounded text-xs text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 transition text-left"
                >
                  <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[10px] font-semibold shrink-0">
                    {i + 1}
                  </span>
                  <s.icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{s.label}</span>
                </button>
              ))}
            </div>
            {/* Mobile: horizontal scroll */}
            <div className="md:hidden flex gap-1 overflow-x-auto pb-2 -mx-1 px-1">
              {SECTIONS.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => scrollToSection(s.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs bg-slate-100 text-slate-700 hover:bg-emerald-100 hover:text-emerald-700 transition shrink-0"
                >
                  <span className="w-4 h-4 rounded-full bg-slate-300 text-slate-600 flex items-center justify-center text-[9px] font-semibold">
                    {i + 1}
                  </span>
                  <s.icon className="w-3 h-3" />
                  <span>{s.label}</span>
                </button>
              ))}
            </div>
          </div>
        </nav>

        {/* Main form content — scrolls naturally with the page */}
        <form onSubmit={handleSubmit} className="flex-1 min-w-0 space-y-4">
          {/* SECTION 1 — Identification */}
          <Card id="section-identification" className="scroll-mt-4">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className="w-4 h-4 text-blue-600" /> Patient Identification
              </CardTitle>
              <CardDescription>Identifiers used for duplicate detection and cross-facility matching.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Ghana Card Number</Label>
                <Input
                  value={form.ghanaCard}
                  onChange={(e) => setField("ghanaCard", e.target.value)}
                  placeholder="GHA-XXXXXXXXX-X"
                  className={errors.ghanaCard ? "border-rose-400" : ""}
                />
                {errors.ghanaCard && <p className="text-[10px] text-rose-600 mt-1">{errors.ghanaCard}</p>}
                <p className="text-[10px] text-slate-500 mt-1">Format: GHA-9digits-1check digit. Used for duplicate detection.</p>
              </div>
              <div>
                <Label>Passport Number</Label>
                <Input value={form.passport} onChange={(e) => setField("passport", e.target.value)} placeholder="Passport number" />
              </div>
            </CardContent>
          </Card>

          {/* SECTION 2 — Personal Information */}
          <Card id="section-personal" className="scroll-mt-4">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="w-4 h-4 text-emerald-600" /> Personal Information
              </CardTitle>
              <CardDescription>Basic demographic details about the patient.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <FieldLabel required>First Name</FieldLabel>
                <Input
                  value={form.firstName}
                  onChange={(e) => setField("firstName", e.target.value)}
                  className={errors.firstName ? "border-rose-400" : ""}
                  required
                />
                {errors.firstName && <p className="text-[10px] text-rose-600 mt-1">{errors.firstName}</p>}
              </div>
              <div>
                <Label>Middle Name</Label>
                <Input value={form.middleName} onChange={(e) => setField("middleName", e.target.value)} />
              </div>
              <div>
                <FieldLabel required>Last Name</FieldLabel>
                <Input
                  value={form.lastName}
                  onChange={(e) => setField("lastName", e.target.value)}
                  className={errors.lastName ? "border-rose-400" : ""}
                  required
                />
                {errors.lastName && <p className="text-[10px] text-rose-600 mt-1">{errors.lastName}</p>}
              </div>
              <div>
                <Label>Previous Name</Label>
                <Input value={form.previousName} onChange={(e) => setField("previousName", e.target.value)} />
              </div>
              <div>
                <Label>Date of Birth</Label>
                <Input
                  type="date"
                  value={form.dateOfBirth}
                  onChange={(e) => setField("dateOfBirth", e.target.value)}
                  max={new Date().toISOString().slice(0, 10)}
                  className={errors.dateOfBirth ? "border-rose-400" : ""}
                />
                {errors.dateOfBirth && <p className="text-[10px] text-rose-600 mt-1">{errors.dateOfBirth}</p>}
              </div>
              <div>
                <Label>Age (auto-calculated)</Label>
                <Input
                  value={calculatedAge !== null ? `${calculatedAge} years` : "—"}
                  disabled
                  className="bg-slate-50 text-slate-600"
                />
                <p className="text-[10px] text-slate-500 mt-1">Calculated from Date of Birth</p>
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
            </CardContent>
          </Card>

          {/* SECTION 3 — Contact Information */}
          <Card id="section-contact" className="scroll-mt-4">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Phone className="w-4 h-4 text-cyan-600" /> Contact Information
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Primary Phone</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setField("phone", e.target.value)}
                  placeholder="e.g. 024 123 4567 or +233241234567"
                  className={errors.phone ? "border-rose-400" : ""}
                />
                {errors.phone && <p className="text-[10px] text-rose-600 mt-1">{errors.phone}</p>}
              </div>
              <div>
                <Label>Alternative Phone</Label>
                <Input
                  value={form.alternativePhone}
                  onChange={(e) => setField("alternativePhone", e.target.value)}
                  placeholder="Secondary phone number"
                  className={errors.alternativePhone ? "border-rose-400" : ""}
                />
                {errors.alternativePhone && <p className="text-[10px] text-rose-600 mt-1">{errors.alternativePhone}</p>}
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setField("email", e.target.value)}
                  placeholder="patient@example.com"
                  className={errors.email ? "border-rose-400" : ""}
                />
                {errors.email && <p className="text-[10px] text-rose-600 mt-1">{errors.email}</p>}
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

          {/* SECTION 4 — Residential Address (Region + District cascading) */}
          <Card id="section-address" className="scroll-mt-4">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <MapPin className="w-4 h-4 text-amber-600" /> Residential Address
              </CardTitle>
              <CardDescription>Ghana region and district/municipal/metropolitan assembly.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Region</Label>
                <Select
                  value={form.region || undefined}
                  onValueChange={(v) => {
                    setField("region", v);
                    setField("district", ""); // Reset district when region changes
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Select region" /></SelectTrigger>
                  <SelectContent>
                    {GHANA_REGIONS.map((r) => (
                      <SelectItem key={r.code} value={r.name}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-slate-500 mt-1">All 16 regions of Ghana</p>
              </div>
              <div>
                <Label>District / Municipal / Metropolitan Assembly</Label>
                <Select
                  value={form.district || undefined}
                  onValueChange={(v) => setField("district", v)}
                  disabled={!form.region}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={form.region ? "Select district" : "Select region first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {districts.map((d) => (
                      <SelectItem key={d.code} value={d.name}>
                        {d.name} <span className="text-[10px] text-slate-400 ml-1">({d.type})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-slate-500 mt-1">
                  {form.region ? `${districts.length} districts available` : "Select a region to load districts"}
                </p>
              </div>
              <div>
                <Label>Community / Town</Label>
                <Input value={form.city} onChange={(e) => setField("city", e.target.value)} placeholder="e.g. Kumasi, Tema" />
              </div>
              <div>
                <Label>Street Address / Landmark</Label>
                <Input value={form.address} onChange={(e) => setField("address", e.target.value)} placeholder="House number, street, landmark" />
              </div>
              <div>
                <Label>Nationality</Label>
                <Input value={form.nationality} onChange={(e) => setField("nationality", e.target.value)} />
              </div>
            </CardContent>
          </Card>

          {/* SECTION 5 — Emergency Contact (with relationship dropdown) */}
          <Card id="section-emergency" className="scroll-mt-4">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600" /> Emergency Contact
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Full Name</Label>
                <Input value={form.emergencyContactName} onChange={(e) => setField("emergencyContactName", e.target.value)} />
              </div>
              <div>
                <Label>Relationship</Label>
                <Select
                  value={form.emergencyContactRelationship || undefined}
                  onValueChange={(v) => setField("emergencyContactRelationship", v)}
                >
                  <SelectTrigger><SelectValue placeholder="Select relationship" /></SelectTrigger>
                  <SelectContent>
                    {RELATIONSHIP_TYPES.map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {form.emergencyContactRelationship === "Other" && (
                <div className="md:col-span-2">
                  <Label>Specify Relationship</Label>
                  <Input
                    value={form.emergencyContactRelationshipOther}
                    onChange={(e) => setField("emergencyContactRelationshipOther", e.target.value)}
                    placeholder="Describe the relationship"
                    className={errors.emergencyContactRelationshipOther ? "border-rose-400" : ""}
                  />
                  {errors.emergencyContactRelationshipOther && (
                    <p className="text-[10px] text-rose-600 mt-1">{errors.emergencyContactRelationshipOther}</p>
                  )}
                </div>
              )}
              <div>
                <Label>Phone</Label>
                <Input
                  value={form.emergencyContactPhone}
                  onChange={(e) => setField("emergencyContactPhone", e.target.value)}
                  placeholder="e.g. 024 123 4567"
                  className={errors.emergencyContactPhone ? "border-rose-400" : ""}
                />
                {errors.emergencyContactPhone && <p className="text-[10px] text-rose-600 mt-1">{errors.emergencyContactPhone}</p>}
              </div>
              <div>
                <Label>Alternative Phone</Label>
                <Input
                  value={form.emergencyContactAltPhone}
                  onChange={(e) => setField("emergencyContactAltPhone", e.target.value)}
                  placeholder="Secondary phone"
                />
              </div>
              <div className="md:col-span-2">
                <Label>Address</Label>
                <Input
                  value={form.emergencyContactAddress}
                  onChange={(e) => setField("emergencyContactAddress", e.target.value)}
                  placeholder="Emergency contact address"
                />
              </div>
            </CardContent>
          </Card>

          {/* SECTION 6 — Next of Kin (with "Same as Emergency Contact" + relationship dropdown) */}
          <Card id="section-kin" className="scroll-mt-4">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Heart className="w-4 h-4 text-violet-600" /> Next of Kin
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.nokSameAsEmergency}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setField("nokSameAsEmergency", checked ? "true" : "false");
                    setForm((p) => ({ ...p, nokSameAsEmergency: checked }));
                  }}
                  className="w-4 h-4"
                />
                Same as Emergency Contact
              </label>
              <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${form.nokSameAsEmergency ? "opacity-50 pointer-events-none" : ""}`}>
                <div>
                  <Label>Full Name</Label>
                  <Input value={form.nextOfKinName} onChange={(e) => setField("nextOfKinName", e.target.value)} disabled={form.nokSameAsEmergency} />
                </div>
                <div>
                  <Label>Relationship</Label>
                  <Select
                    value={form.nextOfKinRelationship || undefined}
                    onValueChange={(v) => setField("nextOfKinRelationship", v)}
                    disabled={form.nokSameAsEmergency}
                  >
                    <SelectTrigger><SelectValue placeholder="Select relationship" /></SelectTrigger>
                    <SelectContent>
                      {RELATIONSHIP_TYPES.map((r) => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {form.nextOfKinRelationship === "Other" && !form.nokSameAsEmergency && (
                  <div className="md:col-span-2">
                    <Label>Specify Relationship</Label>
                    <Input
                      value={form.nextOfKinRelationshipOther}
                      onChange={(e) => setField("nextOfKinRelationshipOther", e.target.value)}
                      placeholder="Describe the relationship"
                      className={errors.nextOfKinRelationshipOther ? "border-rose-400" : ""}
                    />
                    {errors.nextOfKinRelationshipOther && (
                      <p className="text-[10px] text-rose-600 mt-1">{errors.nextOfKinRelationshipOther}</p>
                    )}
                  </div>
                )}
                <div>
                  <Label>Phone</Label>
                  <Input
                    value={form.nextOfKinPhone}
                    onChange={(e) => setField("nextOfKinPhone", e.target.value)}
                    placeholder="e.g. 024 123 4567"
                    disabled={form.nokSameAsEmergency}
                    className={errors.nextOfKinPhone ? "border-rose-400" : ""}
                  />
                  {errors.nextOfKinPhone && <p className="text-[10px] text-rose-600 mt-1">{errors.nextOfKinPhone}</p>}
                </div>
                <div>
                  <Label>Alternative Phone</Label>
                  <Input
                    value={form.nextOfKinAltPhone}
                    onChange={(e) => setField("nextOfKinAltPhone", e.target.value)}
                    placeholder="Secondary phone"
                    disabled={form.nokSameAsEmergency}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label>Address</Label>
                  <Input
                    value={form.nextOfKinAddress}
                    onChange={(e) => setField("nextOfKinAddress", e.target.value)}
                    placeholder="Next of kin address"
                    disabled={form.nokSameAsEmergency}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* SECTION 7 — Insurance */}
          <Card id="section-insurance" className="scroll-mt-4 overflow-visible">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-600" /> Insurance Information
              </CardTitle>
              <CardDescription>
                Add one or more insurance coverages. Designate one as Primary. Leave empty for self-pay patients.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {insuranceCoverages.length === 0 && (
                <div className="text-sm text-slate-500 italic py-4 text-center bg-slate-50 rounded-lg border border-dashed border-slate-300">
                  No insurance coverage added. Patient will be registered as self-pay.
                </div>
              )}

              {insuranceCoverages.map((coverage, idx) => (
                <div key={idx} className="p-4 rounded-lg border border-slate-200 bg-slate-50/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-700">
                        Coverage {idx + 1}
                        {coverage.isPrimary && (
                          <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] bg-emerald-100 text-emerald-700 border border-emerald-200">
                            PRIMARY
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {!coverage.isPrimary && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setInsuranceField(idx, "isPrimary", true)}
                          className="h-7 text-xs gap-1"
                        >
                          <Check className="w-3 h-3" /> Set as Primary
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => removeInsuranceCoverage(idx)}
                        className="h-7 text-xs text-rose-600 hover:text-rose-700 gap-1"
                      >
                        <X className="w-3 h-3" /> Remove
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="md:col-span-3">
                      <Label>Insurance Provider</Label>
                      <InsuranceProviderSelect
                        value={coverage.insuranceProviderId ? { id: coverage.insuranceProviderId, label: coverage.insuranceProviderName || "" } as EntitySelectValue : null}
                        onChange={(v) => {
                          setInsuranceField(idx, "insuranceProviderId", v?.id || "");
                          setInsuranceField(idx, "insuranceProviderName", v?.label || "");
                        }}
                      />
                    </div>
                    <div>
                      <Label>Membership / Insurance Number</Label>
                      <Input
                        value={coverage.membershipNumber}
                        onChange={(e) => setInsuranceField(idx, "membershipNumber", e.target.value)}
                        disabled={!coverage.insuranceProviderId}
                        placeholder={coverage.insuranceProviderId ? "e.g. NHIS1234567890" : "Select provider first"}
                      />
                    </div>
                    <div>
                      <Label>Policy Number</Label>
                      <Input
                        value={coverage.policyNumber}
                        onChange={(e) => setInsuranceField(idx, "policyNumber", e.target.value)}
                        disabled={!coverage.insuranceProviderId}
                      />
                    </div>
                    <div>
                      <Label>Principal Member</Label>
                      <Input
                        value={coverage.principalMember}
                        onChange={(e) => setInsuranceField(idx, "principalMember", e.target.value)}
                        disabled={!coverage.insuranceProviderId}
                        placeholder="Self or name of principal"
                      />
                    </div>
                    <div>
                      <Label>Relationship to Principal</Label>
                      <Select
                        value={coverage.relationshipToPrincipal || undefined}
                        onValueChange={(v) => setInsuranceField(idx, "relationshipToPrincipal", v)}
                        disabled={!coverage.insuranceProviderId}
                      >
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
                      <Input
                        type="date"
                        value={coverage.coverageStart}
                        onChange={(e) => setInsuranceField(idx, "coverageStart", e.target.value)}
                        disabled={!coverage.insuranceProviderId}
                      />
                    </div>
                    <div>
                      <Label>Coverage End</Label>
                      <Input
                        type="date"
                        value={coverage.coverageEnd}
                        onChange={(e) => setInsuranceField(idx, "coverageEnd", e.target.value)}
                        disabled={!coverage.insuranceProviderId}
                      />
                    </div>
                  </div>
                </div>
              ))}

              <Button
                type="button"
                variant="outline"
                onClick={addInsuranceCoverage}
                className="gap-2 text-xs"
              >
                <Plus className="w-3.5 h-3.5" /> Add Insurance Coverage
              </Button>
            </CardContent>
          </Card>

          {/* SECTION 8 — Additional Information */}
          <Card id="section-additional" className="scroll-mt-4">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-600" /> Additional Information
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Occupation</Label>
                <Input value={form.occupation} onChange={(e) => setField("occupation", e.target.value)} />
              </div>
            </CardContent>
          </Card>

          {/* Submit + Cancel */}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setView("patients")}>Cancel</Button>
            <Button type="submit" disabled={saving} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
              {saving ? <Save className="w-4 h-4 animate-pulse" /> : <Check className="w-4 h-4" />}
              {saving ? "Saving..." : "Register Patient"}
            </Button>
          </div>
        </form>
      </div>

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
                  const formEl = document.querySelector("form") as HTMLFormElement | null;
                  formEl?.requestSubmit();
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
