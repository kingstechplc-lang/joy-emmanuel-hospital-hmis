// Add PageHeader to all views that are missing it
import * as fs from "fs";
import * as path from "path";

const ROOT = "/home/z/my-project/src/components/views";

interface Spec {
  file: string;
  title: string;
  description: string;
  icon: string;
  gradient: string;
}

const SPECS: Spec[] = [
  // Clinical
  { file: "clinical/immunizations-view.tsx", title: "Immunizations", description: "Track and manage patient immunization records", icon: "Syringe", gradient: "from-purple-500 to-purple-600" },
  { file: "clinical/maternity-view.tsx", title: "Maternity", description: "Manage antenatal, delivery, and postnatal records", icon: "Baby", gradient: "from-pink-500 to-rose-600" },
  { file: "clinical/referrals-view.tsx", title: "Referrals", description: "Track incoming and outgoing patient referrals", icon: "Share2", gradient: "from-blue-500 to-blue-600" },
  // Inpatient
  { file: "inpatient/admissions-view.tsx", title: "Admissions", description: "Manage patient admissions to wards and beds", icon: "BedDouble", gradient: "from-amber-500 to-orange-600" },
  { file: "inpatient/beds-view.tsx", title: "Bed Management", description: "Track bed availability and assignments across wards", icon: "Grid3x3", gradient: "from-teal-500 to-teal-600" },
  { file: "inpatient/discharges-view.tsx", title: "Discharges", description: "Process and track patient discharges", icon: "LogOut", gradient: "from-indigo-500 to-blue-600" },
  { file: "inpatient/intake-output-view.tsx", title: "Intake & Output", description: "Record patient fluid intake and output measurements", icon: "Droplets", gradient: "from-cyan-500 to-blue-600" },
  { file: "inpatient/nursing-view.tsx", title: "Nursing Notes", description: "Record nursing care notes and observations", icon: "NotebookPen", gradient: "from-emerald-500 to-teal-600" },
  { file: "inpatient/transfers-view.tsx", title: "Patient Transfers", description: "Manage inter-ward and inter-facility transfers", icon: "ArrowRightLeft", gradient: "from-purple-500 to-purple-600" },
  { file: "inpatient/ward-rounds-view.tsx", title: "Ward Rounds", description: "Document ward round findings and care plans", icon: "ClipboardCheck", gradient: "from-blue-500 to-blue-600" },
  // Lab
  { file: "lab/lab-orders-view.tsx", title: "Laboratory Orders", description: "Manage lab test orders and track sample collection", icon: "FlaskConical", gradient: "from-purple-500 to-purple-600" },
  { file: "lab/lab-results-view.tsx", title: "Laboratory Results", description: "View, verify, and release lab test results", icon: "TestTube", gradient: "from-cyan-500 to-blue-600" },
  // Imaging
  { file: "imaging/imaging-view.tsx", title: "Radiology & Imaging", description: "Manage imaging requests, reports, and verification", icon: "ScanLine", gradient: "from-blue-500 to-indigo-600" },
  // Pharmacy
  { file: "pharmacy/prescriptions-view.tsx", title: "Prescriptions", description: "View and manage patient prescriptions", icon: "FileText", gradient: "from-blue-500 to-blue-600" },
  { file: "pharmacy/dispense-view.tsx", title: "Dispensing", description: "Dispense medications and track inventory", icon: "Pill", gradient: "from-pink-500 to-rose-600" },
  // Procedures
  { file: "procedures/procedures-view.tsx", title: "Procedures", description: "Record and track medical procedures performed", icon: "Scissors", gradient: "from-teal-500 to-teal-600" },
  // Patients
  { file: "patients/patients-view.tsx", title: "Patients", description: "Search and manage all patient records", icon: "Users", gradient: "from-emerald-500 to-teal-600" },
  { file: "patients/patient-registration-view.tsx", title: "Register Patient", description: "Register a new patient with duplicate detection", icon: "UserPlus", gradient: "from-emerald-500 to-teal-600" },
  // Operations
  { file: "operations/documents-view.tsx", title: "Documents", description: "Manage patient and administrative documents", icon: "FolderOpen", gradient: "from-slate-600 to-slate-800" },
  { file: "operations/handover-view.tsx", title: "Shift Handover", description: "Record and review shift handover notes", icon: "ArrowLeftRight", gradient: "from-indigo-500 to-blue-600" },
  { file: "operations/incident-reports-view.tsx", title: "Incident Reports", description: "Report and track clinical, safety, and security incidents", icon: "AlertTriangle", gradient: "from-amber-500 to-orange-600" },
  { file: "operations/tasks-view.tsx", title: "Tasks", description: "Assign and track operational tasks", icon: "CheckSquare", gradient: "from-blue-500 to-blue-600" },
  // HR
  { file: "hr/certifications-view.tsx", title: "Certifications", description: "Track staff professional certifications and licenses", icon: "Award", gradient: "from-purple-500 to-purple-600" },
  { file: "hr/training-view.tsx", title: "Training", description: "Manage staff training programs and records", icon: "GraduationCap", gradient: "from-indigo-500 to-indigo-600" },
  // Admin
  { file: "admin/audit-logs-view.tsx", title: "Audit Logs", description: "View system activity and audit trail", icon: "ScrollText", gradient: "from-slate-600 to-slate-800" },
  { file: "admin/department-dashboard-view.tsx", title: "Department Dashboard", description: "Overview of department performance and metrics", icon: "LayoutDashboard", gradient: "from-emerald-500 to-teal-600" },
  { file: "admin/departments-admin-view.tsx", title: "Departments", description: "Manage hospital departments and units", icon: "Network", gradient: "from-emerald-500 to-teal-600" },
  { file: "admin/facilities-admin-view.tsx", title: "Facilities", description: "Manage hospital facilities and branches", icon: "Building2", gradient: "from-emerald-500 to-teal-600" },
  { file: "admin/insurance-providers-admin-view.tsx", title: "Insurance Providers", description: "Manage NHIS and private insurance providers", icon: "Building", gradient: "from-indigo-500 to-blue-600" },
  { file: "admin/lab-tests-admin-view.tsx", title: "Lab Test Catalog", description: "Configure available laboratory tests and pricing", icon: "Beaker", gradient: "from-purple-500 to-purple-600" },
  { file: "admin/medications-admin-view.tsx", title: "Medications", description: "Manage medication catalog and formulary", icon: "Pill", gradient: "from-pink-500 to-rose-600" },
  { file: "admin/permissions-admin-view.tsx", title: "Permissions", description: "View and manage system permissions by role", icon: "Key", gradient: "from-amber-500 to-orange-600" },
  { file: "admin/roles-admin-view.tsx", title: "Roles", description: "Manage user roles and role-permission assignments", icon: "BadgeCheck", gradient: "from-indigo-500 to-blue-600" },
  { file: "admin/security-view.tsx", title: "Security", description: "Monitor security events, break-glass access, and threats", icon: "Shield", gradient: "from-rose-500 to-red-600" },
  { file: "admin/services-admin-view.tsx", title: "Services & Pricing", description: "Configure medical services and pricing", icon: "DollarSign", gradient: "from-emerald-500 to-emerald-600" },
  { file: "admin/system-settings-view.tsx", title: "System Settings", description: "Configure HMIS system-wide settings", icon: "Settings", gradient: "from-slate-600 to-slate-800" },
  { file: "admin/users-admin-view.tsx", title: "Users", description: "Manage system users and their access", icon: "UserCircle", gradient: "from-blue-500 to-blue-600" },
];

