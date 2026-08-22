"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, Users, Activity, Stethoscope, HeartPulse, FlaskConical,
  Pill, ClipboardList, BedDouble, Receipt, FileText, ScrollText,
  AlertTriangle, Phone, MapPin, Calendar, Droplet, ShieldAlert,
} from "lucide-react";
import {EmptyState, LoadingState, ErrorState, StatusBadge,
  formatDate, formatCurrency, calculateAge, safeJson} from "@/components/ui-helpers";
import { SpecialtyReferralButton } from "@/components/ui/specialty-referral-button";
import { DiagnosisPicker } from "@/components/ui/diagnosis-picker";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return safeJson(res);
}

export function Patient360View() {
  const selectedPatientId = useAppStore((s) => s.selectedPatientId);
  const setView = useAppStore((s) => s.setView);
  const selectEncounter = useAppStore((s) => s.selectEncounter);
  const [tab, setTab] = useState("overview");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["patient-360", selectedPatientId],
    queryFn: () => fetchJson(`/api/patients/${selectedPatientId}`),
    enabled: !!selectedPatientId,
  });

  if (!selectedPatientId) {
    return (
      <Card>
        <CardContent className="p-12 flex flex-col items-center text-center">
          <Users className="w-12 h-12 text-slate-300 mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 mb-1">No Patient Selected</h3>
          <p className="text-sm text-slate-500 mb-4">Select a patient from the list to view their complete 360° record.</p>
          <Button onClick={() => setView("patients")} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            <Users className="w-4 h-4" /> Go to Patients List
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) return <LoadingState rows={8} />;
  if (isError) return <ErrorState message="Failed to load patient record" onRetry={() => refetch()} />;

  const p = data?.patient;
  if (!p) return <ErrorState message="Patient not found" />;

  const fullName = `${p.firstName} ${p.middleName ? p.middleName + " " : ""}${p.lastName}`;
  const age = calculateAge(p.dateOfBirth);
  const activeAllergies = (p.allergies || []).filter((a: any) => a.status === "active");
  const chronicConditions = (p.medicalHistory || []).filter((m: any) => m.status === "chronic" || m.status === "active");
  const activeMeds = (p.prescriptions || []).filter((rx: any) => rx.status === "dispensed" || rx.status === "partially_dispensed" || rx.status === "pending");

  const openEncounter = (encounterId: string) => {
    selectEncounter(encounterId);
    setView("encounters");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => setView("patients")} className="gap-1">
          <ArrowLeft className="w-4 h-4" /> Back to Patients
        </Button>
        <div className="text-xs text-slate-500">
          Last updated {formatDate(p.updatedAt, true)}
        </div>
      </div>

      {/* Header card */}
      <Card className="border-l-4 border-l-emerald-500">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="w-20 h-20 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700 text-2xl font-bold flex-shrink-0">
              {p.firstName?.[0]?.toUpperCase()}{p.lastName?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h2 className="text-2xl font-bold text-slate-900">{fullName}</h2>
                <StatusBadge status={p.status} />
              </div>
              <div className="text-sm text-slate-500 mb-3">{p.patientNumber}</div>
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-700">
                <div className="flex items-center gap-1.5"><Calendar className="w-4 h-4 text-slate-400" /> {age} yrs</div>
                <div className="flex items-center gap-1.5"><Users className="w-4 h-4 text-slate-400" /> <span className="capitalize">{p.sex || "—"}</span></div>
                {p.bloodGroup && (
                  <div className="flex items-center gap-1.5"><Droplet className="w-4 h-4 text-rose-500" /> {p.bloodGroup}</div>
                )}
                {p.phone && (
                  <div className="flex items-center gap-1.5"><Phone className="w-4 h-4 text-slate-400" /> {p.phone}</div>
                )}
                {p.address && (
                  <div className="flex items-center gap-1.5"><MapPin className="w-4 h-4 text-slate-400" /> {p.address}{p.city ? `, ${p.city}` : ""}</div>
                )}
              </div>
              {activeAllergies.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-500" />
                  <span className="text-xs font-semibold text-rose-700">Allergies:</span>
                  {activeAllergies.map((a: any) => (
                    <Badge key={a.id} variant="outline" className="bg-rose-50 text-rose-700 border-rose-300">
                      {a.allergen}{a.severity ? ` (${a.severity})` : ""}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2 md:items-end">
              <Button onClick={() => setView("encounters")} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                <Activity className="w-4 h-4" /> New Encounter
              </Button>
              <Button variant="outline" onClick={() => setView("appointments")} className="gap-2">
                <Calendar className="w-4 h-4" /> Book Appointment
              </Button>
              <SpecialtyReferralButton
                patient={p}
                fromDepartment="OPD"
                label="Refer to Specialty"
                variant="outline"
                size="sm"
                className="border-amber-300 text-amber-700 hover:bg-amber-50"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <div className="overflow-x-auto">
          <TabsList className="flex w-max">
            <TabsTrigger value="overview" className="gap-1.5"><Activity className="w-3.5 h-3.5" /> Overview</TabsTrigger>
            <TabsTrigger value="demographics" className="gap-1.5"><Users className="w-3.5 h-3.5" /> Demographics</TabsTrigger>
            <TabsTrigger value="encounters" className="gap-1.5"><Stethoscope className="w-3.5 h-3.5" /> Encounters</TabsTrigger>
            <TabsTrigger value="consultations" className="gap-1.5"><ClipboardList className="w-3.5 h-3.5" /> Consultations</TabsTrigger>
            <TabsTrigger value="vitals" className="gap-1.5"><HeartPulse className="w-3.5 h-3.5" /> Vitals</TabsTrigger>
            <TabsTrigger value="lab" className="gap-1.5"><FlaskConical className="w-3.5 h-3.5" /> Lab</TabsTrigger>
            <TabsTrigger value="pharmacy" className="gap-1.5"><Pill className="w-3.5 h-3.5" /> Pharmacy</TabsTrigger>
            <TabsTrigger value="diagnoses" className="gap-1.5"><ClipboardList className="w-3.5 h-3.5" /> Diagnoses</TabsTrigger>
            <TabsTrigger value="admissions" className="gap-1.5"><BedDouble className="w-3.5 h-3.5" /> Admissions</TabsTrigger>
            <TabsTrigger value="billing" className="gap-1.5"><Receipt className="w-3.5 h-3.5" /> Billing</TabsTrigger>
            <TabsTrigger value="documents" className="gap-1.5"><FileText className="w-3.5 h-3.5" /> Documents</TabsTrigger>
            <TabsTrigger value="audit" className="gap-1.5"><ScrollText className="w-3.5 h-3.5" /> Audit</TabsTrigger>
          </TabsList>
        </div>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Chronic Conditions</CardTitle></CardHeader>
              <CardContent>
                {chronicConditions.length === 0 ? (
                  <EmptyState title="No chronic conditions" description="No active or chronic medical history on file." />
                ) : (
                  <ul className="space-y-2 text-sm">
                    {chronicConditions.slice(0, 10).map((m: any) => (
                      <li key={m.id} className="flex justify-between border-b last:border-0 py-2">
                        <div>
                          <div className="font-medium text-slate-900">{m.condition}</div>
                          {m.description && <div className="text-xs text-slate-500">{m.description}</div>}
                        </div>
                        <StatusBadge status={m.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Current Medications</CardTitle></CardHeader>
              <CardContent>
                {activeMeds.length === 0 ? (
                  <EmptyState title="No active prescriptions" />
                ) : (
                  <ul className="space-y-2 text-sm">
                    {activeMeds.slice(0, 10).map((rx: any) => (
                      <li key={rx.id} className="border-b last:border-0 py-2">
                        <div className="flex justify-between">
                          <span className="font-medium text-slate-900">{rx.prescriptionNumber}</span>
                          <StatusBadge status={rx.status} />
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          {(rx.items || []).map((i: any) => i.medication?.genericName || i.medication?.brandName).filter(Boolean).join(", ") || "—"}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Encounters (cross-facility)</CardTitle>
              <CardDescription>Timeline of all encounters across facilities in the organization.</CardDescription>
            </CardHeader>
            <CardContent>
              {(p.encounters || []).length === 0 ? (
                <EmptyState title="No encounters yet" />
              ) : (
                <div className="space-y-3">
                  {p.encounters.slice(0, 8).map((e: any) => (
                    <div
                      key={e.id}
                      onClick={() => openEncounter(e.id)}
                      className="flex items-center justify-between border-l-2 border-emerald-400 pl-3 py-2 cursor-pointer hover:bg-slate-50 rounded-r"
                    >
                      <div>
                        <div className="font-medium text-slate-900">{e.encounterNumber} • <span className="capitalize">{e.encounterType}</span></div>
                        <div className="text-xs text-slate-500">
                          {e.facility?.name || "—"} • {e.department?.name || "—"} • {formatDate(e.startAt, true)}
                        </div>
                      </div>
                      <StatusBadge status={e.status} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Demographics */}
        <TabsContent value="demographics">
          <Card>
            <CardHeader><CardTitle className="text-base">Full Demographic Information</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                <Info label="Patient Number" value={p.patientNumber} />
                <Info label="First Name" value={p.firstName} />
                <Info label="Middle Name" value={p.middleName} />
                <Info label="Last Name" value={p.lastName} />
                <Info label="Previous Name" value={p.previousName} />
                <Info label="Date of Birth" value={p.dateOfBirth ? formatDate(p.dateOfBirth) : "—"} />
                <Info label="Age" value={`${age} years`} />
                <Info label="Sex" value={p.sex} />
                <Info label="Gender" value={p.gender} />
                <Info label="Marital Status" value={p.maritalStatus} />
                <Info label="Nationality" value={p.nationality} />
                <Info label="Occupation" value={p.occupation} />
                <Info label="Phone" value={p.phone} />
                <Info label="Alt. Phone" value={p.alternativePhone} />
                <Info label="Email" value={p.email} />
                <Info label="Address" value={p.address} />
                <Info label="City" value={p.city} />
                <Info label="Region" value={p.region} />
                <Info label="Country" value={p.country} />
                <Info label="Blood Group" value={p.bloodGroup} />
                <Info label="Preferred Language" value={p.preferredLanguage} />
                <Info label="Registration Date" value={formatDate(p.registrationDate, true)} />
                <Info label="Status" value={<StatusBadge status={p.status} />} />
              </div>

              <Separator className="my-6" />

              <h4 className="font-semibold text-slate-900 mb-2">Identifiers</h4>
              {(p.identifiers || []).length === 0 ? (
                <p className="text-sm text-slate-500">No identifiers recorded.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {p.identifiers.map((id: any) => (
                    <div key={id.id} className="border rounded p-2 text-sm flex items-center justify-between">
                      <div>
                        <div className="font-medium text-slate-900 capitalize">{id.identifierType.replace(/_/g, " ")}</div>
                        <div className="text-xs text-slate-500 font-mono">{id.identifierValue}</div>
                      </div>
                      {id.verified && <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Verified</Badge>}
                      {id.isPrimary && <Badge variant="outline">Primary</Badge>}
                    </div>
                  ))}
                </div>
              )}

              <Separator className="my-6" />

              <h4 className="font-semibold text-slate-900 mb-2">Insurance</h4>
              {(p.insurance || []).length === 0 ? (
                <p className="text-sm text-slate-500">No insurance on file.</p>
              ) : (
                <div className="space-y-2">
                  {p.insurance.map((ins: any) => (
                    <div key={ins.id} className="border rounded p-3 text-sm">
                      <div className="font-medium text-slate-900">{ins.insuranceProvider?.name || "—"}</div>
                      <div className="text-xs text-slate-500">
                        Membership: {ins.membershipNumber || "—"} • Policy: {ins.policyNumber || "—"}
                      </div>
                      <div className="text-xs text-slate-500">
                        Coverage: {ins.coverageStart ? formatDate(ins.coverageStart) : "—"} → {ins.coverageEnd ? formatDate(ins.coverageEnd) : "—"}
                      </div>
                      <div className="mt-1">
                        <StatusBadge status={ins.verificationStatus} />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <Separator className="my-6" />

              <h4 className="font-semibold text-slate-900 mb-2">Emergency Contacts</h4>
              {(p.emergencyContacts || []).length === 0 ? (
                <p className="text-sm text-slate-500">No emergency contacts on file.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {p.emergencyContacts.map((c: any) => (
                    <div key={c.id} className="border rounded p-2 text-sm">
                      <div className="font-medium text-slate-900">{c.name}</div>
                      <div className="text-xs text-slate-500">{c.relationship || "—"} • {c.phone || "—"}</div>
                    </div>
                  ))}
                </div>
              )}

              <Separator className="my-6" />

              <h4 className="font-semibold text-slate-900 mb-2">Next of Kin</h4>
              {(p.nextOfKin || []).length === 0 ? (
                <p className="text-sm text-slate-500">No next of kin on file.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {p.nextOfKin.map((k: any) => (
                    <div key={k.id} className="border rounded p-2 text-sm">
                      <div className="font-medium text-slate-900">{k.name}</div>
                      <div className="text-xs text-slate-500">{k.relationship || "—"} • {k.phone || "—"}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Encounters */}
        <TabsContent value="encounters">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Encounters</CardTitle>
              <CardDescription>All encounters across all facilities in this organization.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {(p.encounters || []).length === 0 ? (
                <div className="p-6"><EmptyState title="No encounters" /></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-slate-50">
                      <tr>
                        <th className="text-left p-3 font-semibold text-slate-700">Encounter #</th>
                        <th className="text-left p-3 font-semibold text-slate-700">Facility</th>
                        <th className="text-left p-3 font-semibold text-slate-700">Type</th>
                        <th className="text-left p-3 font-semibold text-slate-700">Status</th>
                        <th className="text-left p-3 font-semibold text-slate-700">Started</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.encounters.map((e: any) => (
                        <tr key={e.id} onClick={() => openEncounter(e.id)} className="border-b hover:bg-emerald-50/50 cursor-pointer">
                          <td className="p-3 font-mono text-xs">{e.encounterNumber}</td>
                          <td className="p-3">{e.facility?.name || "—"}</td>
                          <td className="p-3 capitalize">{e.encounterType}</td>
                          <td className="p-3"><StatusBadge status={e.status} /></td>
                          <td className="p-3 text-slate-600">{formatDate(e.startAt, true)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Consultations */}
        <TabsContent value="consultations">
          <Card>
            <CardHeader><CardTitle className="text-base">Consultations</CardTitle></CardHeader>
            <CardContent className="p-0">
              {(p.consultations || []).length === 0 ? (
                <div className="p-6"><EmptyState title="No consultations recorded" /></div>
              ) : (
                <div className="divide-y">
                  {p.consultations.map((c: any) => (
                    <div key={c.id} className="p-4 hover:bg-slate-50">
                      <div className="flex items-center justify-between">
                        <div className="font-medium text-slate-900">{c.chiefComplaint || "—"}</div>
                        <StatusBadge status={c.status} />
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        {c.clinician ? `Dr. ${c.clinician.firstName} ${c.clinician.lastName}` : "Unknown clinician"} • {c.encounter?.facility?.name || "—"} • {formatDate(c.createdAt, true)}
                      </div>
                      {c.assessment && (
                        <div className="text-sm text-slate-700 mt-2 line-clamp-2">{c.assessment}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Vitals */}
        <TabsContent value="vitals">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Vital Signs History</CardTitle>
              <CardDescription>Chronological vital sign recordings.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {(p.vitalSigns || []).length === 0 ? (
                <div className="p-6"><EmptyState title="No vital signs recorded" /></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-slate-50">
                      <tr>
                        <th className="text-left p-3 font-semibold text-slate-700">Date</th>
                        <th className="text-left p-3 font-semibold text-slate-700">Temp</th>
                        <th className="text-left p-3 font-semibold text-slate-700">Pulse</th>
                        <th className="text-left p-3 font-semibold text-slate-700">BP</th>
                        <th className="text-left p-3 font-semibold text-slate-700">SpO₂</th>
                        <th className="text-left p-3 font-semibold text-slate-700">Wt</th>
                        <th className="text-left p-3 font-semibold text-slate-700">BMI</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.vitalSigns.map((v: any) => (
                        <tr key={v.id} className="border-b hover:bg-slate-50">
                          <td className="p-3 text-slate-600">{formatDate(v.recordedAt, true)}</td>
                          <td className="p-3">{v.temperature ? `${v.temperature}°C` : "—"}</td>
                          <td className="p-3">{v.pulse ? `${v.pulse} bpm` : "—"}</td>
                          <td className="p-3">{v.systolicBp ? `${v.systolicBp}/${v.diastolicBp}` : "—"}</td>
                          <td className="p-3">{v.oxygenSaturation ? `${v.oxygenSaturation}%` : "—"}</td>
                          <td className="p-3">{v.weight ? `${v.weight}kg` : "—"}</td>
                          <td className="p-3">{v.bmi ? v.bmi : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Lab */}
        <TabsContent value="lab">
          <Card>
            <CardHeader><CardTitle className="text-base">Lab Orders</CardTitle></CardHeader>
            <CardContent className="p-0">
              {(p.labOrders || []).length === 0 ? (
                <div className="p-6"><EmptyState title="No lab orders" /></div>
              ) : (
                <div className="divide-y">
                  {p.labOrders.map((l: any) => (
                    <div key={l.id} className="p-4 hover:bg-slate-50">
                      <div className="flex items-center justify-between">
                        <div className="font-mono text-sm font-medium text-slate-900">{l.orderNumber}</div>
                        <StatusBadge status={l.status} />
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        {l.encounter?.facility?.name || "—"} • {formatDate(l.orderedAt, true)}
                      </div>
                      {l.items && l.items.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {l.items.map((it: any) => (
                            <Badge key={it.id} variant="outline" className="text-xs">
                              {it.laboratoryTest?.name || "Test"}
                              {it.results && it.results.some((r: any) => r.isAbnormal) && (
                                <AlertTriangle className="w-3 h-3 ml-1 text-rose-500" />
                              )}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Pharmacy */}
        <TabsContent value="pharmacy">
          <Card>
            <CardHeader><CardTitle className="text-base">Prescriptions</CardTitle></CardHeader>
            <CardContent className="p-0">
              {(p.prescriptions || []).length === 0 ? (
                <div className="p-6"><EmptyState title="No prescriptions" /></div>
              ) : (
                <div className="divide-y">
                  {p.prescriptions.map((rx: any) => (
                    <div key={rx.id} className="p-4 hover:bg-slate-50">
                      <div className="flex items-center justify-between">
                        <div className="font-mono text-sm font-medium text-slate-900">{rx.prescriptionNumber}</div>
                        <StatusBadge status={rx.status} />
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        {rx.encounter?.facility?.name || "—"} • {formatDate(rx.prescribedAt, true)}
                      </div>
                      {rx.items && rx.items.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {rx.items.map((it: any) => (
                            <div key={it.id} className="text-sm flex justify-between">
                              <span className="text-slate-700">
                                {it.medication?.genericName || "Medication"} {it.medication?.strength ? `(${it.medication.strength})` : ""}
                              </span>
                              <span className="text-xs text-slate-500">
                                Disp: {it.dispensedQuantity}/{it.quantity}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Diagnoses — Centralized Diagnosis Engine */}
        <TabsContent value="diagnoses">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Stethoscope className="w-4 h-4 text-indigo-600" />
                  Diagnoses
                </CardTitle>
                <p className="text-xs text-slate-500 mt-1">
                  Active conditions, history, and chronic conditions from the centralized Diagnosis Engine.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setView("settings_diagnoses")} className="text-indigo-700">
                Manage Catalog
              </Button>
            </CardHeader>
            <CardContent className="p-4">
              {/* Active conditions summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="bg-rose-50 border border-rose-200 rounded-lg p-3">
                  <p className="text-[10px] font-bold uppercase text-rose-700">Active</p>
                  <p className="text-xl font-bold text-rose-800">{(p.diagnoses || []).filter((d: any) => d.clinicalStatus === "active").length}</p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <p className="text-[10px] font-bold uppercase text-slate-700">Historical</p>
                  <p className="text-xl font-bold text-slate-800">{(p.diagnoses || []).filter((d: any) => ["resolved", "inactive", "ruled_out"].includes(d.clinicalStatus)).length}</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-[10px] font-bold uppercase text-amber-700">Chronic</p>
                  <p className="text-xl font-bold text-amber-800">{(p.diagnoses || []).filter((d: any) => d.isChronic).length}</p>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                  <p className="text-[10px] font-bold uppercase text-purple-700">Provisional</p>
                  <p className="text-xl font-bold text-purple-800">{(p.diagnoses || []).filter((d: any) => d.diagnosisType === "provisional" || d.verificationStatus === "provisional").length}</p>
                </div>
              </div>

              {/* Diagnosis timeline — reverse chronological */}
              {(p.diagnoses || []).length === 0 ? (
                <EmptyState title="No diagnoses on record" description="Diagnoses will appear here when this patient is seen in clinical encounters." icon={Stethoscope} />
              ) : (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-700 mb-2">Diagnosis Timeline</p>
                  {(p.diagnoses || [])
                    .slice()
                    .sort((a: any, b: any) => new Date(b.diagnosedAt).getTime() - new Date(a.diagnosedAt).getTime())
                    .map((d: any) => {
                      const isChronic = d.isChronic;
                      const isActive = d.clinicalStatus === "active";
                      const isProvisional = d.diagnosisType === "provisional" || d.verificationStatus === "provisional";
                      return (
                        <div key={d.id} className="border-l-2 pl-3 py-1 relative"
                          style={{ borderColor: isActive ? (isChronic ? "#e11d48" : "#10b981") : isProvisional ? "#a855f7" : "#94a3b8" }}>
                          <div className="absolute -left-1.5 top-2 w-2.5 h-2.5 rounded-full"
                            style={{ background: isActive ? (isChronic ? "#e11d48" : "#10b981") : isProvisional ? "#a855f7" : "#94a3b8" }} />
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              {d.diagnosisCode && (
                                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">{d.diagnosisCode}</span>
                              )}
                              <span className="text-sm font-medium text-slate-900">{d.diagnosisName}</span>
                              {isChronic && <Badge variant="outline" className="text-[9px] py-0 px-1 border-rose-300 text-rose-700 bg-rose-50">CHRONIC</Badge>}
                            </div>
                            <div className="flex gap-1 items-center">
                              <Badge variant="outline" className={`text-[9px] capitalize ${d.diagnosisType === "primary" ? "border-rose-300 text-rose-700" : "border-slate-300 text-slate-600"}`}>
                                {d.diagnosisType}
                              </Badge>
                              <StatusBadge status={d.clinicalStatus} />
                            </div>
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            {formatDate(d.diagnosedAt, true)}
                            {d.encounter?.encounterNumber && ` · ${d.encounter.encounterNumber}`}
                            {d.encounter?.facility?.name && ` · ${d.encounter.facility.name}`}
                          </div>
                          {d.notes && <p className="text-xs text-slate-600 mt-1 italic">&ldquo;{d.notes}&rdquo;</p>}
                        </div>
                      );
                    })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Admissions */}
        <TabsContent value="admissions">
          <Card>
            <CardHeader><CardTitle className="text-base">Admissions</CardTitle></CardHeader>
            <CardContent className="p-0">
              {(p.admissions || []).length === 0 ? (
                <div className="p-6"><EmptyState title="No admissions" /></div>
              ) : (
                <div className="divide-y">
                  {p.admissions.map((a: any) => (
                    <div key={a.id} className="p-4 hover:bg-slate-50">
                      <div className="flex items-center justify-between">
                        <div className="font-mono text-sm font-medium text-slate-900">{a.admissionNumber}</div>
                        <StatusBadge status={a.status} />
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        {a.facility?.name || "—"} • Admitted: {formatDate(a.admittedAt, true)}
                      </div>
                      {a.bedAssignments && a.bedAssignments.length > 0 && (
                        <div className="text-xs text-slate-500 mt-1">
                          Beds: {a.bedAssignments.map((b: any) => `${b.ward?.name || "—"}/${b.bed?.bedNumber || "—"}`).join(", ")}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Billing */}
        <TabsContent value="billing" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Invoices</CardTitle></CardHeader>
            <CardContent className="p-0">
              {(p.invoices || []).length === 0 ? (
                <div className="p-6"><EmptyState title="No invoices" /></div>
              ) : (
                <div className="divide-y">
                  {p.invoices.map((inv: any) => {
                    const balance = inv.total - (inv.amountPaid || 0);
                    return (
                      <div key={inv.id} className="p-4 hover:bg-slate-50">
                        <div className="flex items-center justify-between">
                          <div className="font-mono text-sm font-medium text-slate-900">{inv.invoiceNumber}</div>
                          <StatusBadge status={inv.status} />
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          Total: {formatCurrency(inv.total)} • Paid: {formatCurrency(inv.amountPaid)} • Balance: {formatCurrency(balance)}
                        </div>
                        <div className="text-xs text-slate-500">
                          {formatDate(inv.createdAt, true)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Payments</CardTitle></CardHeader>
            <CardContent className="p-0">
              {(p.payments || []).length === 0 ? (
                <div className="p-6"><EmptyState title="No payments" /></div>
              ) : (
                <div className="divide-y">
                  {p.payments.map((pay: any) => (
                    <div key={pay.id} className="p-4 hover:bg-slate-50">
                      <div className="flex items-center justify-between">
                        <div className="font-mono text-sm font-medium text-slate-900">{pay.paymentNumber}</div>
                        <div className="font-semibold text-emerald-700">{formatCurrency(pay.amount)}</div>
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        {pay.invoice?.invoiceNumber ? `Invoice: ${pay.invoice.invoiceNumber} • ` : ""}
                        {formatDate(pay.receivedAt, true)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Documents */}
        <TabsContent value="documents">
          <Card>
            <CardHeader><CardTitle className="text-base">Documents</CardTitle></CardHeader>
            <CardContent className="p-0">
              {(p.documents || []).length === 0 ? (
                <div className="p-6"><EmptyState title="No documents" /></div>
              ) : (
                <div className="divide-y">
                  {p.documents.map((doc: any) => (
                    <div key={doc.id} className="p-4 hover:bg-slate-50 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <FileText className="w-8 h-8 text-slate-400" />
                        <div>
                          <div className="font-medium text-slate-900">{doc.title || doc.fileName || "Document"}</div>
                          <div className="text-xs text-slate-500">{doc.documentType} • {formatDate(doc.uploadedAt)}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Audit */}
        <TabsContent value="audit">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Access Log</CardTitle>
              <CardDescription>Who has accessed this patient&apos;s record.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {(p.accessLogs || []).length === 0 ? (
                <div className="p-6"><EmptyState title="No access logs" /></div>
              ) : (
                <div className="divide-y">
                  {p.accessLogs.map((log: any) => (
                    <div key={log.id} className="p-3 text-sm flex items-center justify-between">
                      <div>
                        <span className="font-medium text-slate-900">
                          {log.user ? `${log.user.firstName} ${log.user.lastName}` : "Unknown user"}
                        </span>
                        <span className="text-slate-500 ml-2">accessed via {log.accessType}</span>
                      </div>
                      <span className="text-xs text-slate-500">{formatDate(log.accessedAt, true)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold">{label}</div>
      <div className="text-sm text-slate-900 mt-0.5">{value || "—"}</div>
    </div>
  );
}
