import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { App } from "./App";

describe("App", () => {
  beforeEach(() => localStorage.clear());
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
    expect(screen.getByDisplayValue("4e A")).toBeInTheDocument();
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
});
