// =====================================================================
// OpenAPI / Swagger Specification Generator
// =====================================================================
// This file defines the OpenAPI 3.0 spec for the HMIS API.
// It's consumed by the Swagger UI at /api-doc.
// =====================================================================

export interface OpenApiSpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description: string;
  };
  servers: { url: string; description: string }[];
  tags: { name: string; description: string }[];
  paths: Record<string, any>;
  components: {
    securitySchemes: Record<string, any>;
    schemas: Record<string, any>;
  };
  security: Record<string, any>[];
}

export function getApiDocs(): OpenApiSpec {
  return {
    openapi: "3.0.0",
    info: {
      title: "Joy Emmanuel Hospital HMIS API",
      version: "1.0.0",
      description:
        "Multi-Facility Hospital Management Information System API. " +
        "All endpoints require NextAuth authentication (session cookie). " +
        "Most endpoints also require specific RBAC permissions. " +
        "The HMIS is organization-scoped — all data is isolated by organization.",
    },
    servers: [
      {
        url: "/api",
        description: "Local development server",
      },
    ],
    tags: [
      { name: "Patients", description: "Patient Master Index — registration, search, demographics" },
      { name: "Encounters", description: "Patient visits — creation, status, clinical linkage" },
      { name: "Insurance", description: "Insurance claims, coverage, eligibility, attendance" },
      { name: "NHIA CLAIM-it", description: "XML generation, validation, export" },
      { name: "Finance", description: "Invoices, payments, refunds" },
      { name: "Clinical", description: "Consultations, diagnoses, prescriptions, dispensing" },
      { name: "Auth", description: "Authentication and session management" },
    ],
    paths: {
      "/patients": {
        get: {
          tags: ["Patients"],
          summary: "Search patients",
          description:
            "Search the Patient Master Index by name, MRN, phone, email, or identifier (Ghana Card, NHIS number). " +
            "Requires `patient.view` permission. Results are scoped to the user's organization.",
          parameters: [
            {
              name: "q",
              in: "query",
              description: "Search query (name, MRN, phone, email, Ghana Card, NHIS number)",
              required: true,
              schema: { type: "string" },
            },
            {
              name: "limit",
              in: "query",
              description: "Maximum number of results (default 50, max 200)",
              required: false,
              schema: { type: "integer", default: 50, maximum: 200 },
            },
            {
              name: "status",
              in: "query",
              description: "Filter by patient status",
              required: false,
              schema: { type: "string", enum: ["active", "inactive", "merged", "deceased"] },
            },
          ],
          responses: {
            "200": {
              description: "List of patients matching the search query",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      patients: {
                        type: "array",
                        items: { $ref: "#/components/schemas/Patient" },
                      },
                      count: { type: "integer" },
                    },
                  },
                },
              },
            },
            "401": { description: "Unauthorized — not authenticated" },
            "403": { description: "Forbidden — missing patient.view permission" },
          },
          security: [{ nextAuth: [] }],
        },
        post: {
          tags: ["Patients"],
          summary: "Register a new patient",
          description:
            "Create a new patient in the Patient Master Index. " +
            "Performs duplicate detection (Ghana Card, phone, name+DOB, insurance number). " +
            "If duplicates are found, returns HTTP 409 with match details. " +
            "Send `force: true` to bypass duplicate detection. " +
            "Requires `patient.create` permission.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PatientCreate" },
              },
            },
          },
          responses: {
            "201": {
              description: "Patient created successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      patient: { $ref: "#/components/schemas/Patient" },
                    },
                  },
                },
              },
            },
            "409": {
              description: "Possible duplicate found — review matches before proceeding",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      duplicates: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            matchType: { type: "string" },
                            patient: { $ref: "#/components/schemas/Patient" },
                          },
                        },
                      },
                      message: { type: "string" },
                    },
                  },
                },
              },
            },
            "401": { description: "Unauthorized" },
            "403": { description: "Forbidden — missing patient.create permission" },
          },
          security: [{ nextAuth: [] }],
        },
      },
      "/patients/{id}": {
        get: {
          tags: ["Patients"],
          summary: "Get patient by ID",
          description:
            "Fetch a single patient record with all relations (insurance, identifiers, encounters, etc.). " +
            "Requires `patient.view` permission. Cross-organization access is denied.",
          parameters: [
            {
              name: "id",
              in: "path",
              description: "Patient ID (cuid)",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Patient record with relations",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      patient: { $ref: "#/components/schemas/Patient" },
                    },
                  },
                },
              },
            },
            "404": { description: "Patient not found" },
            "401": { description: "Unauthorized" },
            "403": { description: "Forbidden" },
          },
          security: [{ nextAuth: [] }],
        },
      },
    },
    components: {
      securitySchemes: {
        nextAuth: {
          type: "apiKey",
          name: "next-auth.session-token",
          in: "cookie",
          description: "NextAuth session cookie (obtained by logging in via the login page)",
        },
      },
      schemas: {
        Patient: {
          type: "object",
          properties: {
            id: { type: "string", description: "Unique patient ID (cuid)" },
            patientNumber: { type: "string", description: "Patient number (JEM-0000001 format)" },
            firstName: { type: "string" },
            middleName: { type: "string", nullable: true },
            lastName: { type: "string" },
            dateOfBirth: { type: "string", format: "date-time", nullable: true },
            sex: { type: "string", enum: ["male", "female", "intersex", "unknown"], nullable: true },
            phone: { type: "string", nullable: true },
            email: { type: "string", nullable: true },
            address: { type: "string", nullable: true },
            bloodGroup: { type: "string", nullable: true },
            status: { type: "string", enum: ["active", "inactive", "merged", "deceased"] },
            organizationId: { type: "string" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
            insurance: {
              type: "array",
              items: { $ref: "#/components/schemas/PatientInsurance" },
            },
            identifiers: {
              type: "array",
              items: { $ref: "#/components/schemas/PatientIdentifier" },
            },
          },
        },
        PatientCreate: {
          type: "object",
          required: ["firstName", "lastName"],
          properties: {
            firstName: { type: "string" },
            middleName: { type: "string" },
            lastName: { type: "string" },
            dateOfBirth: { type: "string", format: "date" },
            sex: { type: "string", enum: ["male", "female", "intersex", "unknown"] },
            phone: { type: "string" },
            email: { type: "string" },
            address: { type: "string" },
            city: { type: "string" },
            region: { type: "string" },
            bloodGroup: { type: "string" },
            ghanaCard: { type: "string", description: "Ghana Card PIN (GHA-XXXXXXXXX-X format)" },
            passport: { type: "string" },
            insuranceProviderId: { type: "string", description: "Insurance provider ID (selects NHIS/private/etc.)" },
            membershipNumber: { type: "string" },
            policyNumber: { type: "string" },
            principalMember: { type: "string" },
            relationshipToPrincipal: { type: "string", enum: ["self", "spouse", "child", "parent", "other"] },
            coverageStart: { type: "string", format: "date" },
            coverageEnd: { type: "string", format: "date" },
            emergencyContactName: { type: "string" },
            emergencyContactPhone: { type: "string" },
            nextOfKinName: { type: "string" },
            nextOfKinPhone: { type: "string" },
            force: { type: "boolean", description: "Bypass duplicate detection (set to true after reviewing 409 response)" },
          },
        },
        PatientInsurance: {
          type: "object",
          properties: {
            id: { type: "string" },
            insuranceProviderId: { type: "string" },
            membershipNumber: { type: "string", nullable: true },
            policyNumber: { type: "string", nullable: true },
            principalMember: { type: "string", nullable: true },
            relationshipToPrincipal: { type: "string", nullable: true },
            coverageStart: { type: "string", format: "date-time", nullable: true },
            coverageEnd: { type: "string", format: "date-time", nullable: true },
            verificationStatus: { type: "string", enum: ["pending", "verified", "rejected", "expired"] },
            status: { type: "string", enum: ["active", "inactive"] },
            insuranceProvider: {
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                code: { type: "string" },
                providerType: { type: "string" },
                status: { type: "string" },
              },
            },
          },
        },
        PatientIdentifier: {
          type: "object",
          properties: {
            id: { type: "string" },
            identifierType: { type: "string", enum: ["ghana_card", "passport", "insurance_number", "national_id", "hospital_id", "other"] },
            identifierValue: { type: "string" },
            isPrimary: { type: "boolean" },
            verified: { type: "boolean" },
          },
        },
      },
    },
    security: [{ nextAuth: [] }],
  };
}
