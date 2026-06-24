import { GROUP_COLORS } from "../../shared/groups";

export function ColorPalette({
	value,
	onChange,
}: {
	value: string;
	onChange: (c: string) => void;
}): JSX.Element {
	return (
		<div className="otl-swatches">
			{GROUP_COLORS.map((c) => (
				<button
					key={c}
					type="button"
					aria-label={`Couleur ${c}`}
					aria-pressed={value === c}
					className={
						value === c ? "otl-swatch otl-swatch--active" : "otl-swatch"
					}
					style={{ background: c }}
					onClick={() => onChange(c)}
				/>
			))}
		</div>
	);
}
