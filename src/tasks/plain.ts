// eslint-disable-next-line no-control-regex
export const plain = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');
