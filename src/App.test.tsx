import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { downloadPlanPdf } from "./lib/pdf";

vi.mock("./lib/pdf", () => ({
  downloadPlanPdf: vi.fn(async () => "6A_plandeclasse_09.11.2026.pdf"),
}));

describe("App", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });
  afterEach(() => localStorage.clear());

  it("s'ouvre sur l'import quand aucune classe n'est enregistrée", () => {
    render(<App />);
    expect(screen.getByText("Déposez votre liste d'élèves ici")).toBeInTheDocument();
  });

  it("rouvre directement le plan enregistré (ancien format compris)", () => {
    localStorage.setItem(
      "plan-de-classe-v1",
      JSON.stringify({
        className: "4e A",
        students: [
          { id: "a", name: "MARTIN Léa", gender: "F" },
          { id: "b", name: "PETIT Tom", gender: "M" },
        ],
        seats: { "1-5-0": "a" },
      }),
    );
    render(<App />);
    expect(screen.getByText("Élèves à placer (1)")).toBeInTheDocument();
    expect((screen.getByLabelText("Nom de la classe") as HTMLSelectElement).value).toBe("4A");
    expect(screen.getByTitle("MARTIN Léa").closest("[data-drop]")).toHaveAttribute(
      "data-drop",
      "1-0-0",
    );
  });

  it("place un élève en le touchant puis en touchant une place", () => {
    localStorage.setItem(
      "plan-de-classe-v1",
      JSON.stringify({ students: [{ id: "b", name: "PETIT Tom", gender: "M" }], seats: {} }),
    );
    render(<App />);
    fireEvent.click(screen.getByTitle("PETIT Tom"));
    const seat = document.querySelector('[data-drop="0-0-0"]') as HTMLElement;
    fireEvent.click(seat);
    expect(seat).toHaveTextContent("PETIT Tom");
    expect(JSON.parse(localStorage.getItem("plan-de-classe-v2") ?? "{}").classes[0].seats).toEqual({
      "0-0-0": "b",
    });
  });

  it("refuse l'export PDF sans nom de classe, puis télécharge le PDF sans fenêtre d'impression", async () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    localStorage.setItem(
      "plan-de-classe-v1",
      JSON.stringify({ className: "5e B", students: [{ id: "b", name: "PETIT Tom" }], seats: {} }),
    );
    render(<App />);
    const select = screen.getByLabelText("Nom de la classe") as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(screen.getByText("Nom (était « 5e B »)")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Exporter en PDF"));
    expect(downloadPlanPdf).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Choisissez le nom de la classe");
    expect(select).toHaveAttribute("aria-invalid", "true");

    fireEvent.change(select, { target: { value: "6A" } });
    fireEvent.click(screen.getByText("Exporter en PDF"));
    expect(downloadPlanPdf).toHaveBeenCalledTimes(1);
    expect(vi.mocked(downloadPlanPdf).mock.calls[0]?.[0].name).toBe("6A");
    expect(
      await screen.findByText("PDF téléchargé : 6A_plandeclasse_09.11.2026.pdf"),
    ).toBeInTheDocument();

    // Ctrl+P crée aussi le PDF au lieu d'ouvrir l'impression
    fireEvent.keyDown(window, { key: "p", ctrlKey: true });
    expect(downloadPlanPdf).toHaveBeenCalledTimes(2);
    expect(printSpy).not.toHaveBeenCalled();
  });
});
