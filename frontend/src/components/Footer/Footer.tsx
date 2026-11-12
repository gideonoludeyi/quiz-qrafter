// Footer.tsx
import { Separator } from "@/components/ui/separator";

const Footer = () => {
  return (
    <footer className="border-t bg-muted/40">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-3">
        <div className="flex flex-col gap-2">
          <h3 className="font-medium">About Quiz Qrafter</h3>
          <p className="text-sm text-muted-foreground">
            Your go-to platform for interactive quizzes and learning.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="font-medium">Quick Links</h3>
          <a href="/terms" className="text-sm text-muted-foreground hover:text-foreground">
            Terms of Service
          </a>
          <a href="/privacy" className="text-sm text-muted-foreground hover:text-foreground">
            Privacy Policy
          </a>
          {/* Add more links as needed */}
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="font-medium">Follow us</h3>
          {/* Insert social media links */}
        </div>
      </div>
      <Separator />
      <p className="mx-auto max-w-6xl px-4 py-6 text-xs text-muted-foreground">
        © {new Date().getFullYear()} Quiz Qrafter
      </p>
    </footer>
  );
};

export default Footer;
