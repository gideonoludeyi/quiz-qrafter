import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { t } from "@/i18n";
import { useAuth } from "../../services/auth";
import AuthLayout from "./AuthLayout";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [isValid, setValidation] = useState(false);
  const [error, setError] = useState<Record<string, string>>({});
  const navigate = useNavigate();
  const { requestPasswordReset } = useAuth();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      // The link in the email brings the user back to the update-password page.
      await requestPasswordReset(email, `${window.location.origin}/update-password`);
      // The same message whether or not the email has an account, so it doesn't reveal which do.
      setMessage(t("auth.forgotPasswordPage.sent"));
      setTimeout(() => navigate("/login"), 5000); // Redirect to login after 5 seconds
    } catch (error) {
      setMessage(t("auth.forgotPasswordPage.failed"));
    }
  };

  const checkEmail = (email: string): boolean => {
    // You can use a regex or any other validation method here
    const regex = /\S+@\S+\.\S+/;
    return regex.test(email);
  };

  const checkValid = () => {
    const newError: Record<string, string> = {};

    if (!email.trim()) {
      newError.email = t("auth.validation.emailRequired");
    } else if (!checkEmail(email)) {
      newError.email = t("auth.validation.emailInvalid");
    }

    setError(newError);
    const isValid = Object.keys(newError).length === 0;
    setValidation(isValid);
    // return isValid;
  };

  const handleEmail = (email: string) => {
    setEmail(email);
    checkValid();
  };

  return (
    <AuthLayout
      title={t("auth.forgotPasswordPage.title")}
      footer={
        <Button variant="link" nativeButton={false} render={<Link to="/login" />}>
          {t("auth.forgotPasswordPage.backToLogin")}
        </Button>
      }
    >
      <form onSubmit={handleSubmit}>
        <FieldGroup>
          <Field data-invalid={!!error.email}>
            <FieldLabel htmlFor="email">{t("auth.email")}</FieldLabel>
            <Input
              id="email"
              type="email"
              placeholder={t("auth.forgotPasswordPage.emailPlaceholder")}
              aria-invalid={!!error.email}
              value={email}
              onChange={(event) => handleEmail(event.target.value)}
            />
            <FieldError>{error.email}</FieldError>
          </Field>
          <Button type="submit" className="w-full" disabled={!isValid}>
            {t("auth.forgotPasswordPage.submit")}
          </Button>
          {message && <p className="text-sm text-muted-foreground">{message}</p>}
        </FieldGroup>
      </form>
    </AuthLayout>
  );
};

export default ForgotPassword;
