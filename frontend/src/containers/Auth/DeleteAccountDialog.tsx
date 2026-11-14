import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { t } from "@/i18n";
import { useAuth } from "../../services/auth";

type DeleteAccountDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

// Deletes the signed-in user's account after they confirm with their password.
const DeleteAccountDialog = ({ open, onOpenChange }: DeleteAccountDialogProps) => {
  const { deleteAccount } = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const changeOpen = (next: boolean) => {
    if (deleting) return;
    setPassword("");
    setError(null);
    onOpenChange(next);
  };

  // Signing out follows from a successful delete, which leaves this page.
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setDeleting(true);
    try {
      await deleteAccount(password);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.errors.deleteAccountFailed"));
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent showCloseButton={false}>
        <form onSubmit={(event) => void handleSubmit(event)} className="grid gap-6">
          <DialogHeader>
            <DialogTitle>{t("auth.deleteAccountDialog.title")}</DialogTitle>
            <DialogDescription>{t("auth.deleteAccountDialog.description")}</DialogDescription>
          </DialogHeader>
          <Field data-invalid={error !== null}>
            <FieldLabel htmlFor="delete-account-password">
              {t("auth.deleteAccountDialog.passwordLabel")}
            </FieldLabel>
            <Input
              id="delete-account-password"
              type="password"
              autoComplete="current-password"
              value={password}
              aria-invalid={error !== null}
              onChange={(event) => setPassword(event.target.value)}
            />
            <FieldError>{error}</FieldError>
          </Field>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" disabled={deleting} />}>
              {t("common.cancel")}
            </DialogClose>
            <Button type="submit" variant="destructive" disabled={deleting || password === ""}>
              {deleting && <Spinner data-icon="inline-start" />}
              {t("auth.deleteAccountDialog.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default DeleteAccountDialog;
