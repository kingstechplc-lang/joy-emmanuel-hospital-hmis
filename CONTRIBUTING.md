# Contributing to Joy Emmanuel Hospital HMIS

Thank you for your interest in contributing to the Joy Emmanuel Hospital Management Information System (HMIS). This document outlines the process for contributing code, reporting issues, and submitting pull requests.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Environment](#development-environment)
- [Project Structure](#project-structure)
- [Coding Standards](#coding-standards)
- [Database Changes](#database-changes)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)
- [Commit Message Convention](#commit-message-convention)
- [Branch Naming Convention](#branch-naming-convention)
- [Security Reporting](#security-reporting)

---

## Code of Conduct

Be respectful, professional, and constructive in all interactions. Harassment, discrimination, or personal attacks will not be tolerated.

---

## Getting Started

1. **Fork** the repository on GitHub.
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/joy-emmanuel-hospital-hmis.git
   cd joy-emmanuel-hospital-hmis
   ```
3. **Install dependencies**:
   ```bash
   npm install
   ```
4. **Set up environment variables** — copy `.env.example` (or create `.env`):
   ```env
   DATABASE_URL="postgresql://user:password@host:port/db?sslmode=require"
   DIRECT_URL="postgresql://user:password@host:port/db?sslmode=require"
   NEXTAUTH_SECRET="your-secret-key-here"
   NEXTAUTH_URL="http://localhost:3000"
   ```
5. **Generate Prisma client**:
   ```bash
   npx prisma generate
   ```
6. **Push schema to database**:
   ```bash
   npm run db:push
   ```
7. **Seed the database** (creates test users, facilities, and demo data):
   ```bash
   npm run seed
   ```
8. **Start the dev server**:
   ```bash
   npm run dev
   ```
9. Open `http://localhost:3000` and log in using the quick demo login buttons.

---

## Development Environment

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 18+ | Bun is also supported |
| Next.js | 16.x | Turbopack enabled |
| TypeScript | 5.x | Strict mode |
| Prisma | 6.x | PostgreSQL/Neon |
| NextAuth | 4.x | Credentials provider |
| Tailwind CSS | 4.x | Utility-first |
| shadcn/ui | latest | Component library |
| Playwright | 1.62+ | Browser E2E tests |

---

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── api/                # API routes (REST endpoints)
│   ├── page.tsx            # Login page
│   ├── layout.tsx          # Root layout
│   └── globals.css         # Global styles
├── components/
│   ├── ui/                 # shadcn/ui components
│   ├── views/              # Feature views (one per sidebar module)
│   └── layout/             # App shell, sidebar, header
├── lib/
│   ├── auth.ts             # NextAuth configuration
│   ├── db.ts               # Prisma client singleton
│   ├── session.ts          # Server-side session helpers
│   ├── permissions.ts      # RBAC permission constants
│   └── nhis-workflow/      # NHIS/NHIA verification engine
├── stores/
│   └── app-store.ts        # Zustand store (view state, facility, patient)
├── integrations/
│   └── nhia/claim-it/      # NHIA CLAIM-it XML pipeline
└── prisma/
    └── schema.prisma       # Database schema
```

---

## Coding Standards

### TypeScript

- **Strict mode** is enabled — no `any` unless absolutely necessary (and documented why).
- Use **interfaces** for object types, **type aliases** for unions.
- Prefer **named exports** over default exports.
- Use **`const`** for variables that never reassign, **`let`** otherwise. Never `var`.

### React

- Use **function components** (not class components).
- Use **hooks** (`useState`, `useEffect`, `useMemo`, `useCallback`).
- Use **React Query** (`@tanstack/react-query`) for data fetching.
- Use **Zustand** for global state (not Redux).
- Use **shadcn/ui** components for UI elements.

### API Routes

- Every API route must:
  1. Check authentication (`getSession()`).
  2. Check authorization (`hasPermission()`).
  3. Validate organization/facility ownership.
  4. Use `apiRouteConfig` for `dynamic = "force-dynamic"`.
  5. Parse request body safely (handle empty/invalid JSON).
  6. Return structured JSON responses with appropriate HTTP status codes.

### Styling

- Use **Tailwind CSS** utility classes — no custom CSS unless necessary.
- Follow the existing color scheme (slate, emerald, rose, amber, violet).
- Use **gradient** PageHeader banners for module headers.
- Use **MiniStatCard** for KPI displays.
- Use **StatusBadge** for status indicators.

### Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Files (components) | PascalCase | `PatientPicker.tsx` |
| Files (routes) | kebab-case | `encounter-coverage/route.ts` |
| Variables | camelCase | `selectedEncounterId` |
| Constants | UPPER_SNAKE | `PERMISSIONS.INSURANCE_VIEW` |
| Database models | PascalCase | `InsuranceClaim` |
| Database fields | camelCase | `claimNumber` |
| API endpoints | kebab-case | `/api/encounter-coverage` |

---

## Database Changes

### Schema Modifications

1. **Edit** `prisma/schema.prisma`.
2. **Validate** the schema:
   ```bash
   npx prisma validate
   ```
3. **Push to database** (non-destructive):
   ```bash
   npm run db:push
   ```
4. **Regenerate Prisma client**:
   ```bash
   npx prisma generate
   ```

### Migration Policy

- **Non-destructive changes only** — never drop columns or tables in production without a migration plan.
- **Additive changes** (new fields, new models, new indexes) can use `db:push`.
- **Breaking changes** (renaming, removing fields) require a formal migration:
  ```bash
  npx prisma migrate dev --name descriptive_name
  ```
- **Never** run `prisma migrate reset` against a production database.

### Adding New Models

When adding a new Prisma model:

1. Define the model in `prisma/schema.prisma`.
2. Add appropriate indexes (`@@index`).
3. Add unique constraints (`@@unique`).
4. Add relations to existing models (with back-relations).
5. Run `npx prisma validate` to check for errors.
6. Run `npm run db:push` to apply.
7. Run `npx prisma generate` to update the client.

---

## Testing

### Backend Integration Tests

```bash
# CLAIM-it XML pipeline tests
npm run test:claimit

# Upstream NHIS workflow tests
npm run test:upstream

# End-to-end integration test (creates synthetic data, cleans up)
npm run test:e2e-integration
```

### Browser E2E Tests (Playwright)

```bash
# All browser tests (auto-starts dev server)
npm run test:e2e

# Interactive UI mode
npm run test:e2e:ui
```

### Manual Testing

Before submitting a PR, verify:

1. `npx tsc --noEmit` — 0 TypeScript errors
2. `npx prisma validate` — schema valid
3. `npm run build` — production build succeeds
4. `npm run test:claimit` — CLAIM-it tests pass
5. `npm run test:upstream` — upstream tests pass

---

## Pull Request Process

1. **Create a branch** from `main`:
   ```bash
   git checkout -b feature/descriptive-name
   ```
2. **Make your changes** following the coding standards above.
3. **Test locally**:
   ```bash
   npx tsc --noEmit
   npm run build
   npm run test:claimit
   npm run test:upstream
   ```
4. **Commit** your changes with a clear message (see convention below).
5. **Push** to your fork:
   ```bash
   git push origin feature/descriptive-name
   ```
6. **Open a Pull Request** on GitHub with:
   - A clear title describing the change
   - A description of what changed and why
   - Screenshots for UI changes
   - Test results (copy the output of the test commands)
7. **Address review feedback** — make changes, push again.

### PR Checklist

- [ ] TypeScript compiles with 0 errors
- [ ] Production build succeeds
- [ ] All existing tests pass
- [ ] New code has appropriate test coverage
- [ ] No secrets or credentials in code
- [ ] Database changes are non-destructive
- [ ] API routes have authentication + authorization checks
- [ ] UI components use existing design system (shadcn/ui + Tailwind)

---

## Commit Message Convention

Use conventional commits:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types

| Type | Use for |
|------|---------|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `refactor` | Code restructuring without behavior change |
| `perf` | Performance improvement |
| `docs` | Documentation only |
| `test` | Test additions or fixes |
| `chore` | Build, config, dependency changes |
| `ci` | CI/CD changes |

### Examples

```
feat(nhis-workflow): add eligibility verification evidence-level model

- 5 evidence levels: DIRECT_NHIA_VERIFIED through NOT_VERIFIED
- OTAC correctly fails eligibility (attendance only)
- Updated readiness engine to use evidence helper

fix(coverage-dialog): add useSession + can() to CoverageDialog

CoverageDialog was calling can() which was only defined in the parent
NhisWorkflowView, causing a ReferenceError when clicking Select Payer.

chore: install Playwright + create browser E2E tests
```

---

## Branch Naming Convention

| Pattern | Use for |
|---------|---------|
| `feature/description` | New features |
| `fix/description` | Bug fixes |
| `refactor/description` | Code refactoring |
| `docs/description` | Documentation changes |
| `test/description` | Test additions |
| `chore/description` | Build/config changes |

---

## Security Reporting

If you discover a security vulnerability:

1. **DO NOT** open a public GitHub issue.
2. Email the maintainer directly with details of the vulnerability.
3. Include steps to reproduce (if possible).
4. Wait for acknowledgment before disclosing publicly.

### Security Best Practices for Contributors

- Never commit `.env` files, API keys, passwords, or credentials.
- Always validate user input on the server side.
- Use `hasPermission()` checks on every API route.
- Enforce organization/facility isolation on all database queries.
- Hash sensitive codes (OTAC) with SHA-256 — never store in plaintext.
- Log security-relevant actions via `auditLog()`.

---

## Questions?

If you have questions about contributing, open a GitHub Discussion or contact the maintainer.

Thank you for contributing to better healthcare technology for Ghana! 🇬🇭
