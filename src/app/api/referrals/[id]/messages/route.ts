// =====================================================================
// API: /api/referrals/[id]/messages
//   GET  — list all communication messages for a referral (threaded)
//   POST — add a new message (info request, response, phone log, etc.)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { recordEvent } from "@/lib/referral-lifecycle";
import { notifyReferralMessageReceived } from "@/lib/workflow-notifications";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CLINICAL_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const referral = await db.referral.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!referral) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const messages = await db.referralMessage.findMany({
    where: { referralId: id },
    orderBy: { createdAt: "asc" },
    include: {
      senderUser: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  return NextResponse.json({ items: messages, count: messages.length });
}

// POST /api/referrals/[id]/messages
// Body: { message, messageType?, direction?, attachments? }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CLINICAL_EDIT)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }

  const { message, messageType, direction, attachments } = body;

  if (!message || !message.trim()) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const referral = await db.referral.findUnique({
    where: { id },
    select: {
      id: true,
      referralNumber: true,
      referringFacilityId: true,
      receivingFacilityId: true,
      patient: { select: { firstName: true, lastName: true } },
      referringFacility: { select: { name: true } },
    },
  });
  if (!referral) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Determine direction: if the sender is at the referring facility, it's outbound;
  // otherwise inbound (from receiving facility back to referring).
  const resolvedDirection =
    direction ||
    (session.user.facilityId === referral.referringFacilityId ? "outbound" : "inbound");

  const msg = await db.referralMessage.create({
    data: {
      referralId: id,
      senderUserId: session.user.id,
      senderFacilityId: session.user.facilityId,
      direction: resolvedDirection,
      message: message.trim(),
      messageType: messageType || "message",
      attachments: attachments ? JSON.stringify(attachments) : null,
    },
    include: {
      senderUser: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  // Record an event for info requests (the most actionable message type)
  const eventType =
    messageType === "info_request"
      ? "more_info_requested"
      : messageType === "info_response"
      ? "more_info_responded"
      : "note_added";

  await recordEvent({
    referralId: id,
    eventType,
    actorUserId: session.user.id,
    facilityId: session.user.facilityId,
    title:
      messageType === "info_request"
        ? "Information requested"
        : messageType === "info_response"
        ? "Information provided"
        : "Message added",
    description: message.slice(0, 200),
    metadata: { messageType, direction: resolvedDirection },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: session.user.facilityId || undefined,
    action: "REFERRAL_MESSAGE_SENT",
    resourceType: "referral",
    resourceId: id,
    newValues: { messageType, direction: resolvedDirection, preview: message.slice(0, 100) },
  });

  // Notify the other facility
  const notifyFacilityId =
    resolvedDirection === "outbound"
      ? referral.receivingFacilityId // outbound → notify receiving
      : referral.referringFacilityId; // inbound → notify referring
  const fromFacilityName = referral.referringFacility?.name || "Referring facility";
  const patientName = referral.patient
    ? `${referral.patient.firstName} ${referral.patient.lastName}`
    : "Unknown";

  if (notifyFacilityId) {
    await notifyReferralMessageReceived({
      organizationId: session.user.organizationId,
      facilityId: notifyFacilityId,
      referralNumber: referral.referralNumber || id.slice(-8).toUpperCase(),
      patientName,
      fromFacilityName,
      referralId: id,
      senderId: session.user.id,
      messageType: messageType || "message",
      preview: message,
    });
  }

  return NextResponse.json({ item: msg }, { status: 201 });
}
