import Link from "next/link";
import { UserMenu } from "./UserMenu";

interface SidebarProps {
  user: {
    firstName: string;
    lastName: string;
    email: string;
  };
}

export function Sidebar({ user }: SidebarProps) {
  const navItems = [
    { name: "Департаменты", href: "#", disabled: true },
    { name: "Проекты", href: "#", disabled: true },
    { name: "Задачи", href: "#", disabled: true },
  ];

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-black">
      <div className="flex h-16 items-center px-6 border-b border-zinc-200 dark:border-zinc-800">
        <Link href="/" className="text-xl font-bold tracking-tight">
          Kanban System
        </Link>
      </div>
      <nav className="flex-1 space-y-1 px-4 py-4">
        {navItems.map((item) => (
          <div
            key={item.name}
            className={`flex items-center rounded-md px-3 py-2 text-sm font-medium ${
              item.disabled
                ? "cursor-not-allowed text-zinc-400 dark:text-zinc-600"
                : "text-zinc-900 hover:bg-zinc-100 dark:text-zinc-50 dark:hover:bg-zinc-900"
            }`}
          >
            {item.name}
          </div>
        ))}
      </nav>
      <UserMenu user={user} />
    </aside>
  );
}
