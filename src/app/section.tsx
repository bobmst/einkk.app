"use client";
// One part of the page that can fail on its own (#90): if what it draws throws, it says so in
// one line with a reload button, and the rest of the page (the server tabs, the other
// cards) stays usable. Keyed by the parent (the server, the season), so following another
// server tries again.
import { Component, type ReactNode } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";

interface Props {
  message: string;
  reload: string;
  children: ReactNode;
}

export default class Section extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    console.error("section failed to render", error);
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <Alert severity="error" action={
        <Button color="inherit" size="small" onClick={() => window.location.reload()}>{this.props.reload}</Button>
      }>
        {this.props.message}
      </Alert>
    );
  }
}
