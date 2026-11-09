import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

  it("refuse l'export PDF tant que le nom de la classe n'est pas choisi, puis nomme le fichier", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 9, 10));
    const titles: string[] = [];
    const printSpy = vi
      .spyOn(window, "print")
      .mockImplementation(() => titles.push(document.title));
    localStorage.setItem(
      "plan-de-classe-v1",
      JSON.stringify({ className: "5e B", students: [{ id: "b", name: "PETIT Tom" }], seats: {} }),
    );
    render(<App />);
    const select = screen.getByLabelText("Nom de la classe") as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(screen.getByText("Nom (était « 5e B »)")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Exporter en PDF"));
    vi.advanceTimersByTime(300);
    expect(printSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Choisissez le nom de la classe");
    expect(select).toHaveAttribute("aria-invalid", "true");

    fireEvent.change(select, { target: { value: "6A" } });
    fireEvent.click(screen.getByText("Exporter en PDF"));
    vi.advanceTimersByTime(300);
    expect(printSpy).toHaveBeenCalledTimes(1);
    expect(titles).toEqual(["6A_plandeclasse_09.11.2026"]);
    expect(document.title).not.toBe("6A_plandeclasse_09.11.2026");
    vi.useRealTimers();
  });

  it("n'autorise pas deux classes avec le même nom", () => {
    localStorage.setItem(
      "plan-de-classe-v2",
      JSON.stringify({
        currentId: "b",
        classes: [
          { id: "a", name: "3R", students: [] },
          { id: "b", name: "", students: [] },
        ],
      }),
    );
    render(<App />);
    const option = screen.getByRole("option", { name: "3R (déjà utilisée)" }) as HTMLOptionElement;
    expect(option.disabled).toBe(true);
  });
});
