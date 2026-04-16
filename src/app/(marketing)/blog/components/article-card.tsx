import Link from "next/link";

interface ArticleCardProps {
    title: string;
    description: string;
    slug: string;
    publishedAt: string;
    readingTime: string;
    category: "marchands" | "consommateurs";
}

export function ArticleCard({
    title,
    description,
    slug,
    publishedAt,
    readingTime,
    category,
}: ArticleCardProps) {
    const badgeLabel =
        category === "marchands" ? "Marchands" : "Guide local";
    const badgeClasses =
        category === "marchands"
            ? "bg-[#1A1A1A] text-white"
            : "bg-[#4268FF] text-white";

    const formattedDate = new Date(publishedAt).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
    });

    return (
        <Link
            href={`/blog/${slug}`}
            className="group block rounded-2xl border border-secondary bg-primary overflow-hidden hover:shadow-lg transition-shadow duration-200 no-underline"
        >
            <div className="relative h-[180px] bg-[#1A1F36] flex items-center justify-center overflow-hidden">
                {/* Decorative accent */}
                <div className="absolute inset-0 bg-gradient-to-br from-[#4268FF]/20 via-transparent to-[#1A1F36]" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200px] h-[200px] rounded-full bg-[#4268FF]/10 blur-3xl" />
                <svg className="relative size-10 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                <span
                    className={`absolute top-3 right-3 px-2.5 py-1 rounded-full text-[11px] font-semibold ${badgeClasses}`}
                >
                    {badgeLabel}
                </span>
            </div>

            <div className="p-5">
                <h2 className="text-primary font-bold text-[17px] leading-snug mb-2 group-hover:text-brand-secondary transition-colors duration-150">
                    {title}
                </h2>
                <p className="text-tertiary text-[13px] leading-relaxed line-clamp-2 mb-4">
                    {description}
                </p>
                <div className="flex items-center gap-3 text-quaternary text-[11px]">
                    <span>{formattedDate}</span>
                    <span aria-hidden="true">·</span>
                    <span>{readingTime} de lecture</span>
                </div>
            </div>
        </Link>
    );
}
