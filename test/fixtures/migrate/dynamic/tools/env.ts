export const pickEnvironment = (env: Record<string, string | undefined>) => env.DOM ?? 'node';
