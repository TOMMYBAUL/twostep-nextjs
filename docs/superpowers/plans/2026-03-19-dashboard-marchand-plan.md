# Dashboard Marchand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the merchant dashboard for Two-Step — auth pages, sidebar layout, product/stock/promo management, store profile, and settings.

**Architecture:** Next.js 16 App Router pages under `src/app/dashboard/` consuming existing API routes. Client components use custom hooks (`useMerchant`, `useProducts`, `usePromotions`) that call the API. The DA uses a warm brown/orange palette with fadeUp animations and a slim sidebar that expands on hover.

**Tech Stack:** Next.js 16, Supabase Auth (SSR cookies), Untitled UI + React Aria components, Tailwind CSS v4.1, Vitest

**Spec:** `docs/superpowers/specs/2026-03-19-dashboard-marchand-design.md`

---

## File Structure

```
src/
├── app/
│   ├── auth/
│   │   ├── login/page.tsx                    # Login page
│   │   └── signup/page.tsx                   # Multi-step signup
│   ├── api/
│   │   └── verify-siret/route.ts             # SIRET proxy to INSEE API
│   └── dashboard/
│       ├── layout.tsx                         # Sidebar + main area
│       ├── page.tsx                           # Redirect to /dashboard/products
│       ├── products/
│       │   ├── page.tsx                       # Product list with metrics
│       │   ├── new/page.tsx                   # Add product (3 tabs)
│       │   └── [id]/edit/page.tsx             # Edit product
│       ├── stock/page.tsx                     # Stock overview + inline adjustment
│       ├── promotions/page.tsx                # Promo list + creation form
│       ├── store/page.tsx                     # Store profile editor
│       └── settings/page.tsx                  # Account + POS + subscription
├── components/
│   └── dashboard/
│       ├── sidebar.tsx                        # DashboardSidebar (slim + expand)
│       ├── page-header.tsx                    # Eyebrow + title + action
│       ├── metric-card.tsx                    # Single metric card
│       ├── stock-badge.tsx                    # Stock level badge (ok/low/out)
│       ├── empty-state.tsx                    # Empty state with CTA
│       ├── product-form.tsx                   # Shared form (new + edit)
│       ├── product-row.tsx                    # Single product row
│       ├── toast.tsx                          # Toast notification system
│       └── tab-nav.tsx                        # Tab navigation (products/new)
├── hooks/
│   ├── use-merchant.ts                        # Fetch current merchant
│   ├── use-products.ts                        # Products CRUD
│   └── use-promotions.ts                      # Promotions CRUD
├── styles/
│   └── dashboard.css                          # DA variables + fadeUp + sidebar styles
└── lib/
    └── types.ts                               # Updated Merchant type
```

### Files to modify:
- `src/lib/types.ts` — Add new Merchant fields
- `src/app/api/merchants/route.ts` — Accept new fields in GET/POST
- `src/app/api/merchants/[id]/route.ts` — Accept new fields in GET/PATCH
- `src/middleware.ts` — Add `/auth/:path*` to matcher
- `src/styles/globals.css` — Import dashboard.css
- `supabase/migrations/002_dashboard_fields.sql` — New columns

---

### Task 1: Database Migration + Type Updates + API Modifications

**Files:**
- Create: `supabase/migrations/002_dashboard_fields.sql`
- Modify: `src/lib/types.ts`
- Modify: `src/app/api/merchants/route.ts`
- Modify: `src/app/api/merchants/[id]/route.ts`

- [ ] **Step 1: Create the database migration**

Create `supabase/migrations/002_dashboard_fields.sql`:
```sql
-- Add dashboard-required fields to merchants
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('pending', 'active', 'suspended'));
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS siret TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS opening_hours JSONB;
```

- [ ] **Step 2: Update the Merchant type**

In `src/lib/types.ts`, add to the `Merchant` type:
```typescript
export type Merchant = {
    id: string;
    user_id: string;
    name: string;
    address: string;
    city: string;
    status: "pending" | "active" | "suspended";
    siret: string | null;
    phone: string | null;
    description: string | null;
    photo_url: string | null;
    opening_hours: Record<string, { open: string; close: string } | null> | null;
    pos_type: "square" | "sumup" | "zettle" | "clover" | "lightspeed" | null;
    pos_last_sync: string | null;
    created_at: string;
    updated_at: string;
};
```

- [ ] **Step 3: Update merchants GET route to return all fields**

In `src/app/api/merchants/route.ts`, change the `.select()` to return all columns:
```typescript
const { data, error } = await supabase
    .from("merchants")
    .select("*")
    .eq("user_id", user.id)
    .single();
```

In `src/app/api/merchants/[id]/route.ts`, same change for GET:
```typescript
const { data, error } = await supabase
    .from("merchants")
    .select("*")
    .eq("id", id)
    .single();
```

- [ ] **Step 4: Update merchants POST to accept new fields**

In `src/app/api/merchants/route.ts` POST handler, add the new fields to the destructuring and insert:
```typescript
const { name, address, city, lat, lng, siret, phone, description, photo_url, opening_hours, status } = body;

// ... existing validation ...

const { data, error } = await supabase
    .from("merchants")
    .insert({
        user_id: user.id,
        name,
        address,
        city,
        location: `SRID=4326;POINT(${lng} ${lat})`,
        siret: siret ?? null,
        phone: phone ?? null,
        description: description ?? null,
        photo_url: photo_url ?? null,
        opening_hours: opening_hours ?? null,
        status: status ?? "active",
    })
    .select()
    .single();
```

- [ ] **Step 5: Update merchants PATCH to accept new fields**

In `src/app/api/merchants/[id]/route.ts` PATCH handler, add the new fields:
```typescript
const { name, address, city, lat, lng, phone, description, photo_url, opening_hours } = body;

const updates: Record<string, unknown> = {};
if (name !== undefined) updates.name = name;
if (address !== undefined) updates.address = address;
if (city !== undefined) updates.city = city;
if (phone !== undefined) updates.phone = phone;
if (description !== undefined) updates.description = description;
if (photo_url !== undefined) updates.photo_url = photo_url;
if (opening_hours !== undefined) updates.opening_hours = opening_hours;
// lat/lng handling stays the same
```

Note: `siret` and `status` are NOT accepted via PATCH — they are set at signup and by admin only.

- [ ] **Step 6: Run the migration on Supabase**

Tell the user to execute `002_dashboard_fields.sql` in Supabase SQL Editor.

- [ ] **Step 7: Verify build passes**

Run: `npm run build`
Expected: Build succeeds with no type errors.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/002_dashboard_fields.sql src/lib/types.ts src/app/api/merchants/route.ts src/app/api/merchants/\[id\]/route.ts
git commit -m "feat: add merchant dashboard fields (migration + types + API)"
```

---

### Task 2: DA CSS Variables + Dashboard Styles

**Files:**
- Create: `src/styles/dashboard.css`
- Modify: `src/styles/globals.css`

- [ ] **Step 1: Create dashboard.css with DA variables and animations**

Create `src/styles/dashboard.css`:
```css
/* ── Two-Step Dashboard DA ── */

:root {
    --ts-sidebar-bg: #3D2200;
    --ts-accent: #E8832A;
    --ts-accent-hover: #D4721F;
    --ts-accent-text: #C96A10;
    --ts-bg-warm: #f5f5f0;
    --ts-bg-card: #eeeee8;
}

