import { useEffect } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppGate } from "./components/AppGate";
import { ProjectContextBar } from "./components/ProjectContextBar";
import { Sidebar } from "./components/Sidebar";
import { TitleBar } from "./components/TitleBar";
import History from "./screens/History";
import HubLibrary from "./screens/HubLibrary";
import LiveRun from "./screens/LiveRun";
import NewProject from "./screens/NewProject";
import NewScenario from "./screens/NewScenario";
import ProjectEnvironments from "./screens/ProjectEnvironments";
import Projects from "./screens/Projects";
import Report from "./screens/Report";
import { useAppStore } from "./store";

function App(): JSX.Element {
	const loadProjects = useAppStore((s) => s.loadProjects);
	useEffect(() => {
		loadProjects();
	}, [loadProjects]);

	return (
		<HashRouter>
			<div className="otl-root">
				<TitleBar />
				<ProjectContextBar />
				<div className="otl-app">
					<Sidebar />
					<main className="otl-main">
						<AppGate>
							<Routes>
								<Route
									path="/"
									element={<Navigate to="/scenarios" replace />}
								/>
								<Route path="/scenarios" element={<HubLibrary />} />
								<Route path="/scenarios/new" element={<NewScenario />} />
								<Route path="/run/:runId" element={<LiveRun />} />
								<Route path="/report/:runId" element={<Report />} />
								<Route path="/reports" element={<History />} />
								<Route path="/projects" element={<Projects />} />
								<Route path="/projects/new" element={<NewProject />} />
								<Route
									path="/projects/:id/environments"
									element={<ProjectEnvironments />}
								/>
							</Routes>
						</AppGate>
					</main>
				</div>
			</div>
		</HashRouter>
	);
}

export default App;
