import React, { useState } from "react";
import { RiMenuLine } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "../../services/auth";
import Sidebar from "../../components/Sidebar/Sidebar";
import LogoDark from "../../assets/quiz_qrafter_logo_dark.svg";
import LogoLight from "../../assets/quiz_qrafter_logo_light.svg";
import { useTheme } from "../../containers/Admin/ThemeContext";
import Quiz from "../../containers/Admin/Quiz";
import Settings from "../../containers/Admin/Settings";

const Dashboard: React.FC = () => {
  const { user, signOut } = useAuth();
  const { theme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState<"quiz" | "settings">("quiz");
  const [showSettings, setShowSettings] = useState(false);
  const toggleSettings = () => {
    setShowSettings(!showSettings);
  };

  const handleSignOut = () => {
    signOut();
  };

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b bg-background px-4">
        <Button variant="ghost" size="icon" onClick={toggleSidebar} aria-label="Open menu">
          <RiMenuLine />
        </Button>
        <img
          src={theme === "dark" ? LogoLight : LogoDark}
          alt="Quiz Qrafter"
          className="h-7 w-auto"
        />
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-sm text-muted-foreground sm:inline">{user?.email}</span>
          <Button variant="outline" size="sm" onClick={handleSignOut}>
            Log out
          </Button>
        </div>
      </header>
      <Sidebar
        isOpen={sidebarOpen}
        closeSidebar={toggleSidebar}
        activeMenu={activeMenu}
        setActiveMenu={setActiveMenu}
        toggleSettings={toggleSettings}
      />
      <main className="mx-auto w-full max-w-5xl flex-1 p-4 sm:p-6">
        {activeMenu === "quiz" ? <Quiz /> : null}
      </main>
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
          </DialogHeader>
          <Settings />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Dashboard;
