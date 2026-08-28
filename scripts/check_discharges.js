// Check what discharge records exist in the database
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

(async () => {
  try {
    const all = await db.dischargeRecord.findMany({
      select: {
        id: true, dischargeNumber: true, status: true, isFinalized: true,
        dischargedAt: true, requestedAt: true, finalizedAt: true,
        facilityId: true, admissionId: true, patientId: true,
        dischargeType: true, disposition: true,
      },
      orderBy: { dischargedAt: "desc" },
      take: 20,
    });
    console.log(`\n=== ALL DISCHARGES (count: ${all.length}) ===`);
    all.forEach((d) => {
      console.log(`  ${d.id.slice(-8)} | status=${d.status} | finalized=${d.isFinalized} | facilityId=${d.facilityId || "NULL"} | dischargedAt=${d.dischargedAt?.toISOString()} | type=${d.dischargeType} | disp=${d.disposition}`);
    });

    // Also check what facilityIds exist
    const facilities = await db.dischargeRecord.findMany({
      select: { facilityId: true },
      distinct: ["facilityId"],
    });
    console.log(`\n=== DISTINCT facilityIds in DischargeRecord ===`);
    facilities.forEach((f) => console.log(`  ${f.facilityId || "NULL"}`));

    // Check admissions for context
    const admCount = await db.admission.count({ where: { status: "admitted" } });
    console.log(`\n=== ADMISSIONS (admitted status): ${admCount} ===`);

    const allAdm = await db.admission.count();
    console.log(`=== TOTAL ADMISSIONS: ${allAdm} ===`);
  } catch (e) {
    console.error("ERROR:", e.message);
  } finally {
    await db.$disconnect();
  }
})();
