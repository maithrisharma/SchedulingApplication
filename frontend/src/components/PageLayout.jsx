// src/components/PageLayout.jsx
import React from "react";
import { Box, Typography } from "@mui/material";
import { pageX, pageY, headerGap, contentMaxWidth } from "../theme/layoutTokens";

export default function PageLayout({
  title,
  subtitle,
  children,
  headerAlign = "center",
  maxWidth,
  headerRight, // ✅ NEW
}) {
  const hasHeader = Boolean(title || subtitle || headerRight);

  return (
    <Box
      sx={{
        bgcolor: "#f8fafc",
        minHeight: "calc(100vh - 56px)",
        display: "flex",
        justifyContent: "center",
        px: pageX,
        py: pageY,
      }}
    >
      <Box sx={{ width: "100%", maxWidth: maxWidth ?? contentMaxWidth }}>
        {hasHeader && (
          <Box sx={{ mb: headerGap }}>
            {/* ✅ 3-column header grid: left spacer | centered title | right actions */}
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "1fr auto 1fr",
                alignItems: "center",
                columnGap: 2,
              }}
            >
              <Box />
              <Box sx={{ textAlign: headerAlign }}>
                {title && (
                  <Typography
                    component="h1"
                    sx={{
                      fontWeight: 850,
                      color: "#0f172a",
                      lineHeight: 1.15,
                      letterSpacing: "-0.02em",
                      fontSize: "clamp(1.35rem, 1.1rem + 1.2vw, 2.25rem)",
                    }}
                  >
                    {title}
                  </Typography>
                )}

                {subtitle && (
                  <Typography
                    sx={{
                      color: "#64748b",
                      mt: 0.75,
                      lineHeight: 1.35,
                      fontSize: "clamp(0.92rem, 0.88rem + 0.4vw, 1.10rem)",
                    }}
                  >
                    {subtitle}
                  </Typography>
                )}
              </Box>

              <Box
                sx={{
                  justifySelf: "end",
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  flexWrap: "wrap",
                  rowGap: 0.5,
                }}
              >
                {headerRight}
              </Box>
            </Box>
          </Box>
        )}

        {children}
      </Box>
    </Box>
  );
}
