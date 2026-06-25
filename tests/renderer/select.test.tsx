import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Select } from "../../src/renderer/components/Select";

const options = [
	{ value: "a", label: "Alpha" },
	{ value: "b", label: "Bravo" },
	{ value: "c", label: "Charlie" },
];

function renderSelect(
	props: Partial<React.ComponentProps<typeof Select>> = {},
) {
	const onChange = props.onChange ?? vi.fn();
	render(
		<Select
			ariaLabel="Sélecteur"
			value={props.value ?? "b"}
			onChange={onChange}
			options={props.options ?? options}
			placeholder={props.placeholder}
			className={props.className}
		/>,
	);
	return onChange;
}

describe("Select", () => {
	it("affiche le label de l'option sélectionnée sur le trigger", () => {
		renderSelect({ value: "c" });
		expect(
			screen.getByRole("button", { name: /sélecteur/i }).textContent,
		).toContain("Charlie");
	});

	it("affiche le placeholder quand la valeur ne correspond à aucune option", () => {
		renderSelect({ value: "", placeholder: "Choisir" });
		expect(
			screen.getByRole("button", { name: /sélecteur/i }).textContent,
		).toContain("Choisir");
	});

	it("ouvre la listbox au clic et liste les options", () => {
		renderSelect();
		expect(screen.queryByRole("listbox")).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: /sélecteur/i }));
		expect(screen.getByRole("listbox")).toBeTruthy();
		const labels = screen
			.getAllByRole("option")
			.map(
				(o) => o.querySelector(".otl-select__option-label")?.textContent ?? "",
			);
		expect(labels).toEqual(["Alpha", "Bravo", "Charlie"]);
	});

	it("marque l'option sélectionnée avec aria-selected", () => {
		renderSelect({ value: "b" });
		fireEvent.click(screen.getByRole("button", { name: /sélecteur/i }));
		const selected = screen
			.getAllByRole("option")
			.find((o) => o.getAttribute("aria-selected") === "true");
		expect(
			selected?.querySelector(".otl-select__option-label")?.textContent,
		).toBe("Bravo");
	});

	it("clic sur une option appelle onChange et ferme la listbox", () => {
		const onChange = renderSelect({ value: "b" });
		fireEvent.click(screen.getByRole("button", { name: /sélecteur/i }));
		fireEvent.click(screen.getByRole("option", { name: "Alpha" }));
		expect(onChange).toHaveBeenCalledWith("a");
		expect(screen.queryByRole("listbox")).toBeNull();
	});

	it("ferme la listbox sur Escape", () => {
		renderSelect();
		const trigger = screen.getByRole("button", { name: /sélecteur/i });
		fireEvent.click(trigger);
		expect(screen.getByRole("listbox")).toBeTruthy();
		fireEvent.keyDown(trigger, { key: "Escape" });
		expect(screen.queryByRole("listbox")).toBeNull();
	});

	it("ferme la listbox au clic à l'extérieur", () => {
		renderSelect();
		fireEvent.click(screen.getByRole("button", { name: /sélecteur/i }));
		expect(screen.getByRole("listbox")).toBeTruthy();
		fireEvent.mouseDown(document.body);
		expect(screen.queryByRole("listbox")).toBeNull();
	});

	it("ouvre avec ArrowDown et sélectionne avec Enter au clavier", () => {
		const onChange = renderSelect({ value: "a" });
		const trigger = screen.getByRole("button", { name: /sélecteur/i });
		fireEvent.keyDown(trigger, { key: "ArrowDown" });
		expect(screen.getByRole("listbox")).toBeTruthy();
		// highlight starts at selected (a), ArrowDown -> b
		fireEvent.keyDown(trigger, { key: "ArrowDown" });
		fireEvent.keyDown(trigger, { key: "Enter" });
		expect(onChange).toHaveBeenCalledWith("b");
		expect(screen.queryByRole("listbox")).toBeNull();
	});

	it("ne plante pas avec une liste d'options vide", () => {
		renderSelect({ options: [], value: "", placeholder: "Vide" });
		const trigger = screen.getByRole("button", { name: /sélecteur/i });
		fireEvent.click(trigger);
		expect(screen.queryAllByRole("option")).toHaveLength(0);
	});
});
