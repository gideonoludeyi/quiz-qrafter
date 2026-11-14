import React from "react";
import { RiFolder3Line, RiLogoutBoxRLine, RiMoonLine, RiSunLine } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { useAuth } from "../../services/auth";
import LogoDark from "../../assets/quiz_qrafter_logo_dark.svg";
import LogoLight from "../../assets/quiz_qrafter_logo_light.svg";
import { useTheme } from "../../containers/Admin/ThemeContext";
import Documents from "../../containers/Documents/Documents";

// The signed-in app: a sidebar, and the documents workspace in an inset panel.
const Dashboard: React.FC = () => {
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const switchTheme =
    theme === "dark" ? t("common.theme.switchToLight") : t("common.theme.switchToDark");
  const logo = (
    <span className="flex items-center gap-2 text-sm font-semibold">
      <img src={theme === "dark" ? LogoLight : LogoDark} alt="" className="h-6 w-auto" />
      {t("common.appName")}
    </span>
  );
  const accountActions = (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={toggleTheme}
        aria-label={switchTheme}
        title={switchTheme}
      >
        {theme === "dark" ? <RiSunLine /> : <RiMoonLine />}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => signOut()}>
        <RiLogoutBoxRLine data-icon="inline-start" />
        {t("auth.logOut")}
      </Button>
    </>
  );

  return (
    // In dark mode the frame is darker than the panel, as in Linear; in light mode, lighter.
    <div className="flex h-svh flex-col bg-sidebar text-sidebar-foreground md:flex-row dark:bg-background">
      <aside className="hidden w-60 shrink-0 flex-col gap-6 p-3 md:flex">
        <div className="flex h-9 items-center px-2">{logo}</div>
        <nav aria-label={t("common.mainNav")} className="flex flex-col gap-0.5">
          <span
            aria-current="page"
            className="flex h-8 items-center gap-2 rounded-lg bg-sidebar-accent px-2 text-sm font-medium text-sidebar-accent-foreground"
          >
            <RiFolder3Line className="size-4" aria-hidden />
            {t("documents.title")}
          </span>
        </nav>
        <div className="mt-auto flex flex-col gap-2 border-t pt-3">
          <span className="truncate px-2 text-xs text-muted-foreground" title={user?.email}>
            {user?.email}
          </span>
          <div className="flex items-center justify-between">{accountActions}</div>
        </div>
      </aside>

      {/* Small screens: the sidebar's contents become a top bar. */}
      <header className="flex h-12 shrink-0 items-center gap-2 px-3 md:hidden">
        {logo}
        <div className="ml-auto flex items-center gap-1">{accountActions}</div>
      </header>

      <main className="min-h-0 flex-1 p-2 pt-0 md:pt-2 md:pl-0">
        <div className="h-full overflow-hidden rounded-xl border bg-background text-foreground shadow-sm dark:bg-card">
          <Documents />
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
