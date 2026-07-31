import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import styles from "../app/App.module.css";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  failed: boolean;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  override state: AppErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Atria renderer failed", error, info.componentStack);
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className={styles.appFailure} role="alert">
        <AlertTriangle size={23} />
        <div>
          <strong>Atria could not display this view</strong>
          <span>Your Workspace files were not changed. Reload the interface to continue.</span>
        </div>
        <button type="button" onClick={() => window.location.reload()}>
          <RefreshCw size={14} />
          <span>Reload Atria</span>
        </button>
      </main>
    );
  }
}
