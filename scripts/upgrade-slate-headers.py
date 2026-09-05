#!/usr/bin/env python3
# =====================================================================
# upgrade-slate-headers.py
#
# Upgrades the subtle `from-slate-700 to-slate-800` (dark gray) gradient
# on DialogHeader elements to a more vibrant, colorful gradient so the
# "dialogue header upgrade" is visually consistent across all modules.
#
# Module-specific mapping:
#   admin/medications-admin-view.tsx            → emerald/teal (pharmacy)
#   admin/lab-tests/* and lab-tests-admin-view   → purple/violet (lab) — already vibrant, leave alone
#   admin/insurance-providers/*                  → indigo/purple (insurance)
#   admin/facilities-admin-view.tsx              → blue/indigo (facility)
#   admin/diagnosis-engine-view.tsx              → cyan/teal (diagnostics)
#   admin/* (other: roles, depts, users, audit, services)  → indigo/purple (admin)
#   operations/* (tasks, documents, handover, incidents)    → amber/orange (operations)
#   inpatient/beds-view.tsx                      → already upgraded manually (skip)
# =====================================================================

import os
import re

ROOT = "/home/z/my-project/src/components/views"

OLD_GRADIENT = "from-slate-700 to-slate-800"

MODULE_MAP = {
    # admin files
    "admin/medications-admin-view.tsx": "from-emerald-600 to-teal-700",
    "admin/insurance-providers/provider-dialog.tsx": "from-indigo-600 to-purple-700",
    "admin/insurance-providers/provider-details.tsx": "from-indigo-600 to-purple-700",
    "admin/facilities-admin-view.tsx": "from-blue-600 to-indigo-700",
    "admin/diagnosis-engine-view.tsx": "from-cyan-600 to-blue-700",
    "admin/departments-admin-view.tsx": "from-indigo-600 to-purple-700",
    "admin/users-admin-view.tsx": "from-indigo-600 to-purple-700",
    "admin/audit-logs-view.tsx": "from-indigo-600 to-purple-700",
    "admin/roles-admin-view.tsx": "from-indigo-600 to-purple-700",
    "admin/services-admin-view.tsx": "from-indigo-600 to-purple-700",
    "admin/reports-view.tsx": "from-indigo-600 to-purple-700",
    # operations files
    "operations/tasks-view.tsx": "from-amber-500 to-orange-600",
    "operations/documents-view.tsx": "from-amber-500 to-orange-600",
    "operations/handover-view.tsx": "from-amber-500 to-orange-600",
    "operations/incident-reports-view.tsx": "from-amber-500 to-orange-600",
    # inpatient files — all use blue/indigo (inpatient theme)
    "inpatient/beds-view.tsx": "from-blue-600 to-indigo-700",
    "inpatient/admissions-view.tsx": "from-blue-600 to-indigo-700",
    "inpatient/intake-output-view.tsx": "from-blue-600 to-indigo-700",
    "inpatient/discharges-view.tsx": "from-indigo-600 to-purple-700",
    "inpatient/ward-rounds-view.tsx": "from-blue-600 to-indigo-700",
    "inpatient/transfers-view.tsx": "from-blue-600 to-indigo-700",
    "inpatient/nursing-view.tsx": "from-blue-600 to-indigo-700",
    # clinical files
    "clinical/records-desk-view.tsx": "from-blue-600 to-indigo-700",
    "clinical/queue-view.tsx": "from-cyan-600 to-blue-700",
    # extended files
    "extended/mortuary-view.tsx": "from-slate-700 to-slate-900",
}


def process_file(path: str) -> int:
    rel = os.path.relpath(path, ROOT)
    new_gradient = MODULE_MAP.get(rel)
    if not new_gradient:
        return 0
    with open(path, "r", encoding="utf-8") as f:
        src = f.read()
    new_src = src.replace(OLD_GRADIENT, new_gradient)
    if new_src != src:
        n = src.count(OLD_GRADIENT) - new_src.count(OLD_GRADIENT)
        with open(path, "w", encoding="utf-8") as f:
            f.write(new_src)
        return n
    return 0


def main():
    total = 0
    for dirpath, _, filenames in os.walk(ROOT):
        for fn in filenames:
            if not fn.endswith(".tsx"):
                continue
            path = os.path.join(dirpath, fn)
            n = process_file(path)
            if n > 0:
                total += n
                print(f"{os.path.relpath(path, ROOT)}: {n} header(s) upgraded")
    print(f"\nDone. Upgraded {total} dialog headers from slate to vibrant gradients.")


if __name__ == "__main__":
    main()
