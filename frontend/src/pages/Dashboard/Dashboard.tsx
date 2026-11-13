import React from "react";
import { RiMoonLine, RiSunLine } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { useAuth } from "../../services/auth";
import LogoDark from "../../assets/quiz_qrafter_logo_dark.svg";
import LogoLight from "../../assets/quiz_qrafter_logo_light.svg";
import { useTheme } from "../../containers/Admin/ThemeContext";
import Quiz from "../../containers/Admin/Quiz";

const Dashboard: React.FC = () => {
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const nextTheme = theme === "dark" ? "light" : "dark";

  const handleSignOut = () => {
    signOut();
  };

  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b bg-background px-4">
        <img
          src={theme === "dark" ? LogoLight : LogoDark}
          alt="Quiz Qrafter"
          className="h-7 w-auto"
        />
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-sm text-muted-foreground sm:inline">{user?.email}</span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggleTheme}
            aria-label={`Switch to ${nextTheme} theme`}
            title={`Switch to ${nextTheme} theme`}
          >
            {theme === "dark" ? <RiSunLine /> : <RiMoonLine />}
          </Button>
          <Button variant="outline" size="sm" onClick={handleSignOut}>
            Log out
          </Button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 p-4 sm:p-6">
        <Quiz />
      </main>
    </div>
  );
};

export default Dashboard;
