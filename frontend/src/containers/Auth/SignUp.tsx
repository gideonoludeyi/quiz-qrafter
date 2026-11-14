import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import RichText from "@/components/RichText";
import { Input } from "@/components/ui/input";
import { t } from "@/i18n";
import { useAuth } from "../../services/auth";
import AuthLayout from "./AuthLayout";

const SignUp = () => {
  const { signUp } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullname, setFullname] = useState("");
  const [firstname, setFirstname] = useState("");
  const [lastname, setLastname] = useState("");
  const [error, setError] = useState<Record<string, string>>({});
  const navigate = useNavigate();
  const [isValid, setValidation] = useState(false);

  useEffect(() => {
    setFullname(`${firstname} ${lastname}`);
  }, [firstname, lastname]);

  const checkPwd = (password: string): boolean => {
    const regex = /^(?=.*[A-Z]).{8,}$/;
    return regex.test(password);
  };

  const checkEmail = (email: string): boolean => {
    const regex = /\S+@\S+\.\S+/;
    return regex.test(email);
  };

  const checkValid = () => {
    const newError: Record<string, string> = {};

    if (!firstname) {
      newError.firstname = t("auth.validation.firstNameRequired");
    }

    if (!lastname) {
      newError.lastname = t("auth.validation.lastNameRequired");
    }

    if (!email.trim()) {
      newError.email = t("auth.validation.emailRequired");
    } else if (!checkEmail(email)) {
      newError.email = t("auth.validation.emailInvalid");
    }

    if (!checkPwd(password)) {
      newError.password = t("auth.validation.passwordWeak");
    }

    setError(newError);
    const isValid = Object.keys(newError).length === 0;
    setValidation(isValid);
    // return isValid;
  };

  const handleFirstName = (firstName: string) => {
    setFirstname(firstName);
    checkValid();
  };

  const handleLastName = (lastName: string) => {
    setLastname(lastName);
    checkValid();
  };

  const handleEmail = (email: string) => {
    setEmail(email);
    checkValid();
  };

  const handlePassword = (password: string) => {
    setPassword(password);
    checkValid();
  };

  const handleSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    checkValid();

    if (isValid) {
      try {
        await signUp(email, password, fullname);
        setValidation(true);
        navigate("/dashboard", { replace: true });
        setError({});
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t("auth.errors.signUpFailed"));
      }
    }
  };

  return (
    <AuthLayout
      title={t("auth.signUpPage.title")}
      footer={
        <>
          {t("auth.signUpPage.haveAccount")}
          <Button
            variant="link"
            className="px-1"
            nativeButton={false}
            render={<Link to="/login" />}
          >
            {t("auth.logIn")}
          </Button>
        </>
      }
      finePrint={
        <RichText
          id="auth.finePrint"
          parts={{
            terms: (
              <Link to="/terms" className="underline underline-offset-4 hover:text-foreground">
                {t("auth.termsOfUse")}
              </Link>
            ),
            privacy: (
              <Link to="/privacy" className="underline underline-offset-4 hover:text-foreground">
                {t("auth.privacyPolicy")}
              </Link>
            ),
          }}
        />
      }
    >
      <form onSubmit={handleSignUp}>
        <FieldGroup>
          <Field data-invalid={!!error.firstname}>
            <FieldLabel htmlFor="firstname">{t("auth.signUpPage.firstName")}</FieldLabel>
            <Input
              id="firstname"
              type="text"
              aria-invalid={!!error.firstname}
              onChange={(event) => handleFirstName(event.target.value)}
              value={firstname}
            />
            <FieldError>{error.firstname}</FieldError>
          </Field>
          <Field data-invalid={!!error.lastname}>
            <FieldLabel htmlFor="lastname">{t("auth.signUpPage.lastName")}</FieldLabel>
            <Input
              id="lastname"
              type="text"
              aria-invalid={!!error.lastname}
              onChange={(event) => handleLastName(event.target.value)}
              value={lastname}
            />
            <FieldError>{error.lastname}</FieldError>
          </Field>
          <Field data-invalid={!!error.email}>
            <FieldLabel htmlFor="email">{t("auth.email")}</FieldLabel>
            <Input
              id="email"
              type="email"
              aria-invalid={!!error.email}
              onChange={(event) => handleEmail(event.target.value)}
              value={email}
            />
            <FieldError>{error.email}</FieldError>
          </Field>
          <Field data-invalid={!!error.password}>
            <FieldLabel htmlFor="password">{t("auth.password")}</FieldLabel>
            <Input
              id="password"
              type="password"
              aria-invalid={!!error.password}
              onChange={(event) => handlePassword(event.target.value)}
              value={password}
            />
            <FieldError>{error.password}</FieldError>
          </Field>
          <Button type="submit" className="w-full" disabled={!isValid}>
            {t("auth.signUp")}
          </Button>
        </FieldGroup>
      </form>
    </AuthLayout>
  );
};

export default SignUp;
