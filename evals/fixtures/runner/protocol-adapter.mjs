export async function estimate(request) {
	return {
		basis: "cold-start",
		reference_task_ids: [],
		assumptions: [`deterministic fixture for ${request.mode}`],
		expected_total_tokens: { low: 0, high: 0 },
		expected_duration_ms: { low: 0, high: 5000 }
	};
}

export async function run(request, estimate) {
	const preloadedSkill = request.skills.find((skill) => skill.preload);
	let selectedSkill = preloadedSkill?.name ?? null;
	if (!selectedSkill && request.prompt.includes("架構")) {
		selectedSkill = request.skills.find((skill) => skill.name === "planning-and-task-breakdown")?.name ?? null;
	}
	if (!selectedSkill && request.prompt.includes("想法")) {
		selectedSkill = request.skills.find((skill) => skill.name === "spec-driven-development")?.name ?? null;
	}
	return {
		response: `protocol fixture completed for ${request.case_id} (${request.variant}); estimate=${estimate.basis}`,
		selected_skill: selectedSkill,
		artifacts: [],
		execution: {
			provider: "fixture",
			model: "deterministic-protocol-adapter",
			reasoning: "none",
			tools: [],
			permissions: ["workspace-read"]
		},
		metrics: {
			turns: 1,
			tool_calls: 0,
			user_questions: 0,
			files_changed: 0,
			out_of_scope_changes: 0,
			input_tokens: null,
			output_tokens: null,
			total_tokens: null,
			token_measurement: "unavailable",
			token_estimation_method: null
		},
		milestones: []
	};
}
