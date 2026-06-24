import { useEffect, useState } from "react";
import type { Environment } from "../../shared/types";
import { useAppStore } from "../store";

export function EnvPicker({
	value,
	onChange,
}: {
	value: string;
	onChange: (id: string) => void;
}): JSX.Element {
	const activeProjectId = useAppStore((s) => s.activeProjectId);
	const [environments, setEnvironments] = useState<Environment[]>([]);

	useEffect(() => {
		if (!activeProjectId) {
			setEnvironments([]);
			return;
		}
		window.api
			.listEnvironments(activeProjectId)
			.then((envs) => setEnvironments(envs));
	}, [activeProjectId]);

	return (
		<select
			className="otl-select"
			value={value}
			onChange={(e) => onChange(e.target.value)}
		>
			<option value="">Environnement par défaut</option>
			{environments.map((env) => (
				<option key={env.id} value={env.id}>
					{env.label}
				</option>
			))}
		</select>
	);
}
