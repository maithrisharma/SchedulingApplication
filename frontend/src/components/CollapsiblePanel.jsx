// src/components/CollapsiblePanel.jsx
// ✅ Matches your existing Card style perfectly

import { Box, IconButton, Typography, Stack, Collapse, Card } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import { useState } from "react";

export default function CollapsiblePanel({
  title,
  defaultExpanded = true,
  children,
  badge = null,
  badgeColor = "#0f3b63",
  headerRight = null,
  onToggle = null,
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const handleToggle = () => {
    const newState = !expanded;
    setExpanded(newState);
    onToggle?.(newState);
  };

  return (
    <Card
      sx={{
        borderRadius: 4,  // ✅ Matches your existing Cards
        mb: 2,
        overflow: "hidden",
      }}
    >
      {/* Header - matches your existing header style */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          p: 2,
          bgcolor: "#f8fafc",  // ✅ Light background like your pages
          borderBottom: expanded ? "1px solid #e2e8f0" : "none",
          cursor: "pointer",
          transition: "background-color 0.2s ease",
          "&:hover": { bgcolor: "#f1f5f9" },
        }}
        onClick={handleToggle}
      >
        <Stack direction="row" spacing={1.5} alignItems="center">
          <IconButton
            size="small"
            sx={{
              p: 0.5,
              color: "#0f3b63",  // ✅ Your enterprise navy color
            }}
          >
            {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </IconButton>

          <Typography
            variant="h6"
            fontWeight={700}
            color="#0f172a"
            sx={{
              fontSize: "clamp(1rem, 0.95rem + 0.25vw, 1.25rem)",
            }}
          >
            {title}
          </Typography>

          {badge && (
            <Box
              sx={{
                px: 1.5,
                py: 0.5,
                bgcolor: badgeColor,  // ✅ Configurable badge color
                color: "white",
                borderRadius: 2,
                fontSize: "0.75rem",
                fontWeight: 600,
                whiteSpace: "nowrap",
              }}
            >
              {badge}
            </Box>
          )}
        </Stack>

        {headerRight && (
          <Box onClick={(e) => e.stopPropagation()}>
            {headerRight}
          </Box>
        )}
      </Box>

      {/* Content */}
      <Collapse in={expanded} timeout={300}>
        {children}
      </Collapse>
    </Card>
  );
}
