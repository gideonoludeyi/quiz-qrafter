import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import AuthLayout from "./AuthLayout";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [isValid, setValidation] = useState(false);
  const [error, setError] = useState<Record<string, string>>({});
  const navigate = useNavigate();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      // Assuming there's a function in useAuth or another service to request password reset
      // await useAuth().requestPasswordReset(email);
      setMessage("If an account exists for this email, a password reset link has been sent.");
      setTimeout(() => navigate("/login"), 5000); // Redirect to login after 5 seconds
    } catch (error) {
      setMessage("There was an error processing your request. Please try again later.");
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
      newError.email = "*Email is required*";
    } else if (!checkEmail(email)) {
      newError.email = "*Email address should contain '@'*";
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
      title="Forgot Password"
      footer={
        <Button variant="link" nativeButton={false} render={<Link to="/login" />}>
          Back to login
        </Button>
      }
    >
      <form onSubmit={handleSubmit}>
        <FieldGroup>
          <Field data-invalid={!!error.email}>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              type="email"
              placeholder="Enter your email"
              aria-invalid={!!error.email}
              value={email}
              onChange={(event) => handleEmail(event.target.value)}
            />
            <FieldError>{error.email}</FieldError>
          </Field>
          <Button type="submit" className="w-full" disabled={!isValid}>
            Send Reset Link
          </Button>
          {message && <p className="text-sm text-muted-foreground">{message}</p>}
        </FieldGroup>
      </form>
    </AuthLayout>
  );
};

export default ForgotPassword;
