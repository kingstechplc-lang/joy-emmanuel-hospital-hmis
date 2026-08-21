// Apply PageHeader to remaining clinical/admin views
import * as fs from "fs";
import * as path from "path";

const ROOT = "/home/z/my-project/src/components/views";

interface ViewSpec {
  file: string;
  title: string;
  description: string;
  icon: string;
  gradient: string;
  oldHeaderPattern: string;
}

const SPECS: ViewSpec[] = [
  // Clinical
  {
    file: "clinical/encounters-view.tsx",
    title: "Encounters",
    description: "View and manage all patient encounters across the facility",
    icon: "Activity",
    gradient: "from-blue-500 to-blue-600",
    oldHeaderPattern: `<h2 className="text-2xl font-bold text-slate-900">Encounters</h2>`,
  },
  {
    file: "clinical/appointments-view.tsx",
    title: "Appointments",
    description: "Schedule and manage patient appointments",
    icon: "Calendar",
    gradient: "from-cyan-500 to-cyan-600",
    oldHeaderPattern: `<h2 className="text-2xl font-bold text-slate-900">Appointments</h2>`,
  },
  {
    file: "clinical/queue-view.tsx",
    title: "Queue Management",
    description: "Manage the patient queue — call, skip, or complete patients",
    icon: "ListOrdered",
    gradient: "from-amber-500 to-orange-600",
    oldHeaderPattern: `<h2 className="text-2xl font-bold text-slate-900">Queue Management</h2>`,
  },
  {
    file: "clinical/triage-view.tsx",
    title: "Triage & Vitals",
    description: "Record triage assessments and vital signs for patients",
    icon: "Activity",
    gradient: "from-rose-500 to-red-600",
    oldHeaderPattern: `<h2 className="text-2xl font-bold text-slate-900">Triage & Vitals</h2>`,
  },
  {
    file: "clinical/consultations-view.tsx",
    title: "Consultations",
    description: "Record clinical consultations and patient assessments",
    icon: "ClipboardList",
    gradient: "from-purple-500 to-purple-600",
    oldHeaderPattern: `<h2 className="text-2xl font-bold text-slate-900">Consultations</h2>`,
  },
  // Billing
  {
    file: "billing/invoices-view.tsx",
    title: "Invoices",
    description: "Manage patient invoices and billing",
    icon: "Receipt",
    gradient: "from-rose-500 to-red-600",
    oldHeaderPattern: `<h2 className="text-2xl font-bold text-slate-900">Invoices</h2>`,
  },
  {
    file: "billing/payments-view.tsx",
    title: "Payments",
    description: "Record and track patient payments",
    icon: "CreditCard",
    gradient: "from-emerald-500 to-emerald-600",
    oldHeaderPattern: `<h2 className="text-2xl font-bold text-slate-900">Payments</h2>`,
  },
  {
    file: "billing/refunds-view.tsx",
    title: "Refunds",
    description: "Process and track payment refunds",
    icon: "RotateCcw",
    gradient: "from-orange-500 to-red-600",
    oldHeaderPattern: `<h2 className="text-2xl font-bold text-slate-900">Refunds</h2>`,
  },
  {
    file: "billing/insurance-claims-view.tsx",
    title: "Insurance Claims",
    description: "Manage NHIS and private insurance claims",
    icon: "ShieldCheck",
    gradient: "from-indigo-500 to-blue-600",
    oldHeaderPattern: `<h2 className="text-2xl font-bold text-slate-900">Insurance Claims</h2>`,
  },
  // Inventory
  {
    file: "inventory/inventory-view.tsx",
    title: "Inventory",
    description: "Manage medical supplies and stock levels",
    icon: "Boxes",
    gradient: "from-teal-500 to-teal-600",
    oldHeaderPattern: `<h2 className="text-2xl font-bold text-slate-900">Inventory</h2>`,
  },
  {
    file: "inventory/suppliers-view.tsx",
    title: "Suppliers",
    description: "Manage suppliers and vendor relationships",
    icon: "Truck",
    gradient: "from-cyan-500 to-blue-600",
    oldHeaderPattern: `<h2 className="text-2xl font-bold text-slate-900">Suppliers</h2>`,
  },
  {
    file: "inventory/purchase-orders-view.tsx",
    title: "Purchase Orders",
    description: "Create and track purchase orders",
    icon: "ShoppingCart",
    gradient: "from-amber-500 to-orange-600",
    oldHeaderPattern: `<h2 className="text-2xl font-bold text-slate-900">Purchase Orders</h2>`,
  },
  {
    file: "inventory/stock-transfers-view.tsx",
    title: "Stock Transfers",
    description: "Transfer stock between facilities and departments",
    icon: "ArrowLeftRight",
    gradient: "from-purple-500 to-purple-600",
    oldHeaderPattern: `<h2 className="text-2xl font-bold text-slate-900">Stock Transfers</h2>`,
  },
  {
    file: "inventory/equipment-view.tsx",
    title: "Equipment",
    description: "Manage medical equipment and maintenance schedules",
    icon: "Wrench",
    gradient: "from-slate-600 to-slate-800",
    oldHeaderPattern: `<h2 className="text-2xl font-bold text-slate-900">Equipment</h2>`,
  },
  // HR
  {
    file: "hr/staff-view.tsx",
    title: "Staff",
    description: "Manage hospital staff and their assignments",
    icon: "UserCog",
    gradient: "from-indigo-500 to-indigo-600",
    oldHeaderPattern: `<h2 className="text-2xl font-bold text-slate-900">Staff</h2>`,
  },
  {
    file: "hr/shifts-view.tsx",
    title: "Shifts & Leave",
    description: "Manage staff shifts and leave requests",
    icon: "CalendarClock",
    gradient: "from-violet-500 to-purple-600",
    oldHeaderPattern: `<h2 className="text-2xl font-bold text-slate-900">Shifts &amp; Leave</h2>`,
  },
  {
    file: "hr/attendance-view.tsx",
    title: "Staff Attendance",
    description: "Track staff attendance and clock-in records",
    icon: "Clock",
    gradient: "from-emerald-500 to-teal-600",
    oldHeaderPattern: `<h2 className="text-2xl font-bold text-slate-900">Staff Attendance</h2>`,
  },
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
  const importLine = `import {EmptyState, LoadingState, ErrorState, StatusBadge, formatDate, formatRelative, safeJson, PageHeader} from "@/components/ui-helpers";`;
  // Check if there's an existing ui-helpers import
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
      content = content.slice(0, lineEnd + 1) + importLine + "\n" + content.slice(lineEnd + 1);
    }
  }

  // Find the old header block and replace with PageHeader
  // The pattern is typically:
  // <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
  //   <div>
  //     <h2 className="text-2xl font-bold text-slate-900">TITLE</h2>
  //     <p className="text-sm text-slate-500">DESCRIPTION</p>
  //   </div>
  //   ...buttons...
  // </div>

  // Simpler approach: find the h2 line and replace the entire header div
  const oldHeaderBlock = /<div className="flex flex-col md:flex-row[^"]*">\s*<div>\s*<h2[^>]*>[^<]+<\/h2>\s*<p[^>]*>[^<]*<\/p>\s*<\/div>/;
  
  const newHeader = `<PageHeader
        title="${spec.title}"
        description="${spec.description}"
        icon={${spec.icon}}
        gradient="${spec.gradient}"
      />`;

  if (oldHeaderBlock.test(content)) {
    content = content.replace(oldHeaderBlock, newHeader);
    fs.writeFileSync(filePath, content);
    count++;
    console.log(`Patched: ${spec.file}`);
  } else {
    console.log(`Could not find header pattern in ${spec.file} — trying alternate`);
    // Try just replacing the h2
    if (content.includes(spec.oldHeaderPattern)) {
      // Find the surrounding div and replace
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(spec.oldHeaderPattern)) {
          // Find the start of the header div (go back to find '<div className="flex')
          let start = i;
          while (start > 0 && !lines[start].includes('<div className="flex flex-col md:flex-row')) {
            start--;
          }
          // Find the end (the closing </div> after the buttons)
          let end = i;
          let depth = 0;
          for (let j = start; j < lines.length; j++) {
            if (lines[j].includes("<div")) depth++;
            if (lines[j].includes("</div>")) depth--;
            if (depth === 0 && j > start) {
              end = j;
              break;
            }
          }
          // Replace lines start to end with PageHeader
          lines.splice(start, end - start + 1, newHeader);
          content = lines.join("\n");
          fs.writeFileSync(filePath, content);
          count++;
          console.log(`Patched (alternate): ${spec.file}`);
          break;
        }
      }
    }
  }
}

console.log(`\nDone — patched ${count} files`);
