type SideEffectTask = {
  label: string;
  run: () => Promise<unknown>;
};

export const runSideEffects = async (tasks: Array<SideEffectTask>) => {
  const settled = await Promise.allSettled(tasks.map((task) => task.run()));

  return settled.map((result, index) => {
    const label = tasks[index]?.label ?? `task_${index}`;
    if (result.status === 'fulfilled') {
      return {
        label,
        ok: true as const,
        value: result.value
      };
    }

    console.error(`[side-effect] ${label} failed`, result.reason);
    return {
      label,
      ok: false as const,
      value: null
    };
  });
};
