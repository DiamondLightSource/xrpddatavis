import { useRef } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from "@mui/material";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Destructive confirmation per the DS button-pairing guidance: an error
 * contained action beside a neutral text Cancel, with focus starting on
 * Cancel so Enter can't delete by accident. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  // Hold the last open content so the title and body don't change while the
  // dialog fades out (callers clear or refresh the state it was built from).
  const shown = useRef({ title, children });
  if (open) shown.current = { title, children };

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth aria-labelledby="confirm-dialog-title">
      <DialogTitle id="confirm-dialog-title">{shown.current.title}</DialogTitle>
      <DialogContent>
        <DialogContentText component="div">{shown.current.children}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button autoFocus={destructive} color="inherit" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color={destructive ? "error" : "primary"}
          autoFocus={!destructive}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
