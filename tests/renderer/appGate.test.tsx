import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppGate } from "../../src/renderer/components/AppGate";

afterEach(() => {
	// biome-ignore lint/suspicious/noExplicitAny: cleanup
	Reflect.deleteProperty((globalThis as any).window, "api");
});

it("affiche les enfants quand les navigateurs sont prêts", async () => {
	// biome-ignore lint/suspicious/noExplicitAny: test stub
	(globalThis as any).window.api = {
		browsersReady: vi.fn().mockResolvedValue(true),
		installBrowsers: vi.fn(),
	};
	render(
		<AppGate>
			<div>CONTENU</div>
		</AppGate>,
	);
	expect(await screen.findByText("CONTENU")).toBeInTheDocument();
	expect(window.api.installBrowsers).not.toHaveBeenCalled();
});

it("installe puis affiche les enfants quand absents", async () => {
	// biome-ignore lint/suspicious/noExplicitAny: test stub
	(globalThis as any).window.api = {
		browsersReady: vi.fn().mockResolvedValue(false),
		installBrowsers: vi.fn().mockResolvedValue(true),
	};
	render(
		<AppGate>
			<div>CONTENU</div>
		</AppGate>,
	);
	expect(
		await screen.findByText("Installation des navigateurs"),
	).toBeInTheDocument();
	expect(await screen.findByText("CONTENU")).toBeInTheDocument();
	expect(window.api.installBrowsers).toHaveBeenCalled();
});
