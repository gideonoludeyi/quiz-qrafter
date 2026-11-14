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
import { Spinner } from "@/components/ui/spinner";
import { t } from "@/i18n";

type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  // True while the confirmed action runs.
  busy: boolean;
  onConfirm: () => void;
};

// Asks before a destructive action, such as deleting a document.
const ConfirmDialog = ({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  busy,
  onConfirm,
}: ConfirmDialogProps) => (
  <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
    <DialogContent showCloseButton={false}>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" disabled={busy} />}>
          {t("common.cancel")}
        </DialogClose>
        <Button variant="destructive" disabled={busy} onClick={onConfirm}>
          {busy && <Spinner data-icon="inline-start" />}
          {confirmLabel}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

export default ConfirmDialog;
