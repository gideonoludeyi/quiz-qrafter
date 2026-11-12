import React from "react";
import { RiFileTextLine, RiSettings3Line } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const Sidebar: React.FC<{
  isOpen: boolean;
  closeSidebar: () => void;
  activeMenu: "quiz" | "settings";
  setActiveMenu: (menu: "quiz" | "settings") => void;
  toggleSettings?: () => void;
}> = ({ isOpen, closeSidebar, activeMenu, setActiveMenu, toggleSettings }) => {
  const handleSettingsClick = () => {
    closeSidebar();
    toggleSettings?.();
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && closeSidebar()}>
      <SheetContent side="left" className="data-[side=left]:w-64">
        <SheetHeader>
          <SheetTitle>Menu</SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col gap-1 px-4">
          <Button
            variant={activeMenu === "quiz" ? "secondary" : "ghost"}
            className="justify-start"
            onClick={() => setActiveMenu("quiz")}
          >
            <RiFileTextLine data-icon="inline-start" />
            Quiz
          </Button>
          <Button variant="ghost" className="justify-start" onClick={handleSettingsClick}>
            <RiSettings3Line data-icon="inline-start" />
            Settings
          </Button>
        </nav>
      </SheetContent>
    </Sheet>
  );
};

export default Sidebar;
