import { useState } from "react";
import { Link } from "react-router-dom";
import { RiMenuLine } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const Header = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  return (
    <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link to="/" className="font-heading text-xl font-semibold tracking-tight">
          Quiz Qrafter
        </Link>

        {/* Desktop Menu */}
        <nav className="hidden items-center gap-2 sm:flex">
          <Button variant="ghost" nativeButton={false} render={<Link to="/login" />}>
            Log in
          </Button>
          <Button nativeButton={false} render={<Link to="/signup" />}>
            Sign up
          </Button>
        </nav>

        {/* Mobile Menu */}
        <Button
          variant="ghost"
          size="icon"
          className="sm:hidden"
          aria-label="Open menu"
          onClick={() => setIsMobileMenuOpen(true)}
        >
          <RiMenuLine />
        </Button>
        <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
          <SheetContent side="right">
            <SheetHeader>
              <SheetTitle>Quiz Qrafter</SheetTitle>
            </SheetHeader>
            <nav className="flex flex-col gap-2 px-4">
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link to="/login" onClick={closeMobileMenu} />}
              >
                Log in
              </Button>
              <Button nativeButton={false} render={<Link to="/signup" onClick={closeMobileMenu} />}>
                Sign up
              </Button>
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
};

export default Header;
