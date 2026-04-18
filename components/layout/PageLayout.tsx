import Link from "next/link";
import { cn } from "@/lib/utils";

export interface PageLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  backHref?: string;
  className?: string;
  contentClassName?: string;
}

export function PageLayout({
  children,
  title,
  subtitle,
  action,
  backHref,
  className,
  contentClassName,
}: PageLayoutProps) {
  const hasHeader = Boolean(title || backHref || action || subtitle);

  return (
    <div className={cn("min-h-screen bg-bg-primary pb-24", className)}>
      {hasHeader && (
        <header className="sticky top-0 z-40 glass border-b border-border-subtle">
          <div className="flex items-center justify-between gap-3 px-4 py-4 pt-safe">
            <div className="flex min-w-0 items-center gap-3">
              {backHref && (
                <Link
                  href={backHref}
                  aria-label="Retour"
                  className="-ml-2 flex h-10 w-10 items-center justify-center rounded-xl text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                </Link>
              )}
              <div className="min-w-0">
                {title && (
                  <h1 className="truncate text-xl font-bold tracking-tight text-text-primary">
                    {title}
                  </h1>
                )}
                {subtitle && (
                  <p className="truncate text-sm text-text-tertiary">
                    {subtitle}
                  </p>
                )}
              </div>
            </div>
            {action && <div className="shrink-0">{action}</div>}
          </div>
        </header>
      )}

      <main
        className={cn("animate-in px-4 py-6", contentClassName)}
      >
        {children}
      </main>
    </div>
  );
}
