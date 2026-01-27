import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  AppBar,
  Toolbar,
  Box,
  Button,
  Paper,
  Typography,
  MenuList,
  MenuItem,
  Divider,
  Chip,
  IconButton,
  Menu,
} from "@mui/material";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import AccountCircleOutlinedIcon from "@mui/icons-material/AccountCircleOutlined";

import { NAV } from "./navConfig";
import logo from "../assets/logo.svg";
import { useScenario } from "../context/ScenarioContext";

function isActivePath(pathname, to) {
  if (to === "/") return pathname === "/";
  return pathname === to || pathname.startsWith(to + "/");
}

export default function TopNavBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const { scenario, setScenario, scenarios, refreshScenarios } = useScenario();

  // ---- Scenario menu ----
  const [scenarioAnchor, setScenarioAnchor] = React.useState(null);
  const scenarioOpen = Boolean(scenarioAnchor);

  const openScenarioMenu = async (e) => {
    setScenarioAnchor(e.currentTarget);
    try {
      await refreshScenarios();
    } catch {}
  };
  const closeScenarioMenu = () => setScenarioAnchor(null);

  const scenarioOptions = scenarios || [];

  // ---- Account menu ----
  const [accountAnchor, setAccountAnchor] = React.useState(null);
  const accountOpen = Boolean(accountAnchor);

  const openAccountMenu = (e) => setAccountAnchor(e.currentTarget);
  const closeAccountMenu = () => setAccountAnchor(null);

  // ---- Hover dropdown for top items ----
  const [openKey, setOpenKey] = React.useState(null);
  const anchorRefs = React.useRef({});

  const closeTimer = React.useRef(null);
  const openTimer = React.useRef(null);

  const clearTimers = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    if (openTimer.current) clearTimeout(openTimer.current);
  };

  const scheduleOpen = (key) => {
    clearTimers();
    openTimer.current = setTimeout(() => setOpenKey(key), 70);
  };

  const scheduleClose = () => {
    clearTimers();
    closeTimer.current = setTimeout(() => setOpenKey(null), 120);
  };

  const handleNavigate = (to) => {
    setOpenKey(null);
    navigate(to);
  };

  const hoverMenu =
    NAV.find((x) => x.label === openKey && x.children)?.children || [];
  const anchorEl = openKey ? anchorRefs.current[openKey] : null;
  const anchorRect = anchorEl?.getBoundingClientRect();

  return (
    <AppBar
      position="static"
      color="inherit"
      elevation={0}
      onMouseLeave={scheduleClose}
      sx={{
        bgcolor: "#fff",
        borderBottom: "1px solid #e2e8f0",
        overflow: "visible",
      }}
    >
      <Toolbar
        sx={{
          // ✅ compact baseline + slightly taller on big monitors
          minHeight: { xs: 46, md: 48, lg: 52 },
          px: { xs: 1, sm: 1.5, md: 2 },
          gap: 1,
          overflow: "visible",
        }}
      >
        {/* LEFT: Logo */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            minWidth: { xs: 52, sm: 165 },
          }}
        >
          <Box
            component={Link}
            to="/"
            sx={{
              display: "flex",
              alignItems: "center",
              textDecoration: "none",
              px: { xs: 0.75, sm: 1 },
              py: 0.45,

            }}
          >
            <Box
              component="img"
              src={logo}
              alt="X-Quadrat"
              sx={{
                height: { xs: 26, md: 28, lg: 30 }, // ✅ responsive logo size
                width: "auto",
                display: "block",
              }}
            />
          </Box>
        </Box>

        {/* CENTER: Main nav */}
        <Box
          sx={{
            flex: 1,
            display: "flex",
            justifyContent: { xs: "flex-start", lg: "center" },
            overflowX: "auto",
            overflowY: "visible",
            mx: { xs: 0.5, sm: 1, lg: 2 },
            "&::-webkit-scrollbar": { display: "none" },
            scrollbarWidth: "none",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
            {NAV.map((item) => {
              const active = isActivePath(pathname, item.to);
              const hasChildren = !!item.children?.length;

              return (
                <Button
                  key={item.label}
                  component={Link}
                  to={item.to}
                  disableRipple
                  ref={(el) => (anchorRefs.current[item.label] = el)}
                  onMouseEnter={() =>
                    hasChildren ? scheduleOpen(item.label) : setOpenKey(null)
                  }
                  onFocus={() =>
                    hasChildren ? scheduleOpen(item.label) : setOpenKey(null)
                  }
                  sx={{
                    textTransform: "none",
                    whiteSpace: "nowrap",

                    // ✅ responsive typography + compact height
                    fontSize: { xs: "0.86rem", md: "0.9rem", lg: "0.92rem" },
                    fontWeight: active ? 800 : 650,

                    color: active ? "#0b1220" : "#334155",

                    // ✅ key to reducing height
                    minHeight: { xs: 34, md: 36 },
                    px: { xs: 0.9, md: 1.05 },
                    py: { xs: 0.55, md: 0.6 },

                    borderRadius: 1.5,
                    "&:hover": { bgcolor: "rgba(15, 23, 42, 0.04)" },
                  }}
                  endIcon={
                    hasChildren ? (
                      <KeyboardArrowDownIcon
                        sx={{
                          fontSize: 18,
                          opacity: 0.8,
                          transform:
                            openKey === item.label
                              ? "rotate(180deg)"
                              : "rotate(0deg)",
                          transition: "transform 120ms ease",
                        }}
                      />
                    ) : null
                  }
                >
                  {item.label}
                </Button>
              );
            })}
          </Box>
        </Box>

        {/* RIGHT: Utilities */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            minWidth: { xs: 110, sm: 250 },
            gap: { xs: 0.75, md: 1.1 },
          }}
        >
          <Chip
            label={scenario ? `Szenario: ${scenario}` : "Szenario wählen"}
            size="small"
            onClick={openScenarioMenu}
            sx={{
              fontWeight: 750,
              bgcolor: "#f1f5f9",
              color: "#0f172a",
              borderRadius: 1.5,
              cursor: "pointer",

              // ✅ smaller chip height
              height: { xs: 28, md: 30 },

              maxWidth: { xs: 130, sm: 210 },
              "& .MuiChip-label": {
                px: { xs: 1, md: 1.25 },
                fontSize: { xs: "0.78rem", md: "0.82rem" },
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              },
              "&:hover": { bgcolor: "#e2e8f0" },
            }}
          />

          <Menu
            anchorEl={scenarioAnchor}
            open={scenarioOpen}
            onClose={closeScenarioMenu}
            PaperProps={{
              sx: {
                mt: 1,
                borderRadius: 2,
                border: "1px solid #e2e8f0",
                boxShadow: "0 20px 50px rgba(2,6,23,0.12)",
                minWidth: 260,
              },
            }}
          >
            {scenarioOptions.length === 0 ? (
              <MenuItem disabled>Keine Szenarien verfügbar</MenuItem>
            ) : (
              scenarioOptions.map((s) => (
                <MenuItem
                  key={s}
                  selected={s === scenario}
                  onClick={() => {
                    setScenario(s);
                    closeScenarioMenu();
                  }}
                  sx={{
                    fontWeight: s === scenario ? 800 : 600,
                    "&.Mui-selected": { bgcolor: "rgba(29,78,216,0.08)" },
                    "&.Mui-selected:hover": {
                      bgcolor: "rgba(29,78,216,0.12)",
                    },
                  }}
                >
                  {s}
                </MenuItem>
              ))
            )}
          </Menu>

          <Divider orientation="vertical" flexItem sx={{ my: { xs: 0.7, md: 0.9 } }} />

          <IconButton
            size="small"
            onClick={openAccountMenu}
            sx={{
              color: "#334155",
              width: { xs: 32, md: 34 },
              height: { xs: 32, md: 34 },
              borderRadius: 2,
              "&:hover": { bgcolor: "rgba(15,23,42,0.06)" },
            }}
          >
            <AccountCircleOutlinedIcon fontSize="small" />
          </IconButton>

          <Menu
            anchorEl={accountAnchor}
            open={accountOpen}
            onClose={closeAccountMenu}
            PaperProps={{
              sx: {
                mt: 1,
                borderRadius: 2,
                border: "1px solid #e2e8f0",
                boxShadow: "0 20px 50px rgba(2,6,23,0.12)",
                minWidth: 200,
              },
            }}
          >
            <MenuItem disabled>Angemeldet</MenuItem>
            <Divider />
            <MenuItem onClick={closeAccountMenu}>Abmelden</MenuItem>
          </Menu>
        </Box>
      </Toolbar>

      {/* Hover dropdown for top items */}
      {openKey && anchorRect && hoverMenu.length > 0 && (
        <Box
          onMouseEnter={clearTimers}
          onMouseLeave={scheduleClose}
          sx={{
            position: "absolute",
            top: anchorRect.bottom + window.scrollY,
            left: Math.max(16, anchorRect.left + window.scrollX),
            zIndex: 1300,
          }}
        >
          <Paper
            elevation={0}
            sx={{
              minWidth: 280,
              borderRadius: 2,
              border: "1px solid #e2e8f0",
              boxShadow: "0 20px 50px rgba(2,6,23,0.12)",
              overflow: "hidden",
              bgcolor: "#fff",
            }}
          >
            <Box sx={{ px: 2, py: 1.25 }}>
              <Typography
                variant="caption"
                sx={{ color: "#64748b", fontWeight: 800 }}
              >
                {openKey}
              </Typography>
            </Box>
            <Divider />

            <MenuList sx={{ py: 0.5 }}>
              {hoverMenu.map((child) => {
                const active = isActivePath(pathname, child.to);
                return (
                  <MenuItem
                    key={child.to}
                    onClick={() => handleNavigate(child.to)}
                    selected={active}
                    sx={{
                      py: 1.05,
                      px: 2,
                      fontSize: "0.92rem",
                      fontWeight: active ? 800 : 600,
                      color: "#0f172a",
                      "&.Mui-selected": { bgcolor: "rgba(29,78,216,0.08)" },
                      "&.Mui-selected:hover": {
                        bgcolor: "rgba(29,78,216,0.12)",
                      },
                    }}
                  >
                    {child.label}
                  </MenuItem>
                );
              })}
            </MenuList>
          </Paper>
        </Box>
      )}
    </AppBar>
  );
}
