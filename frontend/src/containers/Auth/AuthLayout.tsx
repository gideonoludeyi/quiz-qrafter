import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useTheme } from "@/containers/Admin/ThemeContext";
import LogoDark from "@/assets/quiz_qrafter_logo_dark.svg";
import LogoLight from "@/assets/quiz_qrafter_logo_light.svg";

// Shared shell for auth pages: logo header, centered card, optional footer and fine print.
const AuthLayout = ({
  title,
  children,
  footer,
  finePrint,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  finePrint?: ReactNode;
}) => {
  const { theme } = useTheme();

  return (
    <div className="flex min-h-svh flex-col bg-muted/40">
      <header className="flex h-16 items-center px-6">
        <Link to="/">
          <img
            src={theme === "dark" ? LogoLight : LogoDark}
            alt="Quiz Qrafter"
            className="h-8 w-auto"
          />
        </Link>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-10">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-xl">{title}</CardTitle>
          </CardHeader>
          <CardContent>{children}</CardContent>
          {footer && (
            <CardFooter className="justify-center text-sm text-muted-foreground">
              {footer}
            </CardFooter>
          )}
        </Card>
        {finePrint && (
          <p className="max-w-sm text-center text-xs text-muted-foreground">{finePrint}</p>
        )}
      </main>
    </div>
  );
};

export default AuthLayout;
