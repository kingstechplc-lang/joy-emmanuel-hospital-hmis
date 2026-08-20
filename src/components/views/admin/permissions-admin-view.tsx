"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Key, Search, Lock } from "lucide-react";
import {EmptyState, LoadingState, ErrorState, safeJson} from "@/components/ui-helpers";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return safeJson(res);
}

export function PermissionsAdminView() {
  const [search, setSearch] = useState("");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["permissions-admin", search],
    queryFn: () => fetchJson("/api/permissions"),
  });

  const items = (data?.items || []).filter((p: any) =>
    !search || p.code?.toLowerCase().includes(search.toLowerCase()) || p.name?.toLowerCase().includes(search.toLowerCase()) || p.module?.toLowerCase().includes(search.toLowerCase())
  );

  // Group by module
  const grouped: Record<string, any[]> = items.reduce((acc: Record<string, any[]>, p: any) => {
    const mod = p.module || "general";
    if (!acc[mod]) acc[mod] = [];
    acc[mod].push(p);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Key className="w-6 h-6 text-emerald-600" />
          Permissions Catalog
        </h2>
        <p className="text-sm text-slate-500">All system-defined permissions, grouped by module. Read-only — permissions are assigned via roles.</p>
      </div>

      <Card>
        <CardContent className="p-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2 top-2.5 text-slate-400" />
            <Input className="pl-8" placeholder="Search by code, name, or module" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState rows={6} />
      ) : isError ? (
        <ErrorState message="Failed to load permissions" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              title="No permissions found"
              description="The permission catalog is empty. The system uses the in-code PERMISSIONS mapping for default roles. To make permissions editable via the UI, seed the Permission table from PERMISSIONS."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(grouped).map(([mod, perms]) => (
            <Card key={mod}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold uppercase text-slate-700">{mod}</CardTitle>
                <CardDescription className="text-xs">{perms.length} permissions</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {perms.map((p) => (
                    <div key={p.id} className="p-3 flex items-start justify-between hover:bg-slate-50">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded">{p.code}</code>
                          <span className="text-sm font-medium text-slate-900">{p.name}</span>
                        </div>
                        {p.description && <div className="text-xs text-slate-500 mt-1">{p.description}</div>}
                      </div>
                      <div className="text-right">
                        <Badge variant="outline" className="text-xs bg-slate-50">
                          <Lock className="w-3 h-3 mr-1 text-slate-400" />
                          {p._count?.roles || 0} role{p._count?.roles !== 1 ? "s" : ""}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
