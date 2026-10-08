"use client";
// MUI theme (Material UI, the maintained sibling of the Joy UI enikk.app uses).
// Light and dark follow the viewer's system until they toggle; the colours
// match the season survey (accent #0070D7).
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider, createTheme } from "@mui/material/styles";

const theme = createTheme({
  cssVariables: { colorSchemeSelector: "class" },
  colorSchemes: {
    light: { palette: { primary: { main: "#0070D7" }, background: { default: "#f6f7f9" } } },
    dark: {
      palette: {
        primary: { main: "#4da3ff" },
        background: { default: "#0d1014", paper: "#161a20" },
      },
    },
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: "var(--font-roboto), system-ui, 'Hiragino Sans', 'Noto Sans CJK JP', 'Malgun Gothic', 'Microsoft YaHei', sans-serif",
    h1: { fontSize: "1.5rem", fontWeight: 700 },
    h2: { fontSize: "1.15rem", fontWeight: 600 },
  },
  components: {
    MuiCard: { defaultProps: { variant: "outlined" } },
    MuiButton: { defaultProps: { disableElevation: true } },
  },
});

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider theme={theme} defaultMode="system">
      <CssBaseline enableColorScheme />
      {children}
    </ThemeProvider>
  );
}