@keyframes fadeUp {
    from {
        opacity: 0;
        transform: translateY(16px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

/* Stagger delay utility classes */
.animate-fade-up {
    animation: fadeUp 400ms ease both;
}

.stagger-1 { animation-delay: 50ms; }
.stagger-2 { animation-delay: 100ms; }
.stagger-3 { animation-delay: 150ms; }
.stagger-4 { animation-delay: 200ms; }
.stagger-5 { animation-delay: 250ms; }
.stagger-6 { animation-delay: 300ms; }
.stagger-7 { animation-delay: 350ms; }
.stagger-8 { animation-delay: 400ms; }
.stagger-9 { animation-delay: 450ms; }
.stagger-10 { animation-delay: 500ms; }

/* Dashboard button style */
.btn-ts {
    background: var(--ts-accent);
    color: var(--ts-sidebar-bg);
    font-weight: 500;
    padding: 10px 20px;
    border-radius: 10px;
    border: none;
    cursor: pointer;
    font-size: 13px;
    transition: transform 150ms, background 150ms;
}
.btn-ts:hover {
    background: var(--ts-accent-hover);
    transform: translateY(-1px);
}
.btn-ts:active {
    transform: scale(0.97);
}

/* Sidebar */
.sidebar-ts {
    width: 68px;
    min-width: 68px;
    background: var(--ts-sidebar-bg);
    transition: width 280ms cubic-bezier(0.4, 0, 0.2, 1),
                min-width 280ms cubic-bezier(0.4, 0, 0.2, 1);
    overflow: hidden;
}
.sidebar-ts:hover {
    width: 180px;
    min-width: 180px;
}

.sidebar-ts .nav-label {
    opacity: 0;
    transition: opacity 200ms ease 80ms;
}
.sidebar-ts:hover .nav-label {
    opacity: 1;
}

.sidebar-ts .logo-text {
    opacity: 0;
    transition: opacity 200ms ease 80ms;
}
.sidebar-ts:hover .logo-text {
    opacity: 1;
}

/* Sidebar tooltip (shown only when sidebar is collapsed) */
.sidebar-ts .nav-tooltip {
    opacity: 0;
    transition: opacity 150ms;
    pointer-events: none;
}
.sidebar-ts:not(:hover) .nav-item:hover .nav-tooltip {
    opacity: 1;
}

/* Active nav item bar */
.nav-item-active::before {
    content: "";
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 3px;
    height: 24px;
    background: var(--ts-accent);
    border-radius: 0 3px 3px 0;
}

/* Search input */
.search-ts {
    background: white;
    border: none;
    padding: 10px 16px;
    border-radius: 10px;
    font-size: 13px;
    color: #1a1a1a;
    outline: none;
    width: 280px;
}
.search-ts::placeholder {
    color: #9ca3af;
}
.search-ts:focus {
    box-shadow: 0 0 0 2px rgba(232, 131, 42, 0.3);
}

/* Product row hover */
.product-row-ts {
    transition: background 150ms, box-shadow 150ms;
}
.product-row-ts:hover {
    background: #faf9f5;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.04);
}
.product-row-ts:hover .row-arrow {
    opacity: 1;
}
```

- [ ] **Step 2: Import dashboard.css in globals.css**

Add at the end of `src/styles/globals.css`:
```css
@import "./dashboard.css";
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/styles/dashboard.css src/styles/globals.css
git commit -m "feat: add dashboard DA styles (palette, animations, sidebar)"
```

---

### Task 3: Dashboard Sidebar Component

**Files:**
- Create: `src/components/dashboard/sidebar.tsx`

- [ ] **Step 1: Create the DashboardSidebar component**

Create `src/components/dashboard/sidebar.tsx`:
```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/utils/cx";

const navItems = [
    {
        href: "/dashboard/products",
        label: "Produits",
        icon: (
            <svg className="size-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.5 7.28L12 2 3.5 7.28M20.5 7.28V16.72L12 22M20.5 7.28L12 12.56M3.5 7.28V16.72L12 22M3.5 7.28L12 12.56M12 22V12.56" />
            </svg>
        ),
    },
    {
        href: "/dashboard/stock",
        label: "Stock",
        icon: (
            <svg className="size-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 20V10M12 20V4M6 20V14" />
            </svg>
        ),
    },
    {
        href: "/dashboard/promotions",
        label: "Promotions",
        icon: (
            <svg className="size-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 7.5L12 2l10 5.5M2 7.5v4l10 5.5M2 7.5l10 5.5m10-5.5v4l-10 5.5m0 0v-4m0-7L4 9" />
            </svg>
        ),
    },
    {
        href: "/dashboard/store",
        label: "Ma boutique",
        icon: (
            <svg className="size-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 21h18M5 21V7l8-4v18M13 7h6v14M9 9h.01M9 13h.01M9 17h.01M17 11h.01M17 15h.01" />
            </svg>
        ),
    },
];

const settingsItem = {
    href: "/dashboard/settings",
    label: "Réglages",
    icon: (
        <svg className="size-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
        </svg>
    ),
};

function NavItem({ href, label, icon, isActive }: { href: string; label: string; icon: React.ReactNode; isActive: boolean }) {
    return (
        <Link
            href={href}
            className={cx(
                "nav-item relative flex items-center gap-2.5 rounded-lg px-3.5 py-2.5 whitespace-nowrap transition-colors",
                isActive
                    ? "nav-item-active bg-[rgba(232,131,42,0.18)] text-[var(--ts-accent)]"
                    : "text-white/50 hover:bg-[rgba(232,131,42,0.1)]",
            )}
        >
            {icon}
            <span className={cx("nav-label text-[13px]", isActive && "font-semibold")}>{label}</span>
            <span className="nav-tooltip absolute left-[60px] top-1/2 -translate-y-1/2 rounded-md bg-gray-900 px-2.5 py-1 text-[11px] text-white whitespace-nowrap z-10">
                {label}
            </span>
        </Link>
    );
}

export function DashboardSidebar() {
    const pathname = usePathname();

    return (
        <aside className="sidebar-ts flex h-screen flex-col shrink-0">
            {/* Logo */}
            <div className="flex h-[60px] items-center gap-2.5 px-4">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-[var(--ts-accent)] text-lg font-extrabold text-[var(--ts-sidebar-bg)]">
                    T
                </div>
                <span className="logo-text text-[15px] font-bold text-[var(--ts-accent)] whitespace-nowrap">
                    Two-Step
                </span>
            </div>

            {/* Main nav */}
            <nav className="flex flex-1 flex-col gap-0.5 px-1.5 pt-2">
                {navItems.map((item) => (
                    <NavItem
                        key={item.href}
                        {...item}
                        isActive={pathname.startsWith(item.href)}
                    />
                ))}
            </nav>

            {/* Settings (bottom) */}
            <div className="px-1.5 pb-4">
                <NavItem
                    {...settingsItem}
                    isActive={pathname.startsWith(settingsItem.href)}
                />
            </div>
        </aside>
    );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/sidebar.tsx
git commit -m "feat: add DashboardSidebar component (slim + expand on hover)"
```

---

### Task 4: Dashboard Layout + Shared Components

**Files:**
- Create: `src/app/dashboard/layout.tsx`
- Create: `src/app/dashboard/page.tsx`
- Create: `src/components/dashboard/page-header.tsx`
- Create: `src/components/dashboard/metric-card.tsx`
- Create: `src/components/dashboard/stock-badge.tsx`
- Create: `src/components/dashboard/empty-state.tsx`
- Create: `src/components/dashboard/toast.tsx`
- Create: `src/components/dashboard/tab-nav.tsx`

- [ ] **Step 1: Create dashboard layout**

Create `src/app/dashboard/layout.tsx`:
```tsx
import { DashboardSidebar } from "@/components/dashboard/sidebar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex h-screen" style={{ background: "var(--ts-bg-warm)" }}>
            <DashboardSidebar />
            <main className="flex-1 overflow-y-auto px-10 py-8">
                {children}
            </main>
        </div>
    );
}
```

- [ ] **Step 2: Create dashboard redirect page**

Create `src/app/dashboard/page.tsx`:
```tsx
import { redirect } from "next/navigation";

export default function DashboardPage() {
    redirect("/dashboard/products");
}
```

- [ ] **Step 3: Create PageHeader component**

Create `src/components/dashboard/page-header.tsx`:
```tsx
"use client";

import type { ReactNode } from "react";

interface PageHeaderProps {
    storeName?: string;
    title: string;
    titleAccent?: string;
    action?: ReactNode;
}

export function PageHeader({ storeName, title, titleAccent, action }: PageHeaderProps) {
    return (
        <div className="mb-6">
            {storeName && (
                <p className="animate-fade-up mb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    {storeName}
                </p>
            )}
            <div className="animate-fade-up stagger-1 flex items-center justify-between">
                <h1 className="text-[26px] font-medium text-gray-900">
                    {title}{" "}
                    {titleAccent && (
                        <span style={{ color: "var(--ts-accent)" }}>{titleAccent}</span>
                    )}
                </h1>
                {action}
            </div>
        </div>
    );
}
```

- [ ] **Step 4: Create MetricCard component**

Create `src/components/dashboard/metric-card.tsx`:
```tsx
interface MetricCardProps {
    label: string;
    value: number;
    variant?: "default" | "warn" | "danger";
    staggerIndex?: number;
}

export function MetricCard({ label, value, variant = "default", staggerIndex = 0 }: MetricCardProps) {
    const colorClass =
        variant === "danger"
            ? "text-red-600"
            : variant === "warn"
              ? "text-[var(--ts-accent)]"
              : "text-gray-900";

    return (
        <div
            className={`animate-fade-up rounded-[10px] p-5 stagger-${staggerIndex + 1}`}
            style={{ background: "var(--ts-bg-card)" }}
        >
            <p className="mb-1.5 text-xs font-medium text-gray-500">{label}</p>
            <p className={`text-[28px] font-bold ${colorClass}`}>{value}</p>
        </div>
    );
}
```

- [ ] **Step 5: Create StockBadge component**

Create `src/components/dashboard/stock-badge.tsx`:
```tsx
import { cx } from "@/utils/cx";

interface StockBadgeProps {
    quantity: number;
}

export function StockBadge({ quantity }: StockBadgeProps) {
    const level = quantity === 0 ? "out" : quantity <= 10 ? "low" : "ok";

    const styles = {
        ok: "bg-green-50 text-green-800",
        low: "bg-amber-50 text-amber-800",
        out: "bg-red-50 text-red-800",
    };

    const dotStyles = {
        ok: "bg-green-500",
        low: "bg-amber-500",
        out: "bg-red-500",
    };

    return (
        <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold", styles[level])}>
            <span className={cx("size-1.5 rounded-full", dotStyles[level])} />
            {quantity === 0 ? "Rupture" : quantity}
        </span>
    );
}
```

- [ ] **Step 6: Create EmptyState component**

Create `src/components/dashboard/empty-state.tsx`:
```tsx
import type { ReactNode } from "react";

interface EmptyStateProps {
    icon?: ReactNode;
    title: string;
    description: string;
    action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
    return (
        <div className="animate-fade-up stagger-3 flex flex-col items-center justify-center rounded-2xl py-16" style={{ background: "var(--ts-bg-card)" }}>
            {icon && <div className="mb-4 text-4xl">{icon}</div>}
            <h3 className="mb-1 text-base font-semibold text-gray-900">{title}</h3>
            <p className="mb-6 text-sm text-gray-500">{description}</p>
            {action}
        </div>
    );
}
```

- [ ] **Step 7: Create Toast notification component**

Create `src/components/dashboard/toast.tsx`:
```tsx
"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { cx } from "@/utils/cx";

type ToastType = "success" | "error";

interface Toast {
    id: number;
    message: string;
    type: ToastType;
}

interface ToastContextValue {
    toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
    return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const toast = useCallback((message: string, type: ToastType = "success") => {
        const id = Date.now();
        setToasts((prev) => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 3000);
    }, []);

    return (
        <ToastContext.Provider value={{ toast }}>
            {children}
            <div className="fixed right-4 bottom-4 z-50 flex flex-col gap-2">
                {toasts.map((t) => (
                    <div
                        key={t.id}
                        className={cx(
                            "animate-fade-up rounded-lg px-4 py-3 text-sm font-medium shadow-lg",
                            t.type === "success"
                                ? "bg-green-800 text-white"
                                : "bg-red-700 text-white",
                        )}
                    >
                        {t.message}
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}
```

- [ ] **Step 8: Create TabNav component**

Create `src/components/dashboard/tab-nav.tsx`:
```tsx
"use client";

import { cx } from "@/utils/cx";

interface Tab {
    id: string;
    label: string;
    disabled?: boolean;
    badge?: string;
}

interface TabNavProps {
    tabs: Tab[];
    activeTab: string;
    onTabChange: (id: string) => void;
}

export function TabNav({ tabs, activeTab, onTabChange }: TabNavProps) {
    return (
        <div className="mb-6 flex gap-1 border-b border-gray-200">
            {tabs.map((tab) => (
                <button
                    key={tab.id}
                    type="button"
                    disabled={tab.disabled}
                    onClick={() => !tab.disabled && onTabChange(tab.id)}
                    className={cx(
                        "relative px-4 py-3 text-[13px] font-semibold transition-colors",
                        activeTab === tab.id
                            ? "text-[var(--ts-accent)]"
                            : tab.disabled
                              ? "cursor-not-allowed text-gray-300"
                              : "text-gray-400 hover:text-gray-600",
                    )}
                >
                    {tab.label}
                    {tab.badge && (
                        <span className="ml-1.5 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-400">
                            {tab.badge}
                        </span>
                    )}
                    {activeTab === tab.id && (
                        <span className="absolute bottom-0 left-0 h-0.5 w-full" style={{ background: "var(--ts-accent)" }} />
                    )}
                </button>
            ))}
        </div>
    );
}
```

- [ ] **Step 9: Update dashboard layout to include ToastProvider**

Update `src/app/dashboard/layout.tsx` to wrap children:
```tsx
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { ToastProvider } from "@/components/dashboard/toast";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex h-screen" style={{ background: "var(--ts-bg-warm)" }}>
            <DashboardSidebar />
            <main className="flex-1 overflow-y-auto px-10 py-8">
                <ToastProvider>{children}</ToastProvider>
            </main>
        </div>
    );
}
```

- [ ] **Step 10: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 11: Commit**

```bash
git add src/app/dashboard/layout.tsx src/app/dashboard/page.tsx src/components/dashboard/page-header.tsx src/components/dashboard/metric-card.tsx src/components/dashboard/stock-badge.tsx src/components/dashboard/empty-state.tsx src/components/dashboard/toast.tsx src/components/dashboard/tab-nav.tsx
git commit -m "feat: add dashboard layout + shared components (header, metrics, badges, toast)"
```

---

### Task 5: useMerchant + useProducts Hooks

**Files:**
- Create: `src/hooks/use-merchant.ts`
- Create: `src/hooks/use-products.ts`
- Create: `src/hooks/use-promotions.ts`

- [ ] **Step 1: Create useMerchant hook**

Create `src/hooks/use-merchant.ts`:
```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import type { Merchant } from "@/lib/types";

export function useMerchant() {
    const [merchant, setMerchant] = useState<Merchant | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetch = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await window.fetch("/api/merchants");
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setMerchant(data.merchant);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load merchant");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetch(); }, [fetch]);

    return { merchant, loading, error, refetch: fetch };
}
```

- [ ] **Step 2: Create useProducts hook**

Create `src/hooks/use-products.ts`:
```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import type { Product } from "@/lib/types";

type ProductWithStock = Product & { stock: { quantity: number }[] };

export function useProducts(merchantId: string | undefined) {
    const [products, setProducts] = useState<ProductWithStock[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetch = useCallback(async () => {
        if (!merchantId) return;
        setLoading(true);
        setError(null);
        try {
            const res = await window.fetch(`/api/products?merchant_id=${merchantId}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setProducts(data.products ?? []);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load products");
        } finally {
            setLoading(false);
        }
    }, [merchantId]);

    useEffect(() => { fetch(); }, [fetch]);

    const createProduct = async (body: Record<string, unknown>) => {
        const res = await window.fetch("/api/products", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        await fetch();
        return data.product;
    };

    const updateProduct = async (id: string, body: Record<string, unknown>) => {
        const res = await window.fetch(`/api/products/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        await fetch();
        return data.product;
    };

    const deleteProduct = async (id: string) => {
        const res = await window.fetch(`/api/products/${id}`, { method: "DELETE" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        await fetch();
    };

    const updateStock = async (productId: string, delta?: number, quantity?: number) => {
        const body: Record<string, unknown> = { product_id: productId };
        if (delta !== undefined) body.delta = delta;
        if (quantity !== undefined) body.quantity = quantity;
        const res = await window.fetch("/api/stock", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        await fetch();
        return data.stock;
    };

    return { products, loading, error, refetch: fetch, createProduct, updateProduct, deleteProduct, updateStock };
}
```

- [ ] **Step 3: Create usePromotions hook**

Create `src/hooks/use-promotions.ts`:
```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import type { Promotion } from "@/lib/types";

type PromotionWithProduct = Promotion & {
    products: { name: string; price: number | null; photo_url: string | null; merchant_id: string };
};

export function usePromotions(merchantId: string | undefined) {
    const [promotions, setPromotions] = useState<PromotionWithProduct[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetch = useCallback(async () => {
        if (!merchantId) return;
        setLoading(true);
        setError(null);
        try {
            const res = await window.fetch(`/api/promotions?merchant_id=${merchantId}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setPromotions(data.promotions ?? []);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load promotions");
        } finally {
            setLoading(false);
        }
    }, [merchantId]);

    useEffect(() => { fetch(); }, [fetch]);

    const createPromotion = async (body: { product_id: string; sale_price: number; starts_at?: string; ends_at?: string | null }) => {
        const res = await window.fetch("/api/promotions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        await fetch();
        return data.promotion;
    };

    const deletePromotion = async (id: string) => {
        const res = await window.fetch(`/api/promotions/${id}`, { method: "DELETE" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        await fetch();
    };

    return { promotions, loading, error, refetch: fetch, createPromotion, deletePromotion };
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-merchant.ts src/hooks/use-products.ts src/hooks/use-promotions.ts
git commit -m "feat: add useMerchant, useProducts, usePromotions hooks"
```

---

### Task 6: Products List Page

**Files:**
- Create: `src/components/dashboard/product-row.tsx`
- Create: `src/app/dashboard/products/page.tsx`

- [ ] **Step 1: Create ProductRow component**

Create `src/components/dashboard/product-row.tsx`:
```tsx
import Link from "next/link";
import { StockBadge } from "./stock-badge";

interface ProductRowProps {
    id: string;
    name: string;
    category: string | null;
    price: number | null;
    stockQuantity: number;
    photoUrl: string | null;
    staggerIndex: number;
}

const CATEGORY_COLORS: Record<string, string> = {
    Alimentation: "bg-amber-50",
    Cosmétique: "bg-pink-50",
    Hygiène: "bg-blue-50",
    Textile: "bg-purple-50",
    Décoration: "bg-green-50",
    Autre: "bg-gray-100",
};

const CATEGORY_EMOJIS: Record<string, string> = {
    Alimentation: "🥖",
    Cosmétique: "✨",
    Hygiène: "🧴",
    Textile: "👕",
    Décoration: "🏠",
    Autre: "📦",
};

export function ProductRow({ id, name, category, price, stockQuantity, photoUrl, staggerIndex }: ProductRowProps) {
    const bg = CATEGORY_COLORS[category ?? "Autre"] ?? "bg-gray-100";
    const emoji = CATEGORY_EMOJIS[category ?? "Autre"] ?? "📦";

    return (
        <Link
            href={`/dashboard/products/${id}/edit`}
            className={`product-row-ts animate-fade-up stagger-${Math.min(staggerIndex + 5, 10)} flex items-center gap-4 rounded-xl bg-white px-4 py-3.5 no-underline`}
        >
            {/* Thumbnail */}
            {photoUrl ? (
                <img src={photoUrl} alt={name} className="size-[42px] shrink-0 rounded-[10px] object-cover" />
            ) : (
                <div className={`flex size-[42px] shrink-0 items-center justify-center rounded-[10px] text-xl ${bg}`}>
                    {emoji}
                </div>
            )}

            {/* Info */}
            <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900">{name}</p>
                {category && <p className="text-xs text-gray-400">{category}</p>}
            </div>

            {/* Price */}
            <p className="w-20 text-right text-sm font-semibold text-gray-900">
                {price != null ? `${price.toFixed(2)} €` : "—"}
            </p>

            {/* Stock */}
            <div className="w-24 text-center">
                <StockBadge quantity={stockQuantity} />
            </div>

            {/* Arrow */}
            <span className="row-arrow text-gray-300 opacity-0 transition-opacity">→</span>
        </Link>
    );
}
```

- [ ] **Step 2: Create Products List page**

Create `src/app/dashboard/products/page.tsx`:
```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { EmptyState } from "@/components/dashboard/empty-state";
import { MetricCard } from "@/components/dashboard/metric-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { ProductRow } from "@/components/dashboard/product-row";
import { useMerchant } from "@/hooks/use-merchant";
import { useProducts } from "@/hooks/use-products";

export default function ProductsPage() {
    const { merchant } = useMerchant();
    const { products, loading } = useProducts(merchant?.id);
    const [search, setSearch] = useState("");

    const filtered = products.filter((p) =>
        p.name.toLowerCase().includes(search.toLowerCase()),
    );

    const totalProducts = products.length;
    const inStock = products.filter((p) => (p.stock?.[0]?.quantity ?? 0) > 0).length;
    const lowStock = products.filter((p) => {
        const q = p.stock?.[0]?.quantity ?? 0;
        return q > 0 && q <= 5;
    }).length;
    const outOfStock = products.filter((p) => (p.stock?.[0]?.quantity ?? 0) === 0).length;

    return (
        <>
            <PageHeader
                storeName={merchant?.name}
                title="Mes"
                titleAccent="produits"
                action={
                    <Link href="/dashboard/products/new" className="btn-ts no-underline">
                        + Ajouter un produit
                    </Link>
                }
            />

            {/* Metrics */}
            <div className="mb-8 grid grid-cols-4 gap-4">
                <MetricCard label="Total produits" value={totalProducts} staggerIndex={0} />
                <MetricCard label="En stock" value={inStock} staggerIndex={1} />
                <MetricCard label="Stock bas" value={lowStock} variant="warn" staggerIndex={2} />
                <MetricCard label="Ruptures" value={outOfStock} variant="danger" staggerIndex={3} />
            </div>

            {/* Search + Action */}
            <div className="animate-fade-up stagger-5 mb-4 flex items-center justify-between">
                <input
                    type="text"
                    className="search-ts"
                    placeholder="Rechercher un produit..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>

            {/* Product list */}
            {loading ? (
                <div className="flex flex-col gap-1.5">
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="animate-pulse rounded-xl bg-white px-4 py-5" />
                    ))}
                </div>
            ) : filtered.length === 0 && search === "" ? (
                <EmptyState
                    icon="📦"
                    title="Aucun produit encore"
                    description="Ajoutez votre premier produit pour commencer à le rendre visible."
                    action={
                        <Link href="/dashboard/products/new" className="btn-ts no-underline">
                            Ajouter mon premier produit
                        </Link>
                    }
                />
            ) : filtered.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">Aucun résultat pour "{search}"</p>
            ) : (
                <div className="flex flex-col gap-1.5">
                    {filtered.map((product, i) => (
                        <ProductRow
                            key={product.id}
                            id={product.id}
                            name={product.name}
                            category={product.category}
                            price={product.price}
                            stockQuantity={product.stock?.[0]?.quantity ?? 0}
                            photoUrl={product.photo_url}
                            staggerIndex={i}
                        />
                    ))}
                </div>
            )}
        </>
    );
}
```

- [ ] **Step 3: Verify build and test visually**

Run: `npm run build`
Then: `npm run dev` → navigate to `http://localhost:3000/dashboard/products`
Expected: Page renders (empty state since no products yet). Sidebar works with expand on hover.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/product-row.tsx src/app/dashboard/products/page.tsx
git commit -m "feat: add products list page with metrics, search, and DA styling"
```

---

### Task 7: Product Form (New + Edit)

**Files:**
- Create: `src/components/dashboard/product-form.tsx`
- Create: `src/app/dashboard/products/new/page.tsx`
- Create: `src/app/dashboard/products/[id]/edit/page.tsx`

- [ ] **Step 1: Create ProductForm shared component**

Create `src/components/dashboard/product-form.tsx`:
```tsx
"use client";

import { useState, type FormEvent } from "react";

const CATEGORIES = ["Alimentation", "Cosmétique", "Hygiène", "Textile", "Décoration", "Autre"];

interface ProductFormProps {
    initialValues?: {
        name: string;
        description: string;
        ean: string;
        category: string;
        price: string;
        initialQuantity: string;
    };
    onSubmit: (values: {
        name: string;
        description: string;
        ean: string;
        category: string;
        price: number;
        initial_quantity: number;
    }) => Promise<void>;
    submitLabel: string;
    isLoading: boolean;
}

export function ProductForm({ initialValues, onSubmit, submitLabel, isLoading }: ProductFormProps) {
    const [name, setName] = useState(initialValues?.name ?? "");
    const [description, setDescription] = useState(initialValues?.description ?? "");
    const [ean, setEan] = useState(initialValues?.ean ?? "");
    const [category, setCategory] = useState(initialValues?.category ?? "");
    const [price, setPrice] = useState(initialValues?.price ?? "");
    const [initialQuantity, setInitialQuantity] = useState(initialValues?.initialQuantity ?? "0");
    const [errors, setErrors] = useState<Record<string, string>>({});

    const validate = () => {
        const errs: Record<string, string> = {};
        if (!name.trim()) errs.name = "Le nom est requis";
        if (!price || isNaN(Number(price)) || Number(price) < 0) errs.price = "Le prix doit être >= 0";
        setErrors(errs);
        return Object.keys(errs).length === 0;
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!validate()) return;
        await onSubmit({
            name: name.trim(),
            description: description.trim(),
            ean: ean.trim(),
            category,
            price: Number(price),
            initial_quantity: Number(initialQuantity) || 0,
        });
    };

    return (
        <form onSubmit={handleSubmit} className="animate-fade-up stagger-3 space-y-5 max-w-xl">
            {/* Name */}
            <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Nom du produit *</label>
                <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="search-ts w-full"
                    placeholder="Ex: Croissant beurre AOP"
                />
                {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
            </div>

            {/* Description */}
            <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
                <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="search-ts w-full min-h-[80px] resize-y"
                    placeholder="Description optionnelle..."
                />
            </div>

            {/* EAN */}
            <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Code EAN</label>
                <input
                    type="text"
                    value={ean}
                    onChange={(e) => setEan(e.target.value)}
                    className="search-ts w-full"
                    placeholder="Code-barres (optionnel)"
                />
            </div>

            {/* Category */}
            <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Catégorie</label>
                <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="search-ts w-full"
                >
                    <option value="">Sélectionner...</option>
                    {CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                    ))}
                </select>
            </div>

            {/* Price + Quantity row */}
            <div className="flex gap-4">
                <div className="flex-1">
                    <label className="mb-1 block text-sm font-medium text-gray-700">Prix de vente (€) *</label>
                    <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        className="search-ts w-full"
                        placeholder="0.00"
                    />
                    {errors.price && <p className="mt-1 text-xs text-red-500">{errors.price}</p>}
                </div>
                {!initialValues && (
                    <div className="flex-1">
                        <label className="mb-1 block text-sm font-medium text-gray-700">Quantité initiale</label>
                        <input
                            type="number"
                            min="0"
                            value={initialQuantity}
                            onChange={(e) => setInitialQuantity(e.target.value)}
                            className="search-ts w-full"
                            placeholder="0"
                        />
                    </div>
                )}
            </div>

            {/* Submit */}
            <div className="flex gap-3 pt-4">
                <button type="submit" className="btn-ts" disabled={isLoading}>
                    {isLoading ? "..." : submitLabel}
                </button>
            </div>
        </form>
    );
}
```

- [ ] **Step 2: Create New Product page**

Create `src/app/dashboard/products/new/page.tsx`:
```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/dashboard/page-header";
import { ProductForm } from "@/components/dashboard/product-form";
import { TabNav } from "@/components/dashboard/tab-nav";
import { useToast } from "@/components/dashboard/toast";
import { useMerchant } from "@/hooks/use-merchant";
import { useProducts } from "@/hooks/use-products";

const tabs = [
    { id: "invoice", label: "📄 Import facture", disabled: true, badge: "Bientôt" },
    { id: "ean", label: "📱 Scan EAN", disabled: true, badge: "Bientôt" },
    { id: "manual", label: "✏️ Saisie manuelle" },
];

export default function NewProductPage() {
    const router = useRouter();
    const { merchant } = useMerchant();
    const { createProduct } = useProducts(merchant?.id);
    const { toast } = useToast();
    const [activeTab, setActiveTab] = useState("manual");
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (values: { name: string; description: string; ean: string; category: string; price: number; initial_quantity: number }) => {
        setIsLoading(true);
        try {
            await createProduct({
                name: values.name,
                description: values.description || undefined,
                ean: values.ean || undefined,
                category: values.category || undefined,
                price: values.price,
                initial_quantity: values.initial_quantity,
            });
            toast("Produit créé");
            router.push("/dashboard/products");
        } catch (err) {
            toast(err instanceof Error ? err.message : "Erreur", "error");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            <PageHeader
                storeName={merchant?.name}
                title="Nouveau"
                titleAccent="produit"
                action={
                    <Link href="/dashboard/products" className="text-sm text-gray-400 hover:text-gray-600 no-underline">
                        ← Retour
                    </Link>
                }
            />

            <TabNav tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

            {activeTab === "manual" && (
                <ProductForm
                    onSubmit={handleSubmit}
                    submitLabel="Créer le produit"
                    isLoading={isLoading}
                />
            )}

            {activeTab === "invoice" && (
                <div className="animate-fade-up stagger-3 flex flex-col items-center rounded-2xl border-2 border-dashed border-gray-200 py-16 text-center" style={{ background: "var(--ts-bg-card)" }}>
                    <p className="text-3xl mb-3">📄</p>
                    <p className="text-sm font-medium text-gray-400">Import facture — Disponible prochainement</p>
                    <p className="text-xs text-gray-300 mt-1">L'IA analysera vos factures fournisseur automatiquement</p>
                </div>
            )}

            {activeTab === "ean" && (
                <div className="animate-fade-up stagger-3 flex flex-col items-center rounded-2xl border-2 border-dashed border-gray-200 py-16 text-center" style={{ background: "var(--ts-bg-card)" }}>
                    <p className="text-3xl mb-3">📱</p>
                    <p className="text-sm font-medium text-gray-400">Scan EAN — Disponible prochainement</p>
                    <p className="text-xs text-gray-300 mt-1">Scannez le code-barres pour remplir automatiquement</p>
                </div>
            )}
        </>
    );
}
```

- [ ] **Step 3: Create Edit Product page**

Create `src/app/dashboard/products/[id]/edit/page.tsx`:
```tsx
"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/dashboard/page-header";
import { ProductForm } from "@/components/dashboard/product-form";
import { useToast } from "@/components/dashboard/toast";
import { useMerchant } from "@/hooks/use-merchant";
import { useProducts } from "@/hooks/use-products";

export default function EditProductPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const { merchant } = useMerchant();
    const { products, updateProduct, deleteProduct } = useProducts(merchant?.id);
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    const product = products.find((p) => p.id === id);

    const handleSubmit = async (values: { name: string; description: string; ean: string; category: string; price: number }) => {
        setIsLoading(true);
        try {
            await updateProduct(id, {
                name: values.name,
                description: values.description || null,
                ean: values.ean || null,
                category: values.category || null,
                price: values.price,
            });
            toast("Produit mis à jour");
            router.push("/dashboard/products");
        } catch (err) {
            toast(err instanceof Error ? err.message : "Erreur", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async () => {
        try {
            await deleteProduct(id);
            toast("Produit supprimé");
            router.push("/dashboard/products");
        } catch (err) {
            toast(err instanceof Error ? err.message : "Erreur", "error");
        }
    };

    if (!product && !merchant) {
        return <div className="animate-pulse py-12 text-center text-sm text-gray-400">Chargement...</div>;
    }

    if (!product) {
        return <div className="py-12 text-center text-sm text-gray-400">Produit introuvable</div>;
    }

    return (
        <>
            <PageHeader
                storeName={merchant?.name}
                title="Modifier"
                titleAccent={product.name}
                action={
                    <Link href="/dashboard/products" className="text-sm text-gray-400 hover:text-gray-600 no-underline">
                        ← Retour
                    </Link>
                }
            />

            <ProductForm
                initialValues={{
                    name: product.name,
                    description: product.description ?? "",
                    ean: product.ean ?? "",
                    category: product.category ?? "",
                    price: product.price?.toString() ?? "",
                    initialQuantity: "0",
                }}
                onSubmit={handleSubmit}
                submitLabel="Enregistrer"
                isLoading={isLoading}
            />

            {/* Delete */}
            <div className="mt-12 border-t border-gray-200 pt-6 max-w-xl">
                {showDeleteConfirm ? (
                    <div className="flex items-center gap-3">
                        <p className="text-sm text-red-600">Supprimer définitivement ?</p>
                        <button onClick={handleDelete} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white">
                            Confirmer
                        </button>
                        <button onClick={() => setShowDeleteConfirm(false)} className="text-xs text-gray-400">
                            Annuler
                        </button>
                    </div>
                ) : (
                    <button onClick={() => setShowDeleteConfirm(true)} className="text-sm text-red-500 hover:text-red-700">
                        Supprimer ce produit
                    </button>
                )}
            </div>
        </>
    );
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/product-form.tsx src/app/dashboard/products/new/page.tsx src/app/dashboard/products/\[id\]/edit/page.tsx
git commit -m "feat: add product create/edit pages with shared form"
```

---

### Task 8: Stock Page

**Files:**
- Create: `src/app/dashboard/stock/page.tsx`

- [ ] **Step 1: Create Stock page**

Create `src/app/dashboard/stock/page.tsx`:
```tsx
"use client";

import { useState } from "react";
import { MetricCard } from "@/components/dashboard/metric-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { StockBadge } from "@/components/dashboard/stock-badge";
import { useToast } from "@/components/dashboard/toast";
import { useMerchant } from "@/hooks/use-merchant";
import { useProducts } from "@/hooks/use-products";

export default function StockPage() {
    const { merchant } = useMerchant();
    const { products, loading, updateStock } = useProducts(merchant?.id);
    const { toast } = useToast();
    const [updatingId, setUpdatingId] = useState<string | null>(null);

    const totalProducts = products.length;
    const inStock = products.filter((p) => (p.stock?.[0]?.quantity ?? 0) > 0).length;
    const lowStock = products.filter((p) => {
        const q = p.stock?.[0]?.quantity ?? 0;
        return q > 0 && q <= 5;
    }).length;
    const outOfStock = products.filter((p) => (p.stock?.[0]?.quantity ?? 0) === 0).length;

    const handleDelta = async (productId: string, delta: number) => {
        setUpdatingId(productId);
        try {
            await updateStock(productId, delta);
        } catch (err) {
            toast(err instanceof Error ? err.message : "Erreur", "error");
        } finally {
            setUpdatingId(null);
        }
    };

    const handleAbsolute = async (productId: string, value: string) => {
        const qty = parseInt(value, 10);
        if (isNaN(qty) || qty < 0) return;
        setUpdatingId(productId);
        try {
            await updateStock(productId, undefined, qty);
            toast("Stock mis à jour");
        } catch (err) {
            toast(err instanceof Error ? err.message : "Erreur", "error");
        } finally {
            setUpdatingId(null);
        }
    };

    return (
        <>
            <PageHeader
                storeName={merchant?.name}
                title="Gestion du"
                titleAccent="stock"
            />

            <div className="mb-8 grid grid-cols-4 gap-4">
                <MetricCard label="Total produits" value={totalProducts} staggerIndex={0} />
                <MetricCard label="En stock" value={inStock} staggerIndex={1} />
                <MetricCard label="Stock bas" value={lowStock} variant="warn" staggerIndex={2} />
                <MetricCard label="Ruptures" value={outOfStock} variant="danger" staggerIndex={3} />
            </div>

            {loading ? (
                <div className="flex flex-col gap-1.5">
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="animate-pulse rounded-xl bg-white px-4 py-5" />
                    ))}
                </div>
            ) : (
                <div className="flex flex-col gap-1.5">
                    {products.map((product, i) => {
                        const qty = product.stock?.[0]?.quantity ?? 0;
                        return (
                            <div
                                key={product.id}
                                className={`animate-fade-up stagger-${Math.min(i + 5, 10)} flex items-center gap-4 rounded-xl bg-white px-5 py-3.5`}
                            >
                                <div className="flex-1 min-w-0">
                                    <p className="truncate text-sm font-semibold text-gray-900">{product.name}</p>
                                    {product.category && <p className="text-xs text-gray-400">{product.category}</p>}
                                </div>

                                <StockBadge quantity={qty} />

                                {/* +/- buttons */}
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => handleDelta(product.id, -1)}
                                        disabled={updatingId === product.id || qty === 0}
                                        className="flex size-8 items-center justify-center rounded-lg bg-gray-100 text-sm font-bold text-gray-600 hover:bg-gray-200 disabled:opacity-30"
                                    >
                                        −
                                    </button>
                                    <input
                                        type="number"
                                        min="0"
                                        defaultValue={qty}
                                        onBlur={(e) => handleAbsolute(product.id, e.target.value)}
                                        className="w-16 rounded-lg bg-gray-50 px-2 py-1.5 text-center text-sm font-medium text-gray-900 outline-none focus:ring-2 focus:ring-[var(--ts-accent)]/30"
                                    />
                                    <button
                                        onClick={() => handleDelta(product.id, 1)}
                                        disabled={updatingId === product.id}
                                        className="flex size-8 items-center justify-center rounded-lg bg-gray-100 text-sm font-bold text-gray-600 hover:bg-gray-200 disabled:opacity-30"
                                    >
                                        +
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </>
    );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/stock/page.tsx
git commit -m "feat: add stock management page with inline adjustment"
```

---

### Task 9: Promotions Page

**Files:**
- Create: `src/app/dashboard/promotions/page.tsx`

- [ ] **Step 1: Create Promotions page**

Create `src/app/dashboard/promotions/page.tsx`:
```tsx
"use client";

import { useState, type FormEvent } from "react";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { useToast } from "@/components/dashboard/toast";
import { useMerchant } from "@/hooks/use-merchant";
import { useProducts } from "@/hooks/use-products";
import { usePromotions } from "@/hooks/use-promotions";

export default function PromotionsPage() {
    const { merchant } = useMerchant();
    const { products } = useProducts(merchant?.id);
    const { promotions, loading, createPromotion, deletePromotion } = usePromotions(merchant?.id);
    const { toast } = useToast();

    const [showForm, setShowForm] = useState(false);
    const [productId, setProductId] = useState("");
    const [salePrice, setSalePrice] = useState("");
    const [endsAt, setEndsAt] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleCreate = async (e: FormEvent) => {
        e.preventDefault();
        if (!productId || !salePrice) return;
        setIsSubmitting(true);
        try {
            await createPromotion({
                product_id: productId,
                sale_price: Number(salePrice),
                ends_at: endsAt || null,
            });
            toast("Promotion créée");
            setShowForm(false);
            setProductId("");
            setSalePrice("");
            setEndsAt("");
        } catch (err) {
            toast(err instanceof Error ? err.message : "Erreur", "error");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await deletePromotion(id);
            toast("Promotion supprimée");
        } catch (err) {
            toast(err instanceof Error ? err.message : "Erreur", "error");
        }
    };

    return (
        <>
            <PageHeader
                storeName={merchant?.name}
                title="Mes"
                titleAccent="promotions"
                action={
                    <button onClick={() => setShowForm(!showForm)} className="btn-ts">
                        {showForm ? "Fermer" : "+ Nouvelle promotion"}
                    </button>
                }
            />

            {/* Create form */}
            {showForm && (
                <form onSubmit={handleCreate} className="animate-fade-up mb-8 rounded-xl bg-white p-6 max-w-xl space-y-4">
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">Produit</label>
                        <select value={productId} onChange={(e) => setProductId(e.target.value)} className="search-ts w-full">
                            <option value="">Choisir un produit...</option>
                            {products.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.name} — {p.price?.toFixed(2)} €
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">Prix promotionnel (€)</label>
                        <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            value={salePrice}
                            onChange={(e) => setSalePrice(e.target.value)}
                            className="search-ts w-full"
                            placeholder="0.00"
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">Date de fin (optionnel)</label>
                        <input
                            type="date"
                            value={endsAt}
                            onChange={(e) => setEndsAt(e.target.value)}
                            className="search-ts w-full"
                        />
                    </div>
                    <button type="submit" className="btn-ts" disabled={isSubmitting}>
                        {isSubmitting ? "..." : "Lancer la promotion"}
                    </button>
                </form>
            )}

            {/* Promotions list */}
            {loading ? (
                <div className="flex flex-col gap-1.5">
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className="animate-pulse rounded-xl bg-white px-4 py-5" />
                    ))}
                </div>
            ) : promotions.length === 0 ? (
                <EmptyState
                    icon="🏷️"
                    title="Aucune promotion active"
                    description="Créez une promotion pour mettre en avant vos produits."
                    action={
                        <button onClick={() => setShowForm(true)} className="btn-ts">
                            Créer une promotion
                        </button>
                    }
                />
            ) : (
                <div className="flex flex-col gap-1.5">
                    {promotions.map((promo, i) => {
                        const now = new Date();
                        const startsAt = new Date(promo.starts_at);
                        const isScheduled = startsAt > now;

                        return (
                            <div
                                key={promo.id}
                                className={`animate-fade-up stagger-${Math.min(i + 3, 10)} flex items-center gap-4 rounded-xl bg-white px-5 py-4`}
                            >
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-gray-900">
                                        {promo.products?.name ?? "Produit"}
                                    </p>
                                    <p className="text-xs text-gray-400 mt-0.5">
                                        <span className="line-through">{promo.products?.price?.toFixed(2)} €</span>
                                        {" → "}
                                        <span className="font-semibold" style={{ color: "var(--ts-accent)" }}>
                                            {promo.sale_price.toFixed(2)} €
                                        </span>
                                    </p>
                                </div>

                                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${isScheduled ? "bg-blue-50 text-blue-700" : "bg-green-50 text-green-700"}`}>
                                    {isScheduled ? "Programmée" : "Active"}
                                </span>

                                {promo.ends_at && (
                                    <span className="text-xs text-gray-400">
                                        Fin : {new Date(promo.ends_at).toLocaleDateString("fr-FR")}
                                    </span>
                                )}

                                <button
                                    onClick={() => handleDelete(promo.id)}
                                    className="text-xs text-red-400 hover:text-red-600"
                                >
                                    Supprimer
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </>
    );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/promotions/page.tsx
git commit -m "feat: add promotions page with create/delete"
```

---

### Task 10: Store Profile Page

**Files:**
- Create: `src/app/dashboard/store/page.tsx`

- [ ] **Step 1: Create Store page**

Create `src/app/dashboard/store/page.tsx`:
```tsx
"use client";

import { useEffect, useState, type FormEvent } from "react";
import { PageHeader } from "@/components/dashboard/page-header";
import { useToast } from "@/components/dashboard/toast";
import { useMerchant } from "@/hooks/use-merchant";

const DAYS = [
    { key: "mon", label: "Lundi" },
    { key: "tue", label: "Mardi" },
    { key: "wed", label: "Mercredi" },
    { key: "thu", label: "Jeudi" },
    { key: "fri", label: "Vendredi" },
    { key: "sat", label: "Samedi" },
    { key: "sun", label: "Dimanche" },
];

export default function StorePage() {
    const { merchant, refetch } = useMerchant();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);

    const [name, setName] = useState("");
    const [address, setAddress] = useState("");
    const [city, setCity] = useState("");
    const [phone, setPhone] = useState("");
    const [description, setDescription] = useState("");
    const [hours, setHours] = useState<Record<string, { open: string; close: string } | null>>({});

    useEffect(() => {
        if (merchant) {
            setName(merchant.name ?? "");
            setAddress(merchant.address ?? "");
            setCity(merchant.city ?? "");
            setPhone(merchant.phone ?? "");
            setDescription(merchant.description ?? "");
            setHours(merchant.opening_hours ?? {});
        }
    }, [merchant]);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!merchant) return;
        setIsLoading(true);
        try {
            const res = await fetch(`/api/merchants/${merchant.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, address, city, phone, description, opening_hours: hours }),
            });
            if (!res.ok) throw new Error("Échec de la mise à jour");
            await refetch();
            toast("Boutique mise à jour");
        } catch (err) {
            toast(err instanceof Error ? err.message : "Erreur", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const toggleDay = (dayKey: string) => {
        setHours((prev) => ({
            ...prev,
            [dayKey]: prev[dayKey] ? null : { open: "09:00", close: "18:00" },
        }));
    };

    const updateHour = (dayKey: string, field: "open" | "close", value: string) => {
        setHours((prev) => ({
            ...prev,
            [dayKey]: prev[dayKey] ? { ...prev[dayKey]!, [field]: value } : { open: "09:00", close: "18:00", [field]: value },
        }));
    };

    return (
        <>
            <PageHeader
                storeName={merchant?.name}
                title="Ma"
                titleAccent="boutique"
            />

            {/* SIRET status */}
            {merchant && (
                <div className="animate-fade-up stagger-2 mb-8 flex items-center gap-3 rounded-xl bg-white px-5 py-4">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${merchant.status === "active" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
                        {merchant.status === "active" ? "Vérifié" : "En attente"}
                    </span>
                    {merchant.siret && (
                        <span className="text-xs text-gray-400">SIRET : {merchant.siret}</span>
                    )}
                </div>
            )}

            <form onSubmit={handleSubmit} className="animate-fade-up stagger-3 space-y-5 max-w-xl">
                <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Nom de la boutique</label>
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="search-ts w-full" />
                </div>
                <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Adresse</label>
                    <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} className="search-ts w-full" />
                </div>
                <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Ville</label>
                    <input type="text" value={city} onChange={(e) => setCity(e.target.value)} className="search-ts w-full" />
                </div>
                <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Téléphone</label>
                    <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="search-ts w-full" placeholder="06 12 34 56 78" />
                </div>
                <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
                    <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="search-ts w-full min-h-[80px] resize-y" placeholder="Ce que votre boutique propose..." />
                </div>

                {/* Opening hours */}
                <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Horaires d'ouverture</label>
                    <div className="space-y-2">
                        {DAYS.map((day) => {
                            const h = hours[day.key];
                            return (
                                <div key={day.key} className="flex items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={() => toggleDay(day.key)}
                                        className={`w-24 rounded-lg px-3 py-1.5 text-xs font-medium ${h ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-400"}`}
                                    >
                                        {day.label}
                                    </button>
                                    {h ? (
                                        <>
                                            <input type="time" value={h.open} onChange={(e) => updateHour(day.key, "open", e.target.value)} className="search-ts w-28 text-sm" />
                                            <span className="text-xs text-gray-400">→</span>
                                            <input type="time" value={h.close} onChange={(e) => updateHour(day.key, "close", e.target.value)} className="search-ts w-28 text-sm" />
                                        </>
                                    ) : (
                                        <span className="text-xs text-gray-300">Fermé</span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                <button type="submit" className="btn-ts" disabled={isLoading}>
                    {isLoading ? "..." : "Enregistrer"}
                </button>
            </form>
        </>
    );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/store/page.tsx
git commit -m "feat: add store profile page with opening hours"
```

---

### Task 11: Settings Page

**Files:**
- Create: `src/app/dashboard/settings/page.tsx`

- [ ] **Step 1: Create Settings page**

Create `src/app/dashboard/settings/page.tsx`:
```tsx
"use client";

import { useState, type FormEvent } from "react";
import { PageHeader } from "@/components/dashboard/page-header";
import { useToast } from "@/components/dashboard/toast";
import { useMerchant } from "@/hooks/use-merchant";
import { createClient } from "@/lib/supabase/client";

export default function SettingsPage() {
    const { merchant } = useMerchant();
    const { toast } = useToast();
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const handlePasswordChange = async (e: FormEvent) => {
        e.preventDefault();
        if (newPassword.length < 8) {
            toast("Le mot de passe doit contenir au moins 8 caractères", "error");
            return;
        }
        if (newPassword !== confirmPassword) {
            toast("Les mots de passe ne correspondent pas", "error");
            return;
        }
        setIsLoading(true);
        try {
            const supabase = createClient();
            const { error } = await supabase.auth.updateUser({ password: newPassword });
            if (error) throw error;
            toast("Mot de passe mis à jour");
            setNewPassword("");
            setConfirmPassword("");
        } catch (err) {
            toast(err instanceof Error ? err.message : "Erreur", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const posProviders = [
        { name: "Square", status: "Bientôt" },
        { name: "SumUp", status: "Bientôt" },
        { name: "Zettle", status: "Bientôt" },
    ];

    return (
        <>
            <PageHeader
                storeName={merchant?.name}
                title=""
                titleAccent="Réglages"
            />

            {/* Account */}
            <section className="animate-fade-up stagger-2 mb-10 max-w-xl">
                <h2 className="mb-4 text-base font-semibold text-gray-900">Compte</h2>
                <div className="mb-6 rounded-xl bg-white px-5 py-4">
                    <p className="text-xs text-gray-400">Email</p>
                    <p className="text-sm font-medium text-gray-900">{merchant?.user_id ? "Chargement..." : "—"}</p>
                </div>

                <form onSubmit={handlePasswordChange} className="space-y-4 rounded-xl bg-white px-5 py-5">
                    <p className="text-sm font-medium text-gray-700">Changer le mot de passe</p>
                    <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="search-ts w-full"
                        placeholder="Nouveau mot de passe (min 8 caractères)"
                    />
                    <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="search-ts w-full"
                        placeholder="Confirmer le mot de passe"
                    />
                    <button type="submit" className="btn-ts" disabled={isLoading}>
                        {isLoading ? "..." : "Mettre à jour"}
                    </button>
                </form>
            </section>

            {/* POS */}
            <section className="animate-fade-up stagger-4 mb-10 max-w-xl">
                <h2 className="mb-4 text-base font-semibold text-gray-900">Caisse (POS)</h2>
                <div className="space-y-2">
                    {posProviders.map((pos) => (
                        <div key={pos.name} className="flex items-center justify-between rounded-xl bg-white px-5 py-4">
                            <span className="text-sm font-medium text-gray-900">{pos.name}</span>
                            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-400">
                                {pos.status}
                            </span>
                        </div>
                    ))}
                </div>
            </section>

            {/* Subscription */}
            <section className="animate-fade-up stagger-6 max-w-xl">
                <h2 className="mb-4 text-base font-semibold text-gray-900">Abonnement</h2>
                <div className="rounded-xl bg-white px-5 py-4">
                    <p className="text-sm font-semibold" style={{ color: "var(--ts-accent)" }}>Gratuit (beta)</p>
                    <p className="mt-1 text-xs text-gray-400">L'abonnement sera disponible au lancement officiel.</p>
                </div>
            </section>
        </>
    );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/settings/page.tsx
git commit -m "feat: add settings page (password, POS placeholder, subscription)"
```

---

### Task 12: Auth Pages (Login + Signup)

**Files:**
- Create: `src/app/auth/login/page.tsx`
- Create: `src/app/auth/signup/page.tsx`
- Create: `src/app/api/verify-siret/route.ts`
- Modify: `src/middleware.ts`

- [ ] **Step 1: Add auth routes to middleware matcher**

In `src/middleware.ts`, add `/auth/:path*` to the matcher array:
```typescript
export const config = {
    matcher: ["/dashboard/:path*", "/auth/:path*", "/api/merchants/:path*", "/api/products/:path*", "/api/stock/:path*", "/api/promotions/:path*"],
};
```

This ensures the session is updated when visiting auth pages (needed for redirect-if-logged-in logic).

- [ ] **Step 2: Create Login page**

Create `src/app/auth/login/page.tsx`:
```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError("");
        setIsLoading(true);
        try {
            const supabase = createClient();
            const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
            if (authError) throw authError;
            router.push("/dashboard");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Erreur de connexion");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center" style={{ background: "var(--ts-bg-warm)" }}>
            <div className="w-full max-w-sm">
                {/* Logo */}
                <div className="mb-8 text-center">
                    <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-[var(--ts-accent)] text-xl font-extrabold text-[var(--ts-sidebar-bg)]">
                        T
                    </div>
                    <h1 className="text-xl font-semibold text-gray-900">Connexion</h1>
                    <p className="mt-1 text-sm text-gray-400">Accédez à votre dashboard marchand</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="search-ts w-full"
                            placeholder="vous@boutique.fr"
                            required
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">Mot de passe</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="search-ts w-full"
                            placeholder="••••••••"
                            required
                        />
                    </div>

                    {error && <p className="text-xs text-red-500">{error}</p>}

                    <button type="submit" className="btn-ts w-full" disabled={isLoading}>
                        {isLoading ? "Connexion..." : "Se connecter"}
                    </button>
                </form>

                <p className="mt-6 text-center text-sm text-gray-400">
                    Pas encore de compte ?{" "}
                    <Link href="/auth/signup" className="font-medium" style={{ color: "var(--ts-accent)" }}>
                        Inscrivez-vous
                    </Link>
                </p>
            </div>
        </div>
    );
}
```

- [ ] **Step 3: Create SIRET verification API route**

Create `src/app/api/verify-siret/route.ts`:
```typescript
import { NextResponse } from "next/server";

export async function POST(request: Request) {
    const body = await request.json();
    const { siret } = body;

    if (!siret || typeof siret !== "string" || siret.length !== 14 || !/^\d{14}$/.test(siret)) {
        return NextResponse.json({ error: "SIRET must be exactly 14 digits" }, { status: 400 });
    }

    try {
        // Call INSEE Sirene API (free, public data)
        const res = await fetch(
            `https://api.insee.fr/entreprises/sirene/V3/siret/${siret}`,
            {
                headers: {
                    Accept: "application/json",
                    // Note: INSEE API requires a bearer token obtained from api.insee.fr
                    // For MVP, we fall through to the fallback below
                },
            },
        );

        if (res.ok) {
            const data = await res.json();
            const etablissement = data?.etablissement;
            const uniteLegale = etablissement?.uniteLegale;
            const adresse = etablissement?.adresseEtablissement;

            return NextResponse.json({
                valid: true,
                company: {
                    name: uniteLegale?.denominationUniteLegale
                        ?? `${uniteLegale?.prenomUsuelUniteLegale ?? ""} ${uniteLegale?.nomUniteLegale ?? ""}`.trim(),
                    address: [
                        adresse?.numeroVoieEtablissement,
                        adresse?.typeVoieEtablissement,
                        adresse?.libelleVoieEtablissement,
                    ].filter(Boolean).join(" "),
                    city: adresse?.libelleCommuneEtablissement ?? "",
                    postalCode: adresse?.codePostalEtablissement ?? "",
                    activity: uniteLegale?.activitePrincipaleUniteLegale ?? "",
                    active: etablissement?.periodesEtablissement?.[0]?.etatAdministratifEtablissement === "A",
                },
            });
        }

        // INSEE API returned error — could be 404 (not found) or 401 (no token)
        if (res.status === 404) {
            return NextResponse.json({ valid: false, error: "SIRET not found" }, { status: 404 });
        }

        // Fallback: accept the SIRET but mark as pending verification
        return NextResponse.json({
            valid: true,
            pending: true,
            company: null,
        });
    } catch {
        // Network error — accept but mark as pending
        return NextResponse.json({
            valid: true,
            pending: true,
            company: null,
        });
    }
}
```

- [ ] **Step 4: Create Signup page**

Create `src/app/auth/signup/page.tsx`:
```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

type Step = "account" | "siret" | "profile";

interface CompanyInfo {
    name: string;
    address: string;
    city: string;
    postalCode: string;
}

export default function SignupPage() {
    const router = useRouter();
    const [step, setStep] = useState<Step>("account");
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    // Step 1
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    // Step 2
    const [siret, setSiret] = useState("");
    const [company, setCompany] = useState<CompanyInfo | null>(null);
    const [siretPending, setSiretPending] = useState(false);

    // Step 3
    const [storeName, setStoreName] = useState("");
    const [storeAddress, setStoreAddress] = useState("");
    const [storeCity, setStoreCity] = useState("");
    const [phone, setPhone] = useState("");

    const handleAccountSubmit = (e: FormEvent) => {
        e.preventDefault();
        setError("");
        if (password.length < 8) { setError("Le mot de passe doit contenir au moins 8 caractères"); return; }
        if (password !== confirmPassword) { setError("Les mots de passe ne correspondent pas"); return; }
        setStep("siret");
    };

    const handleSiretVerify = async () => {
        setError("");
        setIsLoading(true);
        try {
            const res = await fetch("/api/verify-siret", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ siret }),
            });
            const data = await res.json();
            if (!res.ok && res.status === 404) {
                setError("SIRET introuvable. Vérifiez le numéro.");
                return;
            }
            if (data.company) {
                setCompany(data.company);
                setStoreName(data.company.name);
                setStoreAddress(data.company.address);
                setStoreCity(data.company.city);
            }
            setSiretPending(data.pending ?? false);
            setStep("profile");
        } catch {
            setError("Erreur de vérification");
        } finally {
            setIsLoading(false);
        }
    };

    const handleProfileSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError("");
        if (!storeName.trim()) { setError("Le nom de la boutique est requis"); return; }
        setIsLoading(true);
        try {
            // 1. Create Supabase account
            const supabase = createClient();
            const { error: signUpError } = await supabase.auth.signUp({ email, password });
            if (signUpError) throw signUpError;

            // 2. Create merchant profile
            const res = await fetch("/api/merchants", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: storeName,
                    address: storeAddress,
                    city: storeCity,
                    lat: 0,
                    lng: 0,
                    siret,
                    phone: phone || null,
                    status: siretPending ? "pending" : "active",
                }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error);
            }

            router.push("/dashboard");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Erreur lors de l'inscription");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center" style={{ background: "var(--ts-bg-warm)" }}>
            <div className="w-full max-w-sm">
                {/* Logo */}
                <div className="mb-8 text-center">
                    <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-[var(--ts-accent)] text-xl font-extrabold text-[var(--ts-sidebar-bg)]">
                        T
                    </div>
                    <h1 className="text-xl font-semibold text-gray-900">Inscription marchand</h1>
                    {/* Step indicator */}
                    <div className="mt-4 flex justify-center gap-2">
                        {(["account", "siret", "profile"] as Step[]).map((s, i) => (
                            <div
                                key={s}
                                className={`h-1.5 w-12 rounded-full ${
                                    step === s ? "bg-[var(--ts-accent)]"
                                    : (["account", "siret", "profile"].indexOf(step) > i) ? "bg-[var(--ts-accent)]/40"
                                    : "bg-gray-200"
                                }`}
                            />
                        ))}
                    </div>
                </div>

                {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

                {/* Step 1: Account */}
                {step === "account" && (
                    <form onSubmit={handleAccountSubmit} className="space-y-4">
                        <div>
                            <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
                            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="search-ts w-full" required />
                        </div>
                        <div>
                            <label className="mb-1 block text-sm font-medium text-gray-700">Mot de passe</label>
                            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="search-ts w-full" required />
                        </div>
                        <div>
                            <label className="mb-1 block text-sm font-medium text-gray-700">Confirmer</label>
                            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="search-ts w-full" required />
                        </div>
                        <button type="submit" className="btn-ts w-full">Continuer</button>
                    </form>
                )}

                {/* Step 2: SIRET */}
                {step === "siret" && (
                    <div className="space-y-4">
                        <div>
                            <label className="mb-1 block text-sm font-medium text-gray-700">Numéro SIRET</label>
                            <input
                                type="text"
                                value={siret}
                                onChange={(e) => setSiret(e.target.value.replace(/\D/g, "").slice(0, 14))}
                                className="search-ts w-full"
                                placeholder="14 chiffres"
                                maxLength={14}
                            />
                            <p className="mt-1 text-xs text-gray-400">Le SIRET permet de vérifier que vous êtes un commerce enregistré</p>
                        </div>
                        <button
                            onClick={handleSiretVerify}
                            className="btn-ts w-full"
                            disabled={siret.length !== 14 || isLoading}
                        >
                            {isLoading ? "Vérification..." : "Vérifier"}
                        </button>
                        <button onClick={() => setStep("account")} className="w-full text-center text-xs text-gray-400">
                            ← Retour
                        </button>
                    </div>
                )}

                {/* Step 3: Profile */}
                {step === "profile" && (
                    <form onSubmit={handleProfileSubmit} className="space-y-4">
                        {siretPending && (
                            <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                                SIRET en attente de vérification. Vous pourrez utiliser le dashboard en lecture seule.
                            </div>
                        )}
                        <div>
                            <label className="mb-1 block text-sm font-medium text-gray-700">Nom de la boutique</label>
                            <input type="text" value={storeName} onChange={(e) => setStoreName(e.target.value)} className="search-ts w-full" required />
                        </div>
                        <div>
                            <label className="mb-1 block text-sm font-medium text-gray-700">Adresse</label>
                            <input type="text" value={storeAddress} onChange={(e) => setStoreAddress(e.target.value)} className="search-ts w-full" />
                        </div>
                        <div>
                            <label className="mb-1 block text-sm font-medium text-gray-700">Ville</label>
                            <input type="text" value={storeCity} onChange={(e) => setStoreCity(e.target.value)} className="search-ts w-full" />
                        </div>
                        <div>
                            <label className="mb-1 block text-sm font-medium text-gray-700">Téléphone</label>
                            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="search-ts w-full" placeholder="06 12 34 56 78" />
                        </div>
                        <button type="submit" className="btn-ts w-full" disabled={isLoading}>
                            {isLoading ? "Inscription..." : "Créer mon compte"}
                        </button>
                        <button type="button" onClick={() => setStep("siret")} className="w-full text-center text-xs text-gray-400">
                            ← Retour
                        </button>
                    </form>
                )}

                <p className="mt-6 text-center text-sm text-gray-400">
                    Déjà inscrit ?{" "}
                    <Link href="/auth/login" className="font-medium" style={{ color: "var(--ts-accent)" }}>
                        Connectez-vous
                    </Link>
                </p>
            </div>
        </div>
    );
}
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/app/auth/login/page.tsx src/app/auth/signup/page.tsx src/app/api/verify-siret/route.ts src/middleware.ts
git commit -m "feat: add auth pages (login, signup with SIRET) + verify-siret API"
```

---

### Task 13: Final Integration — Build + Smoke Test

**Files:** None (verification only)

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: Build succeeds with all routes listed:
```
├── /auth/login
├── /auth/signup
├── /api/verify-siret
├── /dashboard
├── /dashboard/products
├── /dashboard/products/new
├── /dashboard/products/[id]/edit
├── /dashboard/stock
├── /dashboard/promotions
├── /dashboard/store
├── /dashboard/settings
```

- [ ] **Step 2: Visual smoke test**

Run: `npm run dev`
Navigate to:
1. `http://localhost:3000/auth/login` — login form visible
2. `http://localhost:3000/dashboard` — redirects to products, sidebar visible
3. `http://localhost:3000/dashboard/products` — empty state or product list
4. `http://localhost:3000/dashboard/products/new` — 3 tabs, manual form works
5. `http://localhost:3000/dashboard/stock` — metrics + product list
6. `http://localhost:3000/dashboard/promotions` — empty state + create form
7. `http://localhost:3000/dashboard/store` — profile form with opening hours
8. `http://localhost:3000/dashboard/settings` — password + POS + subscription

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: integration fixes from smoke test"
```
