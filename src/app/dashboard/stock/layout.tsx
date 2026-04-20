import { StockNavTabs } from "@/components/dashboard/stock-nav-tabs";

export default function StockLayout({ children }: { children: React.ReactNode }) {
    return (
        <>
            <StockNavTabs />
            {children}
        </>
    );
}
