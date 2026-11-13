import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useAuth } from "../../services/auth";
import AuthLayout from "./AuthLayout";

const Login = () => {
  const { authenticated, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<Record<string, string>>({});
  const [isValid, setValidation] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (authenticated) {
      navigate("/dashboard", { replace: true });
    }
  }, [authenticated, navigate]);

  const checkEmail = (email: string): boolean => {
    // You can use a regex or any other validation method here
    const regex = /\S+@\S+\.\S+/;
    return regex.test(email);
  };

  const checkPwd = (password: string): boolean => {
    const regex = /^(?=.*[A-Z]).{8,}$/;
    return regex.test(password);
  };

  const checkValid = () => {
    const newError: Record<string, string> = {};

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
  };
  const handleEmail = (email: string) => {
    setEmail(email);
    checkValid();
  };

  const handlePassword = (password: string) => {
    setPassword(password);
    checkValid();
  };

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    checkValid();

    if (isValid) {
      try {
        await login(email, password);
        setValidation(true);
        setError({});
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not log in.");
      }
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      footer={
        <>
          Don't have an account?
          <Button
            variant="link"
            className="px-1"
            nativeButton={false}
            render={<Link to="/signup" />}
          >
            Sign up
          </Button>
        </>
      }
      finePrint="By signing up, you agree to Quiz Qrafter's Terms of Use and Privacy Policy."
    >
      <form onSubmit={handleLogin}>
        <FieldGroup>
          <Field data-invalid={!!error.email}>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              aria-invalid={!!error.email}
              onChange={(event) => handleEmail(event.target.value)}
            />
            <FieldError>{error.email}</FieldError>
          </Field>
          <Field data-invalid={!!error.password}>
            <div className="flex items-center">
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Button
                variant="link"
                size="xs"
                className="ml-auto"
                nativeButton={false}
                render={<Link to="/forgot-password" />}
              >
                Forgot password?
              </Button>
            </div>
            <Input
              id="password"
              type="password"
              aria-invalid={!!error.password}
              onChange={(event) => handlePassword(event.target.value)}
            />
            <FieldError>{error.password}</FieldError>
          </Field>
          <Button type="submit" className="w-full" disabled={!isValid}>
            Log in
          </Button>
        </FieldGroup>
      </form>
    </AuthLayout>
  );
};

export default Login;
