import { getUserConfig } from './userConfig.js';
import { getProjects } from './db/queries.js';
import { executeVerb, resolveProjectFuzzy } from './verbEngine.js';
import { getProjectAliases } from './db/queries.js';

interface WorkflowStep {
  verb: string;
  project: string;
}

interface Workflow {
  name: string;
  trigger: { verb: string; project?: string };
  then: WorkflowStep[];
}

interface WorkflowResult {
  workflow: string;
  steps: { verb: string; project: string; ok: boolean; message: string }[];
}

// Safety limits
const MAX_STEPS = 10;
const MAX_TIMEOUT_MS = 60000;

/**
 * Load workflows from ~/.devdock/config.json
 */
function loadWorkflows(): Workflow[] {
  const config = getUserConfig() as any;
  return (config.workflows || []) as Workflow[];
}

/**
 * Check if a verb execution triggers any workflow.
 * Called after each verb completes.
 */
export function checkTrigger(verb: string, projectId?: string): Workflow | null {
  const workflows = loadWorkflows();
  for (const wf of workflows) {
    if (wf.trigger.verb === verb) {
      // If trigger specifies a project, it must match
      if (wf.trigger.project && wf.trigger.project !== projectId) continue;
      return wf;
    }
  }
  return null;
}

/**
 * Check if a verb name is a custom workflow trigger (not a built-in verb).
 */
export function isWorkflowVerb(verb: string): boolean {
  const workflows = loadWorkflows();
  return workflows.some(wf => wf.trigger.verb === verb && !wf.trigger.project);
}

/**
 * Get workflow by custom verb name.
 */
export function getWorkflowByVerb(verb: string): Workflow | null {
  const workflows = loadWorkflows();
  return workflows.find(wf => wf.trigger.verb === verb && !wf.trigger.project) || null;
}

/**
 * Execute a workflow's steps sequentially.
 * Returns results for each step.
 */
export async function executeWorkflow(workflow: Workflow): Promise<WorkflowResult> {
  const steps = workflow.then.slice(0, MAX_STEPS);
  const results: WorkflowResult['steps'] = [];
  const startTime = Date.now();

  const projects = getProjects();
  const aliasMap = getProjectAliases();

  for (const step of steps) {
    // Timeout check
    if (Date.now() - startTime > MAX_TIMEOUT_MS) {
      results.push({ verb: step.verb, project: step.project, ok: false, message: 'Workflow timeout (60s)' });
      break;
    }

    try {
      // Resolve project
      const resolved = resolveProjectFuzzy(step.project, projects, aliasMap);
      if (!resolved.project) {
        results.push({ verb: step.verb, project: step.project, ok: false, message: `Project not found: ${step.project}` });
        continue;
      }

      const result = await executeVerb(step.verb, resolved.project, { source: 'workflow' });
      results.push({
        verb: step.verb,
        project: resolved.project.name,
        ok: result.ok,
        message: result.message || '',
      });
    } catch (e: any) {
      results.push({ verb: step.verb, project: step.project, ok: false, message: e.message || 'Error' });
    }
  }

  return { workflow: workflow.name, steps: results };
}

/**
 * List all configured workflows (for palette display).
 */
export function listWorkflows(): { name: string; trigger: string; stepCount: number }[] {
  return loadWorkflows().map(wf => ({
    name: wf.name,
    trigger: wf.trigger.project ? `${wf.trigger.verb} ${wf.trigger.project}` : wf.trigger.verb,
    stepCount: wf.then.length,
  }));
}
