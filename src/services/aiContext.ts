
import type { Value, Goal, Project, Task, Capacity } from '../types/planner';
import type { Message } from './types';

// Initial greeting based on time of day
export const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning! Based on your schedule and energy patterns, I suggest starting the day by making a healthy breakfast. This will support your Health & Wellbeing value and set you up well for the day ahead. How are you feeling this morning?";
    if (hour < 17) return "Good afternoon! How is your day progressing so far? Looking at your priorities, do you feel aligned with your goals, or should we adjust our focus for the next few hours?";
    return "Good evening! I hope you've had a productive day. Have you eaten enough today? This is a great time to reflect on what you've accomplished and start winding down or picking one small, meaningful task to close the day.";
};

interface ContextData {
    values: Value[];
    goals: Goal[];
    projects: Project[];
    tasks: Task[];
    capacity: Capacity;
    stylePrompt?: string;
}

export const buildSystemContext = (currentConversation: Message[], data: ContextData) => {
    const { values, goals, projects, tasks, capacity } = data;

    const detectFocus = () => {
        const recentText = currentConversation.slice(-3).map((m: Message) => m.content.toLowerCase()).join(' ');
        const focusedTask = tasks.find(t => recentText.includes(t.name.toLowerCase()));
        const focusedProject = projects.find(p => recentText.includes(p.name.toLowerCase())) ||
            (focusedTask ? projects.find(p => p.id === focusedTask.projectId) : null);
        const focusedGoal = goals.find(g => recentText.includes(g.name.toLowerCase())) ||
            (focusedProject ? goals.find(g => g.id === focusedProject.goalId) : null);
        const focusedValue = values.find(v => recentText.includes(v.name.toLowerCase())) ||
            (focusedGoal ? values.find(v => v.id === focusedGoal.valueId) : null);
        return { focusedValue, focusedGoal, focusedProject, focusedTask };
    };

    const { focusedValue, focusedGoal, focusedProject, focusedTask } = detectFocus();

    const formatLineage = (v: Value | undefined | null, g: Goal | undefined | null, p: Project | undefined | null, t: Task | undefined | null) => {
        let res = `FOCUS LINEAGE:\n`;
        if (v) res += `- VALUE: ${v.name}${v.description ? ` (${v.description})` : ''}\n`;
        if (g) res += `  - GOAL: ${g.name}${g.description ? ` (${g.description})` : ''}\n`;
        if (p) res += `    - PROJECT: ${p.name}${p.description ? ` (${p.description})` : ''}\n`;
        if (t) res += `      - TASK: ${t.name}${t.description ? ` (${t.description})` : ''}\n`;
        return res;
    };

    const valuesList = values.map(v =>
        v.id === focusedValue?.id ? `- ${v.name} (id: ${v.id}) [IN FOCUS]` : `- ${v.name} (id: ${v.id})`
    ).join('\n');

    const goalsList = goals.map(g => {
        const value = values.find(v => v.id === g.valueId);
        return g.id === focusedGoal?.id
            ? `- ${g.name} (id: ${g.id}, supports: ${value?.name}) [IN FOCUS]`
            : `- ${g.name} (id: ${g.id}, supports: ${value?.name})`;
    }).join('\n');

    const projectsList = projects.map(p => {
        const goal = goals.find(g => g.id === p.goalId);
        return p.id === focusedProject?.id
            ? `- ${p.name} (id: ${p.id}, goal: ${goal?.name}) [IN FOCUS]`
            : `- ${p.name} (id: ${p.id}, goal: ${goal?.name})`;
    }).join('\n');

    const tasksList = tasks.filter(t => !t.completed).map(t => {
        const project = projects.find(p => p.id === t.projectId);
        return t.id === focusedTask?.id
            ? `- ${t.name} (id: ${t.id}) [${project?.name}] (importance: ${t.importance}, urgency: ${t.urgency}, type: ${t.workType}) [IN FOCUS]`
            : `- ${t.name} (id: ${t.id}) [${project?.name}] (importance: ${t.importance}, urgency: ${t.urgency}, type: ${t.workType})`;
    }).join('\n');

    let lineageHeader = "";
    if (focusedValue || focusedGoal || focusedProject || focusedTask) {
        lineageHeader = `\n${formatLineage(focusedValue, focusedGoal, focusedProject, focusedTask)}\n`;
    }

    return `You are a personal day planning assistant helping the user navigate their day thoughtfully.
${lineageHeader}
Current Context:
VALUES:
${valuesList}

GOALS:
${goalsList}

PROJECTS:
${projectsList}

PENDING TASKS:
${tasksList}

CURRENT CAPACITY:
- Energy level: ${capacity.energy}/5
- Mood: ${capacity.mood}/5
- Stress level: ${capacity.stress}/5
- Hours available today: ${capacity.timeAvailable}
- Physical state: ${capacity.physicalState}/5

Your role:
1. Proactively suggest what the user should do next based on their capacity, values, and priorities
2. Help them assess their current state by asking natural questions (not formal assessments)
3. Adapt recommendations to how they're feeling
4. Celebrate completions and help them reflect on progress
5. Keep the conversation natural and supportive
6. When they complete tasks, acknowledge the connection to their values and goals
7. If their capacity seems low, suggest easier tasks or breaks
8. Help them make intentional choices about their day
9. USE ITEM DESCRIPTIONS IF PROVIDED TO UNDERSTAND THE "WHY" AND "HOW" OF TASKS.

You have access to tools to:
- Mark tasks as complete or incomplete
- Update the user's capacity assessment
- Add new tasks to their list

Use these tools when the user indicates they've completed something, their state has changed, or they want to add a new task. Be proactive but natural about using these tools.

Be conversational, empathetic, and actionable. Make specific suggestions tied to their actual tasks and values.

${data.stylePrompt ? `\nUSER STYLE INSTRUCTIONS:\n${data.stylePrompt}` : ''}`;
};
