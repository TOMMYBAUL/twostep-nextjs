"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { BarChart01, Building02, Users01 } from "@untitledui/icons";
import { cx } from "@/utils/cx";

const navItems = [
    { href: "/admin", label: "Overview", icon: BarChart01, exact: true },
    { href: "/admin/merchants", label: "Marchands", icon: Building02, exact: false },
    { href: "/admin/consumers", label: "Consumers", icon: Users01, exact: false },
];

function NavLink({
    href,
    label,
    icon: Icon,
    isActive,
}: {
    href: string;
    label: string;
    icon: React.FC<React.SVGProps<SVGSVGElement>>;
    isActive: boolean;
}) {
    return (
        <Link
            href={href}
            className={cx(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                isActive
                    ? "bg-white/15 font-semibold text-white"
                    : "text-white/60 hover:bg-white/10 hover:text-white/90",
            )}
        >
            <Icon className="size-5 shrink-0" />
            <span>{label}</span>
        </Link>
    );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const [authorized, setAuthorized] = useState(false);
    const [checking, setChecking] = useState(true);

    useEffect(() => {
        const supabase = createBrowserClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        );

        supabase.auth.getUser().then(({ data: { user } }) => {
            if (!user) {
                router.replace("/auth/login");
                return;
            }
            if (user.app_metadata?.role !== "admin") {
                router.replace("/dashboard");
                return;
            }
            setAuthorized(true);
            setChecking(false);
        });
    }, [router]);

    if (checking) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-50">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
            </div>
        );
    }

    if (!authorized) return null;

    return (
        <div className="flex h-screen bg-gray-50">
            {/* Sidebar */}
            <aside
                className="flex h-screen w-60 shrink-0 flex-col"
                style={{ background: "#1a1a2e" }}
            >
                {/* Title */}
                <div className="flex h-16 items-center px-5">
                    <span className="text-base font-bold tracking-tight text-white">
                        Two-Step Admin
                    </span>
                </div>

                {/* Navigation */}
                <nav className="flex flex-1 flex-col gap-1 px-3 pt-2">
                    {navItems.map((item) => {
                        const isActive = item.exact
                            ? pathname === item.href
                            : pathname.startsWith(item.href);
                        return (
                            <NavLink
                                key={item.href}
                                href={item.href}
                                label={item.label}
                                icon={item.icon}
                                isActive={isActive}
                            />
                        );
                    })}
                </nav>

                {/* Footer */}
                <div className="px-5 pb-5">
                    <p className="text-xs text-white/30">Internal tool</p>
                </div>
            </aside>

            {/* Main content */}
            <main className="flex-1 overflow-y-auto px-10 py-8">{children}</main>
        </div>
    );
}
