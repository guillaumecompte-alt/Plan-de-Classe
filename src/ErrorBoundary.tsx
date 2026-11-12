import { Component, type ReactNode } from "react";

/** Écran affiché si l'application plante. Les classes restent enregistrées dans le navigateur. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error) {
    console.error(error);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold">Un problème est survenu</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Vos classes sont toujours enregistrées dans ce navigateur. Rechargez la page.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Recharger
          </button>
        </div>
      </div>
    );
  }
}
