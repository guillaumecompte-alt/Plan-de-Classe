import { Component, type ReactNode } from "react";

import { exportBackup, loadState, STORAGE_V1, STORAGE_V2 } from "@/lib/plan";

/**
 * Écran affiché si l'application plante. Il permet toujours de télécharger
 * une sauvegarde des classes, pour ne rien perdre.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error) {
    console.error(error);
  }

  private downloadBackup = () => {
    try {
      const state = loadState(localStorage.getItem(STORAGE_V2), localStorage.getItem(STORAGE_V1));
      const blob = new Blob([exportBackup(state.classes)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "plans-de-classe-secours.json";
      a.click();
    } catch {
      /* rien à sauvegarder */
    }
  };

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold">Un problème est survenu</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Vos classes sont toujours enregistrées dans ce navigateur. Rechargez la page ; si le
            problème revient, téléchargez une sauvegarde pour ne rien perdre.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button
              onClick={() => window.location.reload()}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              Recharger
            </button>
            <button
              onClick={this.downloadBackup}
              className="rounded-md border px-4 py-2 text-sm font-semibold"
            >
              Télécharger une sauvegarde
            </button>
          </div>
        </div>
      </div>
    );
  }
}
