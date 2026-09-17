import { CompanyOSClient } from "../typescript/dist/index.js";

const client = CompanyOSClient.fromEnv();
console.log(await client.health());

const company = await client.createCompany({ slug: "acme", display_name: "Acme" });
const companyId = company.company.id;
const goal = await client.createGoal(companyId, { title: "Launch customer onboarding v1" });
const task = await client.createTask(companyId, {
  title: "Draft onboarding checklist",
  specification: "Create a concise checklist for first-time customers.",
  primary_goal_id: goal.goal.id,
  priority: 10,
});
const reply = await client.agentChat(companyId, {
  message: "What is the highest-priority work?",
  actor: "operator",
});

console.log(task.task.id);
console.log(reply.thread_id);
