import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useAuth } from "../../services/auth";
import AuthLayout from "./AuthLayout";

const UpdatePassword = () => {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [messageBad, setMessageBad] = useState("");
  const [token, setToken] = useState("");
  const [errorNew, setErrorNew] = useState("");
  const [errorConfirm, setErrorConfirm] = useState("");
  const [isValid, setValidation] = useState(false);
  const navigate = useNavigate();
  const { resetPassword } = useAuth();
  // Set when the emailed link is invalid or has expired (the API redirects with ?error=INVALID_TOKEN).
  const [linkInvalid, setLinkInvalid] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const query = new URLSearchParams(location.search);
    const token = query.get("token");
    if (query.get("error") === "INVALID_TOKEN") {
      setLinkInvalid(true);
    } else if (token) {
      setToken(token);
    } else {
      navigate("/login"); // Redirect if no token is found
    }
  }, [location, navigate]);

  const checkNewPassword = (password: string): boolean => {
    const regex = /^(?=.*[A-Z]).{8,}$/;
    return regex.test(password);
  };

  useEffect(() => {
    let isValidNewPassword = checkNewPassword(newPassword);
    let isValidConfirmPassword = checkNewPassword(confirmPassword);
    let passwordsMatch = newPassword === confirmPassword;

    setErrorNew(
      isValidNewPassword
        ? ""
        : "*Password should have at least 8 characters and one upper case letter*",
    );
    setErrorConfirm(
      isValidConfirmPassword
        ? passwordsMatch
          ? ""
          : "*Passwords do not match*"
        : "*Password should have at least 8 characters and one upper case letter*",
    );
    setMessageBad(passwordsMatch ? "" : "*Passwords do not match*");

    setValidation(isValidNewPassword && isValidConfirmPassword && passwordsMatch);
  }, [newPassword, confirmPassword]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isValid) return;

    try {
      await resetPassword(token, newPassword);
      setMessage("Your password has been successfully updated.");
      setTimeout(() => navigate("/login"), 3000); // Redirect to login after 3 seconds
    } catch (error) {
      setMessageBad("There was an error updating your password. Please try again.");
    }
  };

  if (linkInvalid) {
    return (
      <AuthLayout title="Update Your Password">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-destructive">
            This password reset link is invalid or has expired.
          </p>
          <Button nativeButton={false} render={<Link to="/forgot-password" />}>
            Request a new link
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Update Your Password">
      <form onSubmit={handleSubmit}>
        <FieldGroup>
          <Field data-invalid={!!errorNew}>
            <FieldLabel htmlFor="new-password">New password</FieldLabel>
            <Input
              id="new-password"
              type="password"
              aria-invalid={!!errorNew}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
            <FieldError>{errorNew}</FieldError>
          </Field>
          <Field data-invalid={!!errorConfirm}>
            <FieldLabel htmlFor="confirm-password">Confirm new password</FieldLabel>
            <Input
              id="confirm-password"
              type="password"
              aria-invalid={!!errorConfirm}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
            <FieldError>{errorConfirm}</FieldError>
          </Field>
          <Button type="submit" className="w-full" disabled={!isValid}>
            Update Password
          </Button>
          {message && <p className="text-sm text-muted-foreground">{message}</p>}
          {messageBad && <p className="text-sm text-destructive">{messageBad}</p>}
        </FieldGroup>
      </form>
    </AuthLayout>
  );
};

export default UpdatePassword;