let count = 0;
for (const spec of SPECS) {
  const filePath = path.join(ROOT, spec.file);
  if (!fs.existsSync(filePath)) {
    console.log(`Skipping ${spec.file} — does not exist`);
    continue;
  }

  let content = fs.readFileSync(filePath, "utf8");

  // Skip if already has PageHeader
  if (content.includes("PageHeader")) {
    console.log(`Already has PageHeader: ${spec.file}`);
    continue;
  }

  // Add import
  const importPattern = /import\s+\{([^}]+)\}\s+from\s+"@\/components\/ui-helpers";/;
  if (importPattern.test(content)) {
    content = content.replace(importPattern, (match, imports: string) => {
      if (imports.includes("PageHeader")) return match;
      return `import {${imports.trim()}, PageHeader} from "@/components/ui-helpers";`;
    });
  } else {
    // Add after last import
    const lastImport = content.lastIndexOf("import ");
    if (lastImport !== -1) {
      const lineEnd = content.indexOf("\n", lastImport);
      content = content.slice(0, lineEnd + 1) + `import { PageHeader } from "@/components/ui-helpers";\n` + content.slice(lineEnd + 1);
    }
  }

  // Find the first <h2 or header div and replace with PageHeader
  // Pattern: <div className="flex..."><div><h2 className="text-2xl font-bold text-slate-900">Title</h2>...
  const oldHeaderPattern = /<div className="flex[^"]*">\s*<div>\s*<h2[^>]*>[^<]+<\/h2>\s*(<p[^>]*>[^<]*<\/p>)?\s*<\/div>/;
  
  const newHeader = `<PageHeader
        title="${spec.title}"
        description="${spec.description}"
        icon={${spec.icon}}
        gradient="${spec.gradient}"
      />`;

  if (oldHeaderPattern.test(content)) {
    content = content.replace(oldHeaderPattern, newHeader);
    fs.writeFileSync(filePath, content);
    count++;
    console.log(`Patched: ${spec.file}`);
  } else {
    // Try simpler pattern: just <h2
    const h2Pattern = /<h2 className="text-2xl font-bold text-slate-900"[^>]*>[^<]+<\/h2>/;
    if (h2Pattern.test(content)) {
      // Find the wrapping div and replace the whole block
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("<h2") && lines[i].includes("text-2xl")) {
          // Find the start of the wrapping div
          let start = i;
          while (start > 0 && !lines[start].includes("<div className=")) start--;
          // Find the end (closing </div>)
          let end = i;
          let depth = 0;
          for (let j = start; j < lines.length; j++) {
            if (lines[j].includes("<div")) depth++;
            if (lines[j].includes("</div>")) depth--;
            if (depth === 0 && j > start) { end = j; break; }
          }
          lines.splice(start, end - start + 1, newHeader);
          content = lines.join("\n");
          fs.writeFileSync(filePath, content);
          count++;
          console.log(`Patched (h2): ${spec.file}`);
          break;
        }
      }
    } else {
      console.log(`Could not find header pattern in ${spec.file}`);
    }
  }
}

console.log(`\nDone — patched ${count} files`);
