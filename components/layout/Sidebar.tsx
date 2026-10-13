"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { UserMenu } from "./UserMenu";

interface SidebarProps {
  user: {
    firstName: string;
    lastName: string;
    email: string;
  };
  isSystemAdmin: boolean;
}

type IconProps = {
  className?: string;
};

function ProductMark({ className = "" }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
    >
      <rect x="4" y="4" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <rect x="13" y="4" width="7" height="10" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <rect x="4" y="13" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M14 18h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function DepartmentsIcon({ className = "" }: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none">
      <path d="M4 20V6.5A2.5 2.5 0 0 1 6.5 4h6A2.5 2.5 0 0 1 15 6.5V20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M15 10h2.5A2.5 2.5 0 0 1 20 12.5V20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8 8h3M8 12h3M8 16h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M3 20h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ProjectsIcon({ className = "" }: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none">
      <path d="M4.5 7.5A2.5 2.5 0 0 1 7 5h3l2 2h5A2.5 2.5 0 0 1 19.5 9.5v6A2.5 2.5 0 0 1 17 18H7a2.5 2.5 0 0 1-2.5-2.5v-8Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M8 12h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function TasksIcon({ className = "" }: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none">
      <path d="M9 6h10M9 12h10M9 18h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="m4 6 1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UsersIcon({ className = "" }: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none">
      <path d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M17 8v6M14 11h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

const navItems = [
  { name: "Департаменты", href: "/departments", disabled: false, icon: DepartmentsIcon },
  { name: "Проекты", href: "#", disabled: true, icon: ProjectsIcon },
  { name: "Задачи", href: "#", disabled: true, icon: TasksIcon },
];

function NavigationLinks({
  isSystemAdmin,
  onNavigate,
}: {
  isSystemAdmin: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const visibleNavItems = isSystemAdmin
    ? [
        ...navItems,
        {
          name: "Создать аккаунт",
          href: "/users/new",
          disabled: false,
          icon: UsersIcon,
        },
      ]
    : navItems;

  return (
    <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-5" aria-label="Основная навигация">
      <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-disabled">
        Рабочее пространство
      </div>
      <div className="space-y-1">
        {visibleNavItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;

          return item.disabled ? (
            <div
              key={item.name}
              aria-disabled="true"
              className="grid min-h-10 cursor-not-allowed grid-cols-[20px_1fr_auto] items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-text-disabled"
            >
              <Icon className="h-5 w-5" />
              <span className="truncate">{item.name}</span>
              <span className="rounded-full border border-border bg-surface-subtle px-2 py-0.5 text-[11px] font-medium text-text-disabled">
                Скоро
              </span>
            </div>
          ) : (
            <Link
              key={item.name}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              onClick={onNavigate}
              className={`grid min-h-10 grid-cols-[20px_1fr] items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary-soft text-primary"
                  : "text-text-secondary hover:bg-surface-subtle hover:text-text-primary"
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="truncate">{item.name}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function ProductHeader({ id, onNavigate }: { id?: string; onNavigate?: () => void }) {
  return (
    <Link
      id={id}
      href="/"
      onClick={onNavigate}
      className="flex min-w-0 items-center gap-3 rounded-lg px-1 py-1 focus-visible:outline-offset-4"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
        <ProductMark className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-base font-semibold text-text-primary">
          Kanban System
        </span>
        <span className="block truncate text-xs text-text-secondary">
          Рабочее пространство
        </span>
      </span>
    </Link>
  );
}

export function Sidebar({ user, isSystemAdmin }: SidebarProps) {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const closeMobileNav = useCallback(() => {
    setIsMobileNavOpen(false);
  }, []);

  useEffect(() => {
    if (!isMobileNavOpen) {
      return;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const openButton = openButtonRef.current;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsMobileNavOpen(false);
        return;
      }

      if (event.key !== "Tab" || !panelRef.current) {
        return;
      }

      const focusableElements = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (!firstElement || !lastElement) {
        event.preventDefault();
        return;
      }

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      openButton?.focus();
    };
  }, [closeMobileNav, isMobileNavOpen]);

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-surface px-4 lg:hidden">
        <button
          ref={openButtonRef}
          type="button"
          aria-label="Открыть навигацию"
          aria-controls="mobile-navigation"
          aria-expanded={isMobileNavOpen}
          onClick={() => setIsMobileNavOpen(true)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border text-xl leading-none text-text-primary transition-colors hover:bg-surface-subtle"
        >
          <span aria-hidden="true">☰</span>
        </button>
        <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          <ProductMark className="h-5 w-5 text-primary" />
          <span>Kanban System</span>
        </div>
        <span className="h-10 w-10" aria-hidden="true" />
      </div>

      {isMobileNavOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={closeMobileNav}
        >
          <div
            id="mobile-navigation"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-navigation-title"
            className="flex h-full w-[248px] max-w-[85vw] flex-col border-r border-border bg-surface shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-4">
              <ProductHeader id="mobile-navigation-title" onNavigate={closeMobileNav} />
              <button
                ref={closeButtonRef}
                type="button"
                aria-label="Закрыть навигацию"
                onClick={closeMobileNav}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-2xl leading-none text-text-primary transition-colors hover:bg-surface-subtle"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
            <NavigationLinks isSystemAdmin={isSystemAdmin} onNavigate={closeMobileNav} />
            <UserMenu user={user} />
          </div>
        </div>
      )}

      <aside className="hidden h-[100dvh] w-[248px] shrink-0 flex-col border-r border-border bg-surface lg:flex">
        <div className="border-b border-border px-5 py-5">
          <ProductHeader />
        </div>
        <NavigationLinks isSystemAdmin={isSystemAdmin} />
        <UserMenu user={user} />
      </aside>
    </>
  );
}
