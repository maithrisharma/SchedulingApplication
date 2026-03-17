// frontend/src/components/MoveConfirmationDialog.jsx
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  IconButton,
  Divider,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ScheduleIcon from "@mui/icons-material/Schedule";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";

export default function MoveConfirmationDialog({
  open,
  onClose,
  onConfirm,
  jobId,
  auftrag,
  originalStart,
  newStart,
}) {
  if (!open) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          overflow: "hidden",
          maxWidth: 480,
        },
      }}
    >
      <DialogTitle
        sx={{
          bgcolor: "#f8fafc",
          borderBottom: "1px solid #e2e8f0",
          display: "flex",
          alignItems: "center",
          gap: 1.25,
          py: 1.5,
          pr: 5,
          position: "relative",
        }}
      >
        <ScheduleIcon sx={{ color: "#f59e0b" }} />
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 800, color: "#0f172a", lineHeight: 1.15 }}>
            Vorgang verschieben?
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Bestätigung erforderlich
          </Typography>
        </Box>

        <IconButton
          aria-label="close"
          onClick={onClose}
          size="small"
          sx={{
            position: "absolute",
            right: 12,
            top: 12,
            color: "#64748b",
            "&:hover": { bgcolor: "#e2e8f0" },
          }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ py: 3, px: 3 }}>
        <Box sx={{ mb: 3 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
            Auftrag
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 700, color: "#0f172a" }}>
            {auftrag || jobId}
          </Typography>
        </Box>

        <Divider sx={{ my: 2 }} />

        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
              Von
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600, color: "#64748b" }}>
              {originalStart ? new Date(originalStart).toLocaleString("de-DE", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              }) : "—"}
            </Typography>
          </Box>

          <ArrowForwardIcon sx={{ color: "#94a3b8", mt: 2 }} />

          <Box sx={{ flex: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
              Nach
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 700, color: "#0f172a" }}>
              {newStart ? new Date(newStart).toLocaleString("de-DE", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              }) : "—"}
            </Typography>
          </Box>
        </Box>


      </DialogContent>

      <DialogActions
        sx={{
          px: 3,
          py: 2,
          bgcolor: "#f8fafc",
          borderTop: "1px solid #e2e8f0",
        }}
      >
        <Button
          onClick={onClose}
          sx={{
            color: "#64748b",
            borderRadius: 2,
            fontWeight: 700,
            px: 3,
            py: 1,
            textTransform: "none",
            "&:hover": { bgcolor: "#e2e8f0" },
          }}
        >
          Abbrechen
        </Button>

        <Button
          variant="contained"
          onClick={onConfirm}
          sx={{
            bgcolor: "#f59e0b",
            borderRadius: 2,
            fontWeight: 800,
            px: 3,
            py: 1,
            textTransform: "none",
            "&:hover": { bgcolor: "#d97706" },
          }}
        >
          Verschieben
        </Button>
      </DialogActions>
    </Dialog>
  );
}
