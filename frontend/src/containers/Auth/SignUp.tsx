import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
      newError.firstname = "*First name is required*";
    }

    if (!lastname) {
      newError.lastname = "*Last name is required*";
    }

    if (!email.trim()) {
      newError.email = "*Email is required*";
    } else if (!checkEmail(email)) {
      newError.email = "*Email address should contain '@'*";
    }

    if (!checkPwd(password)) {
      newError.password = "*Password should have at least 8 characters and one upper case letter*";
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
        toast.error(error instanceof Error ? error.message : "Could not sign up.");
      }
    }
  };

  return (
    <AuthLayout
      title="Get started with Quiz Qrafter"
      footer={
        <>
          Already have an account?
          <Button
            variant="link"
            className="px-1"
            nativeButton={false}
            render={<Link to="/login" />}
          >
            Log in
          </Button>
        </>
      }
      finePrint={
        <>
          By signing up, you agree to Quiz Qrafter's{" "}
          <Link to="/terms" className="underline underline-offset-4 hover:text-foreground">
            Terms of Use
          </Link>{" "}
          and{" "}
          <Link to="/privacy" className="underline underline-offset-4 hover:text-foreground">
            Privacy Policy
          </Link>
          .
        </>
      }
    >
      <form onSubmit={handleSignUp}>
        <FieldGroup>
          <Field data-invalid={!!error.firstname}>
            <FieldLabel htmlFor="firstname">First name</FieldLabel>
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
            <FieldLabel htmlFor="lastname">Last name</FieldLabel>
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
            <FieldLabel htmlFor="email">Email</FieldLabel>
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
            <FieldLabel htmlFor="password">Password</FieldLabel>
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
            Sign up
          </Button>
        </FieldGroup>
      </form>
    </AuthLayout>
  );
};

export default SignUp;
