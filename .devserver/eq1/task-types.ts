export const EQ1_TASK_TYPES = [
    "classify",
    "evaluate",
    "summarize",
    "route",
] as const;

export type Eq1TaskType = (typeof EQ1_TASK_TYPES)[number];

export function isEq1TaskType(value: string): value is Eq1TaskType {
    return (EQ1_TASK_TYPES as readonly string[]).includes(value);
}

export function assertEq1TaskType(value: string): Eq1TaskType {
    if (!isEq1TaskType(value)) {
        throw new Error(
            `Invalid Eq1 task type: ${value}. Expected one of: ${EQ1_TASK_TYPES.join(", ")}`,
        );
    }
    return value;
}
