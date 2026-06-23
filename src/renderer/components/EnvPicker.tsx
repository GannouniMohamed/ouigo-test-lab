import { useEffect, useState } from "react";
import type { Environment } from "../../shared/types";

export function EnvPicker({
	value,
	onChange,
}: {
	value: string;
	onChange: (id: string) => void;
}): JSX.Element {
	const [environments, setEnvironments] = useState<Environment[]>([]);

	useEffect(() => {
		window.api.listEnvironments().then((envs) => setEnvironments(envs));
	}, []);

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
