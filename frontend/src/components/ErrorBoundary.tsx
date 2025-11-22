import { Component, type ErrorInfo, type PropsWithChildren, type ReactNode } from "react";

type ErrorBoundaryProps = PropsWithChildren<{
  fallback?: ReactNode;
  onError?: (error: unknown, info?: ErrorInfo) => void;
}>;

type ErrorBoundaryState = {
  hasError: boolean;
};

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    if (typeof console !== "undefined" && typeof console.error === "function") {
      console.error("[Echo] Component render error:", error, info?.componentStack);
    }
    if (this.props.onError) {
      this.props.onError(error, info);
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? null;
    }
    return this.props.children as ReactNode;
  }
}










