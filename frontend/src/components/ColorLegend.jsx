// src/components/ColorLegend.jsx
import { Box, Typography, Stack, Paper, IconButton, Collapse } from "@mui/material";
import { InfoOutlined } from "@mui/icons-material";
import { useState } from "react";

export default function ColorLegend({ showSelectedOrder = false }) {  // ✅ New prop
  const [open, setOpen] = useState(false);

  const legendItems = [
    {
      color: 'rgba(220, 38, 38, 0.9)',
      border: '#991b1b',
      label: 'OS5 - Dringend',
      desc: 'Höchste Priorität (Orderstate 5)'
    },
    {
      color: 'rgba(249, 115, 22, 0.85)',
      border: '#c2410c',
      label: 'Fremdvergabe',
      desc: 'Externe Bearbeitung'
    },
    {
      color: 'rgba(30, 58, 138, 0.7)',
      border: '#1e40af',
      label: 'PG0 - Engpass (pünktlich)',
      desc: 'Bottleneck-Operationen, rechtzeitig'
    },
    {
      color: 'rgba(30, 58, 138, 1.0)',
      border: '#1e3a8a',
      label: 'PG0 - Engpass (verspätet)',
      desc: 'Bottleneck, Start > Spätester Termin',
      highlight: true
    },
    {
      color: 'rgba(20, 184, 166, 0.7)',
      border: '#14b8a6',
      label: 'PG1 - Nicht-Engpass (pünktlich)',
      desc: 'Standard-Operationen, rechtzeitig'
    },
    {
      color: 'rgba(20, 184, 166, 1.0)',
      border: '#0f766e',
      label: 'PG1 - Nicht-Engpass (verspätet)',
      desc: 'Standard-Op, Start > Spätester Termin',
      highlight: true
    },
    {
      color: 'rgba(148, 163, 184, 0.5)',
      border: '#94a3b8',
      label: 'PG2 - Unbegrenzt',
      desc: 'Parallele Kapazität, kein Engpass'
    },
    {
      color: 'transparent',
      border: '#f59e0b',
      label: '🟡 Geändert',
      desc: 'Verschoben (ungespeichert)',
      dashed: true,
      highlight: true
    },
  ];

  // ✅ Add selected order item if in context view
  if (showSelectedOrder) {
    legendItems.unshift({
      color: 'rgba(34, 197, 94, 0.95)',
      border: '#16a34a',
      label: '🟢 Ausgewählter Auftrag',
      desc: 'Hervorgehoben im Maschinenkontext',
      highlight: true
    });
  }

  return (
    <Box sx={{ position: 'relative' }}>
      <IconButton
        size="small"
        onClick={() => setOpen(!open)}
        sx={{
          bgcolor: open ? 'primary.main' : 'grey.200',
          color: open ? 'white' : 'grey.700',
          '&:hover': { bgcolor: open ? 'primary.dark' : 'grey.300' }
        }}
      >
        <InfoOutlined fontSize="small" />
      </IconButton>

      <Collapse in={open}>
        <Paper
          elevation={3}
          sx={{
            position: 'absolute',
            top: 40,
            right: 0,
            width: 300,
            p: 2,
            zIndex: 1000,
            bgcolor: 'white',
            maxHeight: 500,  // ✅ Increased for extra item
            overflow: 'auto'
          }}
        >
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>
            Farblegende
          </Typography>

          <Stack spacing={1}>
            {legendItems.map((item, idx) => (
              <Box
                key={idx}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  bgcolor: item.highlight ? 'rgba(251, 191, 36, 0.1)' : 'transparent',
                  p: 0.5,
                  borderRadius: 1
                }}
              >
                <Box
                  sx={{
                    width: 28,
                    height: 18,
                    bgcolor: item.color,
                    border: `2px ${item.dashed ? 'dashed' : 'solid'} ${item.border}`,
                    borderRadius: 0.5,
                    flexShrink: 0
                  }}
                />
                <Box sx={{ flex: 1 }}>
                  <Typography variant="caption" fontWeight={600} display="block">
                    {item.label}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: '0.7rem' }}>
                    {item.desc}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Stack>

          <Box sx={{ mt: 2, pt: 1, borderTop: '1px solid #e5e7eb' }}>
            <Typography variant="caption" color="text.secondary">
              <strong>Tipp:</strong> Dunkler = verspätet
            </Typography>
          </Box>
        </Paper>
      </Collapse>
    </Box>
  );
}