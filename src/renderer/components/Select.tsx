import { useCallback, useEffect, useId, useRef, useState } from "react";

interface SelectOption {
	value: string;
	label: string;
}

interface SelectProps {
	value: string;
	onChange: (value: string) => void;
	options: SelectOption[];
	ariaLabel: string;
	placeholder?: string;
	className?: string;
}

export function Select({
	value,
	onChange,
	options,
	ariaLabel,
	placeholder,
	className,
}: SelectProps): JSX.Element {
	const [open, setOpen] = useState(false);
	const [activeIndex, setActiveIndex] = useState(-1);
	const containerRef = useRef<HTMLDivElement>(null);
	const listboxId = useId();

	const selected = options.find((o) => o.value === value);
	const triggerLabel = selected ? selected.label : (placeholder ?? "");

	const close = useCallback(() => {
		setOpen(false);
		setActiveIndex(-1);
	}, []);

	const openMenu = useCallback(() => {
		const idx = options.findIndex((o) => o.value === value);
		setActiveIndex(idx >= 0 ? idx : options.length > 0 ? 0 : -1);
		setOpen(true);
	}, [options, value]);

	const selectOption = useCallback(
		(optValue: string) => {
			onChange(optValue);
			close();
		},
		[onChange, close],
	);

	useEffect(() => {
		if (!open) return;
		function onDocMouseDown(e: MouseEvent) {
			if (
				containerRef.current &&
				!containerRef.current.contains(e.target as Node)
			) {
				close();
			}
		}
		document.addEventListener("mousedown", onDocMouseDown);
		return () => document.removeEventListener("mousedown", onDocMouseDown);
	}, [open, close]);

	function onTriggerKeyDown(e: React.KeyboardEvent) {
		if (!open) {
			if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
				e.preventDefault();
				openMenu();
			}
			return;
		}
		if (e.key === "Escape") {
			e.preventDefault();
			close();
			return;
		}
		if (options.length === 0) return;
		if (e.key === "ArrowDown") {
			e.preventDefault();
			setActiveIndex((i) => (i + 1) % options.length);
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			setActiveIndex((i) => (i - 1 + options.length) % options.length);
		} else if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			const opt = options[activeIndex];
			if (opt) selectOption(opt.value);
		}
	}

	return (
		<div className="otl-select__wrap" ref={containerRef}>
			<button
				type="button"
				className={`otl-select otl-select__trigger${
					className ? ` ${className}` : ""
				}`}
				aria-haspopup="listbox"
				aria-expanded={open}
				aria-label={ariaLabel}
				onClick={() => (open ? close() : openMenu())}
				onKeyDown={onTriggerKeyDown}
			>
				<span className="otl-select__value">{triggerLabel}</span>
				<svg
					className="otl-select__chevron"
					width="12"
					height="12"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2.2"
					strokeLinecap="round"
					strokeLinejoin="round"
					aria-hidden="true"
				>
					<polyline points="6 9 12 15 18 9" />
				</svg>
			</button>
			{open && (
				<div
					className="otl-select__panel"
					// biome-ignore lint/a11y/useSemanticElements: ARIA listbox has no native HTML equivalent outside <select>
					role="listbox"
					id={listboxId}
					aria-label={ariaLabel}
					tabIndex={-1}
				>
					{options.map((opt, i) => {
						const isSelected = opt.value === value;
						const isActive = i === activeIndex;
						return (
							// biome-ignore lint/a11y/useFocusableInteractive: focus stays on the trigger per the ARIA listbox pattern
							// biome-ignore lint/a11y/useKeyWithClickEvents: keyboard selection is handled on the trigger via onKeyDown
							<div
								key={opt.value}
								// biome-ignore lint/a11y/useSemanticElements: ARIA option has no native HTML equivalent outside <select>
								role="option"
								aria-selected={isSelected}
								className={`otl-select__option${
									isActive ? " otl-select__option--active" : ""
								}`}
								onMouseEnter={() => setActiveIndex(i)}
								onClick={() => selectOption(opt.value)}
							>
								<span className="otl-select__check" aria-hidden="true">
									{isSelected ? (
										<svg
											width="14"
											height="14"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											strokeWidth="2.4"
											strokeLinecap="round"
											strokeLinejoin="round"
											role="img"
											aria-label="sélectionné"
										>
											<title>sélectionné</title>
											<polyline points="20 6 9 17 4 12" />
										</svg>
									) : null}
								</span>
								<span className="otl-select__option-label">{opt.label}</span>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}
