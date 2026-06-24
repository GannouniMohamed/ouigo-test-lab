import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PlatformIcon } from "../../src/renderer/components/PlatformIcon";

describe("PlatformIcon", () => {
	it("rend une icône avec un libellé accessible par plateforme", () => {
		const { getByLabelText, rerender } = render(
			<PlatformIcon platform="web" size={16} />,
		);
		expect(getByLabelText("Web")).toBeTruthy();
		rerender(<PlatformIcon platform="responsive" size={16} />);
		expect(getByLabelText("Responsive")).toBeTruthy();
		rerender(<PlatformIcon platform="mobile" size={16} />);
		expect(getByLabelText("Mobile")).toBeTruthy();
	});
});
